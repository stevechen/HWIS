import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	chineseClassCode,
	cohortEnrollmentBlocker,
	compareEslStudents,
	isValidSchoolStudentId,
	parseChineseClass,
	statusTransitionBlocker
} from '../shared/esl';

/**
 * The fields a person types when enrolling or editing a student by hand.
 *
 * `chineseClass` is the full homeroom name as the school writes it (`J101`), not
 * the bare number that is stored: an admin typing into a form has no reason to
 * know the storage splits the code in two, and the value is checked against the
 * cohort's grade on the way in so a `J201` cannot be filed on a grade 7 student.
 */
const studentArgs = {
	englishName: v.string(),
	chineseName: v.string(),
	schoolStudentId: v.string(),
	chineseClass: v.string()
};

/** Rejects roster rows that would make the roster unusable. */
function assertValidStudent(args: {
	englishName: string;
	chineseName: string;
	schoolStudentId: string;
	chineseClass: string;
}): void {
	if (!args.englishName.trim()) throw new Error('English name is required');
	if (!args.chineseName.trim()) throw new Error('Chinese name is required');
	if (!isValidSchoolStudentId(args.schoolStudentId)) {
		throw new Error('School student ID must be a 6- or 7-digit number');
	}
	if (args.chineseClass.trim() === '') {
		throw new Error('Chinese class is required — the Communication Slip prints it');
	}
}

/**
 * The stored class number for a hand-typed homeroom, checked against the grade.
 *
 * Same rule the workbook import applies, so a value that would be refused from a
 * file is refused from a form too rather than admitted by the back door.
 */
function storedChineseClass(raw: string, grade: number): string {
	const parsed = parseChineseClass(raw, grade);
	if ('error' in parsed) {
		throw new Error(
			`"${raw.trim()}" is not a grade ${grade} Chinese class. It should read like ${chineseClassCode(grade, '01')}.`
		);
	}
	return parsed.classNumber;
}

/**
 * The roster of a cohort, active students first.
 *
 * cost: 1 indexed take of the cohort roster. Free-Quota Impact: bounded by one
 * cohort (tens of students), read through `by_cohortId`.
 */
export const listByCohort = query({
	args: {
		cohortId: v.id('esl_cohorts'),
		includeDisabled: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const students = await ctx.db
			.query('esl_students')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.cohortId))
			.take(500);

		const includeDisabled = args.includeDisabled ?? false;
		return (includeDisabled ? students : students.filter((s) => s.status === 'active')).sort(
			compareEslStudents
		);
	}
});

/** A single ESL student. cost: 1 point read. */
export const getById = query({
	args: { id: v.id('esl_students') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);
		return await ctx.db.get(args.id);
	}
});

/** Look up an ESL student by school ID across cohorts. cost: 1 indexed first(). */
export const getBySchoolStudentId = query({
	args: { schoolStudentId: v.string() },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		return await ctx.db
			.query('esl_students')
			.withIndex('by_schoolStudentId', (q) => q.eq('schoolStudentId', args.schoolStudentId))
			.first();
	}
});

/**
 * Finds an enrolled student in a cohort by school ID, via the
 * `by_cohortId_schoolStudentId` composite index — a single indexed lookup
 * rather than a scan of the cohort roster.
 */
async function findEnrolled(
	ctx: QueryCtx | MutationCtx,
	cohortId: Id<'esl_cohorts'>,
	schoolStudentId: string
) {
	return await ctx.db
		.query('esl_students')
		.withIndex('by_cohortId_schoolStudentId', (q) =>
			q.eq('cohortId', cohortId).eq('schoolStudentId', schoolStudentId)
		)
		.first();
}

/**
 * Enrol one student into a cohort.
 *
 * cost: 2 point reads + 1 indexed duplicate lookup + 1 insert.
 */
export const create = mutation({
	args: {
		cohortId: v.id('esl_cohorts'),
		...studentArgs
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		assertValidStudent(args);

		const cohort = await ctx.db.get(args.cohortId);
		if (!cohort) throw new Error('Cohort not found');
		const blocker = cohortEnrollmentBlocker(cohort.status);
		if (blocker) throw new Error(blocker);

		const duplicate = await findEnrolled(ctx, args.cohortId, args.schoolStudentId);
		if (duplicate) {
			throw new Error(`Student ${args.schoolStudentId} is already enrolled in this class`);
		}

		return await ctx.db.insert('esl_students', {
			cohortId: args.cohortId,
			englishName: args.englishName.trim(),
			chineseName: args.chineseName.trim(),
			schoolStudentId: args.schoolStudentId,
			chineseClass: storedChineseClass(args.chineseClass, cohort.grade),
			status: 'active',
			enrolledAt: Date.now()
		});
	}
});

