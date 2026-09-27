import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	ESL_CLASS_NUMBERS,
	ESL_LEVELS,
	classTypesForCohort,
	compareEslCohorts,
	cohortLabel,
	defaultClassName,
	isValidEslClassNumber,
	isValidEslGrade,
	isValidEslLevel,
	isValidSchoolYear
} from '../shared/esl';

/** Rejects cohorts that fall outside the ESL programme's grade/level/number grid. */
function assertValidCohortKey(key: {
	year: string;
	grade: number;
	level: string;
	classNumber: string;
}): void {
	if (!isValidSchoolYear(key.year)) {
		throw new Error('Year must be in YYYY-YYYY form');
	}
	if (!isValidEslGrade(key.grade)) {
		throw new Error('Grade must be 7, 8, 9 or 10');
	}
	if (!isValidEslLevel(key.level)) {
		throw new Error(`Level must be one of ${ESL_LEVELS.join(', ')}`);
	}
	if (!isValidEslClassNumber(key.classNumber)) {
		throw new Error(`Class number must be one of ${ESL_CLASS_NUMBERS.join(', ')}`);
	}
}

/**
 * List cohorts, optionally narrowed to a year and/or grade.
 *
 * cost: 1 indexed take of N cohorts + 1 batched read of their classes.
 * Free-Quota Impact: N is the cohort count (tens), read through `by_year` —
 * never a full scan.
 */
export const list = query({
	args: {
		year: v.optional(v.string()),
		grade: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const cohorts =
			args.year !== undefined
				? await ctx.db
						.query('esl_cohorts')
						.withIndex('by_year', (q) => q.eq('year', args.year as string))
						.take(100)
				: await ctx.db.query('esl_cohorts').withIndex('by_year').order('desc').take(100);

		const filtered =
			args.grade !== undefined ? cohorts.filter((c) => c.grade === args.grade) : cohorts;

		const classesByCohort = await Promise.all(
			filtered.map((cohort) =>
				ctx.db
					.query('esl_classes')
					.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
					.collect()
			)
		);

		return filtered
			.map((cohort, index) => ({
				...cohort,
				label: cohortLabel(cohort),
				classes: classesByCohort[index]
			}))
			.sort(compareEslCohorts);
	}
});

/** A single cohort with its classes. cost: 1 point read + 1 indexed read. */
export const getById = query({
	args: { id: v.id('esl_cohorts') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const cohort = await ctx.db.get(args.id);
		if (!cohort) return null;

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.id))
			.collect();

		return { ...cohort, label: cohortLabel(cohort), classes };
	}
});

/**
 * Create a cohort and auto-compose the classes that teach it.
 *
 * A G7/G8 cohort is born already paired: one `CLIL` and one `Comm` class
 * pointing at the same cohort, so they share the roster by construction.
 * G9/H10 cohorts get their single class.
 *
 * cost: 1 indexed uniqueness lookup + (1 + #classes) inserts.
 */
export const create = mutation({
	args: {
		year: v.string(),
		grade: v.number(),
		level: v.string(),
		classNumber: v.union(v.literal('1'), v.literal('2'))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		assertValidCohortKey(args);

		const duplicate = await ctx.db
			.query('esl_cohorts')
			.withIndex('by_year_grade_level_classNumber', (q) =>
				q
					.eq('year', args.year)
					.eq('grade', args.grade)
					.eq('level', args.level)
					.eq('classNumber', args.classNumber)
			)
			.first();
		if (duplicate) {
			throw new Error(`Cohort ${cohortLabel(args)} already exists`);
		}

		const now = Date.now();
		const cohortId = await ctx.db.insert('esl_cohorts', {
			year: args.year,
			grade: args.grade,
			level: args.level,
			classNumber: args.classNumber,
			status: 'active',
			createdAt: now
		});

		const classIds: Id<'esl_classes'>[] = [];
		for (const type of classTypesForCohort(args.grade)) {
			classIds.push(
				await ctx.db.insert('esl_classes', {
					cohortId,
					type,
					name: defaultClassName(args, type),
					status: 'active',
					createdAt: now
				})
			);
		}

		return { cohortId, classIds };
	}
});

/**
 * Update a cohort's status.
 *
 * The identity fields (year/grade/level/classNumber) are deliberately not
 * mutable here: repointing a cohort would silently move an existing roster, so
 * changing a cohort's identity means creating a new one. This keeps the
 * transfer history of each roster readable.
 *
 * cost: 1 point read + 1 patch.
 */
export const update = mutation({
	args: {
		id: v.id('esl_cohorts'),
		status: v.union(v.literal('active'), v.literal('archived'))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const cohort = await ctx.db.get(args.id);
		if (!cohort) throw new Error('Cohort not found');

		await ctx.db.patch(args.id, { status: args.status });

		return { success: true, cohortId: args.id };
	}
});

/**
 * Ensure the cohort's classes match what its grade is taught as.
 *
 * Idempotent: existing classes are kept, missing ones created, archived ones
 * restored, and classes of types the grade no longer runs are archived. This
 * is how a G7/G8 CLIL/Comm pair is repaired when one half went missing.
 *
 * cost: 1 point read + 1 indexed read + O(#classes) inserts/patches.
 */
export const pairClasses = mutation({
	args: { cohortId: v.id('esl_cohorts') },
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const cohort = await ctx.db.get(args.cohortId);
		if (!cohort) throw new Error('Cohort not found');

		const expectedTypes = classTypesForCohort(cohort.grade);
		const existing = await ctx.db
			.query('esl_classes')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.cohortId))
			.collect();

		const byType = new Map(existing.map((cls) => [cls.type, cls]));
		const now = Date.now();
		const key = {
			year: cohort.year,
			grade: cohort.grade,
			level: cohort.level,
			classNumber: cohort.classNumber
		};

		const created: Id<'esl_classes'>[] = [];
		const restored: Id<'esl_classes'>[] = [];
		for (const type of expectedTypes) {
			const existingClass = byType.get(type);
			if (!existingClass) {
				created.push(
					await ctx.db.insert('esl_classes', {
						cohortId: args.cohortId,
						type,
						name: defaultClassName(key, type),
						status: 'active',
						createdAt: now
					})
				);
			} else if (existingClass.status === 'archived') {
				await ctx.db.patch(existingClass._id, { status: 'active' });
				restored.push(existingClass._id);
			}
		}

		const archived: Id<'esl_classes'>[] = [];
		for (const existingClass of existing) {
			if (!expectedTypes.includes(existingClass.type) && existingClass.status === 'active') {
				await ctx.db.patch(existingClass._id, { status: 'archived' });
				archived.push(existingClass._id);
			}
		}

		return { created, restored, archived };
	}
});
