import { internalMutation, mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	ESL_CLASS_NUMBERS,
	ESL_GRADE10_MAX_CLASS_NUMBER,
	ESL_LEVELS,
	classTypesForCohort,
	cohortCode,
	compareEslCohorts,
	cohortLabel,
	defaultClassName,
	grade10BaseClass,
	isLevelledGrade,
	isValidEslClassNumber,
	isValidEslGrade,
	isValidEslLevel,
	isValidGrade10ClassNumber,
	isValidSchoolYear,
	planLegacyGrade10Repair,
	planLegacyLevelRepair
} from '../shared/esl';

/**
 * Rejects cohorts that fall outside the ESL programme's grade grid.
 *
 * Level is required for the levelled grades and rejected for grade 10, which
 * has none; the valid class numbers differ per grade too (1–2 vs 01–10).
 */
function assertValidCohortKey(key: {
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
}): void {
	if (!isValidSchoolYear(key.year)) {
		throw new Error('Year must be in YYYY-YYYY form');
	}
	if (!isValidEslGrade(key.grade)) {
		throw new Error('Grade must be 7, 8, 9 or 10');
	}
	if (isLevelledGrade(key.grade)) {
		if (!isValidEslLevel(key.level ?? '')) {
			throw new Error(`Level must be one of ${ESL_LEVELS.join(', ')}`);
		}
		if (!isValidEslClassNumber(key.classNumber)) {
			throw new Error(`Class number must be one of ${ESL_CLASS_NUMBERS.join(', ')}`);
		}
		return;
	}
	// Grade 10 is not levelled: a level would be meaningless, and a class
	// number outside its base classes would produce a class name that does
	// not exist in the programme.
	if (key.level) {
		throw new Error('Grade 10 has no levels');
	}
	if (!isValidGrade10ClassNumber(key.classNumber)) {
		throw new Error(`Class number must be 1-${ESL_GRADE10_MAX_CLASS_NUMBER}`);
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
				// Derived, not stored: a `code` column would be a required
				// field that every pre-existing cohort row would fail.
				code: cohortCode(cohort),
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

		return { ...cohort, code: cohortCode(cohort), label: cohortLabel(cohort), classes };
	}
});

/**
 * Create a cohort and auto-compose the classes that teach it.
 *
 * A G7/G8 cohort is born already paired: one `CLIL` and one `Comm` class
 * pointing at the same cohort, so they share the roster by construction.
 * A G10 cohort is likewise paired — its `A` and `B` sections, H101A and
 * H101B, both draw that base class's students in different rooms. A G9 cohort
 * gets its single class.
 *
 * cost: 1 indexed uniqueness lookup + (1 + #classes) inserts.
 */
export const create = mutation({
	args: {
		year: v.string(),
		grade: v.number(),
		/** Required for the levelled grades; omit for grade 10, which has none. */
		level: v.optional(v.string()),
		classNumber: v.string(),
		/** Set only by end-to-end runs, so a test cohort can be removed by tag. */
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		assertValidCohortKey(args);

		const key = {
			year: args.year,
			grade: args.grade,
			// Grade 10 stores no level at all rather than an empty string.
			...(args.level ? { level: args.level } : {}),
			// The base class is stored zero-padded, so `2` and `02` are one cohort
			// rather than two.
			classNumber: isLevelledGrade(args.grade)
				? args.classNumber
				: grade10BaseClass(args.classNumber)
		};
		const code = cohortCode(key);

		// Uniqueness. The levelled grades have a level to match on, so the
		// four-column index answers directly. Grade 10 has none, so its
		// (year, grade) cohorts are compared in memory — bounded by the
		// cohort count for one grade, not the table size (ADR-0021).
		if (isLevelledGrade(args.grade)) {
			const duplicate = await ctx.db
				.query('esl_cohorts')
				.withIndex('by_year_grade_level_classNumber', (q) =>
					q
						.eq('year', args.year)
						.eq('grade', args.grade)
						.eq('level', key.level)
						.eq('classNumber', key.classNumber)
				)
				.first();
			if (duplicate) {
				throw new Error(`Cohort ${cohortLabel(key)} already exists`);
			}
		} else {
			const sameGrade = await ctx.db
				.query('esl_cohorts')
				.withIndex('by_year_grade', (q) => q.eq('year', args.year).eq('grade', args.grade))
				.collect();
			if (sameGrade.some((cohort) => cohortCode(cohort) === code)) {
				throw new Error(`Cohort ${cohortLabel(key)} already exists`);
			}
		}

		const now = Date.now();
		const cohortId = await ctx.db.insert('esl_cohorts', {
			...key,
			status: 'active',
			createdAt: now,
			// End-to-end runs only; a real creation leaves it absent.
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});

		const classIds: Id<'esl_classes'>[] = [];
		for (const type of classTypesForCohort(args.grade)) {
			classIds.push(
				await ctx.db.insert('esl_classes', {
					cohortId,
					type,
					name: defaultClassName(key, type),
					status: 'active',
					createdAt: now
				})
			);
		}

		return { cohortId, classIds };
	}
});