/**
 * Enrol many students at once from a pasted spreadsheet range.
 *
 * Rejection is per row: invalid and duplicate rows come back in `rejected`
 * rather than aborting the import, so a teacher can fix and re-paste just those
 * rows. Duplicates are detected both against the existing cohort and within
 * the batch itself.
 *
 * cost: 1 point read + 1 indexed roster read + K inserts, where K is the
 * accepted batch size (capped below to stay within mutation limits).
 */
export const bulkImport = mutation({
	args: {
		cohortId: v.id('esl_cohorts'),
		students: v.array(v.object(studentArgs))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const cohort = await ctx.db.get(args.cohortId);
		if (!cohort) throw new Error('Cohort not found');
		const blocker = cohortEnrollmentBlocker(cohort.status);
		if (blocker) throw new Error(blocker);

		if (args.students.length === 0) throw new Error('No students supplied');
		if (args.students.length > 200) {
			throw new Error('Import at most 200 students at a time');
		}

		const existing = await ctx.db
			.query('esl_students')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.cohortId))
			.take(500);
		const seen = new Set(existing.map((student) => student.schoolStudentId));

		const rejected: Array<{ index: number; schoolStudentId: string; reason: string }> = [];
		const accepted: Array<{
			englishName: string;
			chineseName: string;
			schoolStudentId: string;
			chineseClass: string;
		}> = [];

		args.students.forEach((student, index) => {
			try {
				assertValidStudent(student);
			} catch (error) {
				rejected.push({
					index,
					schoolStudentId: student.schoolStudentId,
					reason: error instanceof Error ? error.message : 'Invalid student'
				});
				return;
			}
			if (seen.has(student.schoolStudentId)) {
				rejected.push({
					index,
					schoolStudentId: student.schoolStudentId,
					reason: 'Already enrolled in this cohort'
				});
				return;
			}
			seen.add(student.schoolStudentId);
			try {
				accepted.push({
					englishName: student.englishName.trim(),
					chineseName: student.chineseName.trim(),
					schoolStudentId: student.schoolStudentId,
					chineseClass: storedChineseClass(student.chineseClass, cohort.grade)
				});
			} catch (error) {
				// The homeroom is checked against the cohort's grade separately from the
				// field validations above, so a mistyped `J201` on a grade 7 row is
				// rejected as this row rather than failing the whole batch.
				rejected.push({
					index,
					schoolStudentId: student.schoolStudentId,
					reason: error instanceof Error ? error.message : 'Invalid Chinese class'
				});
			}
		});

		const now = Date.now();
		const ids: Id<'esl_students'>[] = [];
		for (const student of accepted) {
			ids.push(
				await ctx.db.insert('esl_students', {
					cohortId: args.cohortId,
					englishName: student.englishName,
					chineseName: student.chineseName,
					schoolStudentId: student.schoolStudentId,
					chineseClass: student.chineseClass,
					status: 'active',
					enrolledAt: now
				})
			);
		}

		return { imported: ids.length, ids, rejected };
	}
});

/**
 * Move a student through the transfer lifecycle.
 *
 * `active` → `disabled` records a transfer out and requires a reason; the
 * reverse re-enrols the same row (clearing `disabledAt`/`statusReason`) so a
 * cohort's roster history stays in one place. This never re-parents the
 * student to another cohort.
 *
 * cost: 1 point read + 1 patch.
 */
export const updateStatus = mutation({
	args: {
		id: v.id('esl_students'),
		status: v.union(v.literal('active'), v.literal('disabled')),
		statusReason: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const student = await ctx.db.get(args.id);
		if (!student) throw new Error('Student not found');

		const blocker = statusTransitionBlocker(student.status, args.status, args.statusReason);
		if (blocker) throw new Error(blocker);

		await ctx.db.patch(args.id, {
			status: args.status,
			...(args.status === 'disabled'
				? { disabledAt: Date.now(), statusReason: args.statusReason?.trim() }
				: { disabledAt: undefined, statusReason: undefined })
		});

		return { success: true, studentId: args.id, status: args.status };
	}
});

/** Correct a student's name, school ID, or homeroom. cost: 1 point read + 1 patch. */
export const update = mutation({
	args: {
		id: v.id('esl_students'),
		...studentArgs
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		assertValidStudent(args);

		const student = await ctx.db.get(args.id);
		if (!student) throw new Error('Student not found');

		// Read through the student's own cohort rather than accepting the homeroom
		// as typed: the grade is what decides whether `J201` is a valid class here,
		// and a form cannot know it. An advancement-created row with no homeroom is
		// given one here, which is the first point a value is known for it.
		const cohort = await ctx.db.get(student.cohortId);
		if (!cohort) throw new Error("Student's cohort not found");

		await ctx.db.patch(args.id, {
			englishName: args.englishName.trim(),
			chineseName: args.chineseName.trim(),
			schoolStudentId: args.schoolStudentId,
			chineseClass: storedChineseClass(args.chineseClass, cohort.grade)
		});

		return { success: true, studentId: args.id };
	}
});
