import { mutation, query, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { displayStaffName } from '../shared/staff_name';
import { cohortLabel, compareEslStudents, isSharedRosterGrade } from '../shared/esl';

/** A class row enriched with its cohort label and teacher display name. */
type EnrichedClass = Doc<'esl_classes'> & {
	cohortLabel: string | null;
	cohortGrade: number | null;
	teacherName: string | null;
};

/**
 * Joins classes to their cohort and teacher in two batched reads rather than
 * one lookup per class (ADR-0021 rule 2).
 */
async function enrich(ctx: QueryCtx, classes: Doc<'esl_classes'>[]): Promise<EnrichedClass[]> {
	const cohorts = await Promise.all(classes.map((cls) => ctx.db.get(cls.cohortId)));
	const teachers = await Promise.all(
		classes.map((cls) => (cls.teacherId ? ctx.db.get(cls.teacherId) : Promise.resolve(null)))
	);

	return classes.map((cls, index) => {
		const cohort = cohorts[index];
		const teacher = teachers[index];
		return {
			...cls,
			cohortLabel: cohort === null ? null : cohortLabel(cohort),
			cohortGrade: cohort?.grade ?? null,
			teacherName: cls.teacherId ? displayStaffName(teacher?.name) : null
		};
	});
}

/**
 * The classes a teacher is assigned to.
 *
 * cost: 1 indexed take of N assigned classes + 1 batch get of their cohorts
 * and teachers. Free-Quota Impact: N is one teacher's caseload, not table size.
 */
export const listByTeacher = query({
	args: { teacherId: v.id('users') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', args.teacherId))
			.take(200);

		const enriched = await enrich(ctx, classes);
		return enriched.sort((a, b) => a.type.localeCompare(b.type));
	}
});

/** The classes attached to a cohort. cost: 1 indexed read + batched teacher names. */
export const listByCohort = query({
	args: { cohortId: v.id('esl_cohorts') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.cohortId))
			.collect();

		return enrich(ctx, classes);
	}
});

/**
 * The roster a class teaches.
 *
 * The roster is the cohort's, not the class's — a G7/G8 `CLIL` and `Comm` class
 * resolve to the same students, which is the whole point of the shared cohort.
 * `includeDisabled` defaults to false so teachers see current enrolment.
 *
 * cost: 2 point reads + 1 indexed take of the cohort roster.
 */
export const getRoster = query({
	args: {
		classId: v.id('esl_classes'),
		includeDisabled: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const classRecord = await ctx.db.get(args.classId);
		if (!classRecord) throw new Error('Class not found');

		const cohort = await ctx.db.get(classRecord.cohortId);
		if (!cohort) throw new Error('Cohort not found');

		const students = await ctx.db
			.query('esl_students')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', classRecord.cohortId))
			.take(500);

		const includeDisabled = args.includeDisabled ?? false;
		const roster = includeDisabled
			? students
			: students.filter((student) => student.status === 'active');

		return {
			class: classRecord,
			cohort,
			/** True when the roster is shared with the cohort's sibling class. */
			sharedRoster: isSharedRosterGrade(cohort.grade),
			students: roster.sort(compareEslStudents)
		};
	}
});

/** Assign (or unassign) the teacher responsible for a class. cost: 2 reads + 1 patch. */
export const assignTeacher = mutation({
	args: {
		id: v.id('esl_classes'),
		teacherId: v.optional(v.id('users'))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const classRecord = await ctx.db.get(args.id);
		if (!classRecord) throw new Error('Class not found');

		if (args.teacherId) {
			const teacher = await ctx.db.get(args.teacherId);
			if (!teacher) throw new Error('Teacher not found');
		}

		await ctx.db.patch(args.id, { teacherId: args.teacherId ?? undefined });

		return { success: true, classId: args.id };
	}
});

/** Archive (or restore) a class without deleting its history. cost: 1 read + 1 patch. */
export const setStatus = mutation({
	args: {
		id: v.id('esl_classes'),
		status: v.union(v.literal('active'), v.literal('archived'))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const classRecord = await ctx.db.get(args.id);
		if (!classRecord) throw new Error('Class not found');

		await ctx.db.patch(args.id, { status: args.status });
		return { success: true, classId: args.id };
	}
});