/**
 * One-off repair for rows written before the grade 10 model was corrected.
 *
 * The old model had a single `H10` class type and a level on every cohort,
 * including grade 10. Grade 10 is not levelled and is taught by two sections,
 * `H10A` and `H10B`, so:
 *
 *  - every `H10` class becomes its cohort's `A` section (the `B` section is
 *    then created by `pairClasses`), renamed to the `H10nA` form; and
 *  - every grade 10 cohort drops its level, which no longer exists for it.
 *
 * Idempotent: rows already in the new shape produce no writes. Run once per
 * deployment: `bunx convex run esl/cohorts:repairLegacyGrade10`
 *
 * The reads are deliberately tolerant — a row that fails the current
 * validator still comes back as plain data, which is the only way to repair
 * the rows that violate it.
 */
export const repairLegacyGrade10 = internalMutation({
	args: {},
	handler: async (ctx) => {
		// Reads are deliberately tolerant: a row that fails the current
		// validator still comes back as plain data, which is the only way to
		// reach the rows that violate it.
		const cohorts = await ctx.db.query('esl_cohorts').collect();
		const classes = await ctx.db.query('esl_classes').collect();

		const plan = planLegacyGrade10Repair(cohorts, classes);

		for (const patch of plan.cohorts) {
			await ctx.db.patch(patch.id as Id<'esl_cohorts'>, {
				level: patch.level,
				classNumber: patch.classNumber
			});
		}
		for (const patch of plan.classes) {
			await ctx.db.patch(patch.id as Id<'esl_classes'>, {
				type: patch.type,
				name: patch.name
			});
		}

		return {
			patchedCohorts: plan.cohorts.map((c) => c.id),
			patchedClasses: plan.classes.map((c) => c.id)
		};
	}
});

/**
 * Rewrite cohort levels stored under the old short vocabulary onto the
 * department's official level names.
 *
 * A cohort still on `Int` or `Adv` would be excluded from level-filtered reads
 * and would sort last, because neither `compareEslCohorts` nor the level
 * predicates know the short forms.
 *
 * Idempotent: a cohort already on an official name produces no write. Run once
 * after deploying the official vocabulary:
 * `bunx convex run esl/cohorts:repairLegacyLevels`
 *
 * `unrecognised` is returned rather than thrown on, so a level the alias table
 * cannot resolve is reported for a human to look at instead of being guessed —
 * coercing it would silently misfile a roster.
 */
export const repairLegacyLevels = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cohorts = await ctx.db.query('esl_cohorts').collect();
		const plan = planLegacyLevelRepair(cohorts);

		for (const patch of plan.cohorts) {
			await ctx.db.patch(patch.id as Id<'esl_cohorts'>, { level: patch.level });
		}

		const patched = new Set(plan.cohorts.map((c) => c.id));
		return {
			patchedCohorts: plan.cohorts.map((c) => c.id),
			// A level still unrecognised after planning is neither rewritten nor
			// silently dropped; it is surfaced so it can be fixed at the source.
			unrecognised: cohorts
				.filter((c) => c.level !== undefined && !patched.has(c._id))
				.map((c) => ({ id: c._id, level: c.level as string }))
		};
	}
});

/**
 * Delete classes whose cohort no longer exists.
 *
 * A cohort is removed when its year is advanced, but the classes that taught it
 * are left behind pointing at an id nothing resolves to. They are invisible to
 * every read — each is listed only through the cohort it names — and, once one
 * of them predates the current class-type vocabulary, they can hold back a
 * schema push for a deployment nothing else refers to.
 *
 * Deliberately narrow: a class is only purged when its cohort is *absent*, never
 * when the cohort is merely archived, so a cohort that still has a roster cannot
 * lose the classes that teach it. Reports every id it deleted, so a purge that
 * removes more than expected is visible rather than silent.
 *
 * Run on demand: `bunx convex run esl/cohorts:purgeOrphanedClasses`
 */
export const purgeOrphanedClasses = internalMutation({
	args: {},
	handler: async (ctx) => {
		const classes = await ctx.db.query('esl_classes').collect();
		const live = new Set((await ctx.db.query('esl_cohorts').collect()).map((c) => c._id));
		const orphaned = classes.filter((c) => !live.has(c.cohortId));

		for (const cls of orphaned) {
			await ctx.db.delete(cls._id);
		}

		return {
			purged: orphaned.map((c) => ({ id: c._id, name: c.name, cohortId: c.cohortId })),
			kept: classes.length - orphaned.length
		};
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
 * is how a G7/G8 CLIL/Comm pair — or a G10 cohort's H10A/H10B sections — is
 * repaired when one half went missing.
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
			// Keep the absence of a level: grade 10 cohorts store none.
			...(cohort.level ? { level: cohort.level } : {}),
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
