import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { chineseClassCode, cohortLabel, deriveHomeroom, parseChineseClass } from '../shared/esl';
import { displayStaffName } from '../shared/staff_name';
import { cohortHomeroomSet, findBandCohorts } from './bands';

/** The active cohorts of one school year, bounded by one programme-year. */
async function activeCohortsForYear(ctx: QueryCtx, year: string) {
	return (
		await ctx.db
			.query('esl_cohorts')
			.withIndex('by_year', (q) => q.eq('year', year))
			.take(100)
	).filter((cohort) => cohort.status === 'active');
}

/** A student as the transfer panel shows them. */
type SearchHit = {
	_id: Id<'esl_students'>;
	englishName?: string;
	chineseName: string;
	schoolStudentId: string;
	chineseClass?: string;
	homeroom: string;
	cohortId: Id<'esl_cohorts'>;
	cohortLabel: string;
	grade: number;
};

/**
 * Search the selected year's active students for a transfer.
 *
 * A school year is at most a few thousand students, and this is an admin-only
 * action, so the query scans the year's active rosters and filters in memory.
 * That is what makes "J101" match a stored `01`, and lets one term match a name,
 * a school ID or a class label without five indexes.
 *
 * cost: 1 indexed take of the year's cohorts + 1 roster take per active cohort.
 * Bounded by one programme-year; returns at most `limit` hits.
 */
export const search = query({
	args: {
		year: v.string(),
		query: v.string(),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args): Promise<SearchHit[]> => {
		await requireEslStaff(ctx);

		const needle = args.query.trim().toLowerCase();
		if (needle === '') return [];

		const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
		const cohorts = await activeCohortsForYear(ctx, args.year);
		const hits: SearchHit[] = [];

		for (const cohort of cohorts) {
			const label = cohortLabel(cohort);
			const roster = await ctx.db
				.query('esl_students')
				.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
				.take(500);

			for (const student of roster) {
				if (student.status !== 'active') continue;
				const homeroom =
					student.chineseClass === undefined
						? ''
						: chineseClassCode(cohort.grade, student.chineseClass);
				const haystack = [
					student.schoolStudentId,
					student.englishName ?? '',
					student.chineseName,
					student.chineseClass ?? '',
					homeroom,
					label
				]
					.join('\n')
					.toLowerCase();
				if (!haystack.includes(needle)) continue;

				hits.push({
					_id: student._id,
					englishName: student.englishName,
					chineseName: student.chineseName,
					schoolStudentId: student.schoolStudentId,
					chineseClass: student.chineseClass,
					homeroom,
					cohortId: cohort._id,
					cohortLabel: label,
					grade: cohort.grade
				});
			}
		}

		// An exact school-ID match is almost always the one the admin wants; after
		// that, school ID order keeps names from the same class together.
		hits.sort((a, b) => {
			const aExact = a.schoolStudentId.toLowerCase() === needle ? 0 : 1;
			const bExact = b.schoolStudentId.toLowerCase() === needle ? 0 : 1;
			if (aExact !== bExact) return aExact - bExact;
			return a.schoolStudentId.localeCompare(b.schoolStudentId);
		});

		return hits.slice(0, limit);
	}
});

/** The student, its current cohort and both cohorts' band membership. */
async function loadMove(
	ctx: QueryCtx | MutationCtx,
	studentId: Id<'esl_students'>,
	toCohortId?: Id<'esl_cohorts'>
) {
	const student = await ctx.db.get(studentId);
	if (student === null) throw new Error('Student not found');
	if (student.status !== 'active') throw new Error('Only an active student can be transferred');

	const fromCohort = await ctx.db.get(student.cohortId);
	if (fromCohort === null) throw new Error("Student's cohort not found");
	const toCohort = toCohortId === undefined ? null : await ctx.db.get(toCohortId);
	return { student, fromCohort, toCohort };
}

/**
 * Whether moving this student changes the source or target cohort's band.
 *
 * A level move is safe when the target is already in the source band **and**
 * the student's homeroom is already represented there: otherwise the move
 * either strands the student on a different week or silently joins two bands.
 * A homeroom correction is judged by re-deriving the source cohort's component
 * after the patch.
 */
async function levelMoveChangesBand(
	ctx: MutationCtx,
	student: Doc<'esl_students'>,
	fromCohort: Doc<'esl_cohorts'>,
	toCohort: Doc<'esl_cohorts'>
): Promise<boolean> {
	const sourceBand = await findBandCohorts(ctx, fromCohort);
	const sourceIds = new Set(sourceBand.map((cohort) => cohort._id));
	if (!sourceIds.has(toCohort._id)) return true;

	const homeroom = deriveHomeroom(fromCohort.grade, student.chineseClass ?? '');
	if (homeroom === null) return false;

	// The target must already draw from the student's homeroom. If it does not,
	// the move adds a homeroom to that cohort and can merge two bands.
	const targetHomerooms = await cohortHomeroomSet(ctx, toCohort);
	if (!targetHomerooms.includes(homeroom)) return true;

	// And the source must still belong to the same band once this student is
	// gone. Moving the last J101 in a cohort can split a band even when the
	// target was a sibling.
	const sourceAfter = await findBandCohorts(ctx, fromCohort, {
		excludeStudentId: student._id
	});
	const afterIds = new Set(sourceAfter.map((cohort) => cohort._id));
	return (
		sourceAfter.some((cohort) => !sourceIds.has(cohort._id)) ||
		[...sourceIds].some((id) => !afterIds.has(id))
	);
}

/**
 * Move a student to another cohort in the same grade.
 *
 * The student row keeps its identity and history; only `cohortId` moves. A
 * separate transfer row records the from → to. `bandChanged` is a warning, not
 * a refusal: the admin may be deliberately joining bands, but the class's week
 * may then need attention.
 */
export const transferLevel = mutation({
	args: {
		studentId: v.id('esl_students'),
		toCohortId: v.id('esl_cohorts'),
		reason: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await requireEslAdmin(ctx);
		const { student, fromCohort, toCohort } = await loadMove(ctx, args.studentId, args.toCohortId);
		if (toCohort === null) throw new Error('Target cohort not found');
		if (toCohort.status !== 'active') throw new Error('Target cohort is archived');
		if (toCohort._id === fromCohort._id) throw new Error('Student is already in that class');
		if (toCohort.year !== fromCohort.year) {
			throw new Error('A transfer must stay in the same school year');
		}
		if (toCohort.grade !== fromCohort.grade) {
			throw new Error('A level move must stay in the same grade');
		}

		const bandChanged = await levelMoveChangesBand(ctx, student, fromCohort, toCohort);

		await ctx.db.patch(student._id, { cohortId: toCohort._id });
		await ctx.db.insert('esl_student_transfers', {
			studentId: student._id,
			year: fromCohort.year,
			kind: 'level',
			fromCohortId: fromCohort._id,
			toCohortId: toCohort._id,
			...(args.reason === undefined || args.reason.trim() === ''
				? {}
				: { reason: args.reason.trim() }),
			movedBy: user._id,
			movedAt: Date.now()
		});

		return { success: true, bandChanged };
	}
});

/**
 * Correct a student's Chinese homeroom.
 *
 * The value is validated against the cohort's grade with the same parser the
 * roster import uses. The cohort's band is derived before and after the patch;
 * a changed component is returned as `bandChanged` for the UI to warn about.
 */
export const transferHomeroom = mutation({
	args: {
		studentId: v.id('esl_students'),
		chineseClass: v.string(),
		reason: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await requireEslAdmin(ctx);
		const { student, fromCohort } = await loadMove(ctx, args.studentId);

		const parsed = parseChineseClass(args.chineseClass, fromCohort.grade);
		if ('error' in parsed) {
			throw new Error(
				`"${args.chineseClass.trim()}" is not a grade ${fromCohort.grade} Chinese class. It should read like ${chineseClassCode(fromCohort.grade, '01')}.`
			);
		}

		const before = await findBandCohorts(ctx, fromCohort);
		const beforeIds = new Set(before.map((cohort) => cohort._id));

		await ctx.db.patch(student._id, { chineseClass: parsed.classNumber });

		const after = await findBandCohorts(ctx, fromCohort);
		const bandChanged =
			after.length !== beforeIds.size || after.some((cohort) => !beforeIds.has(cohort._id));

		await ctx.db.insert('esl_student_transfers', {
			studentId: student._id,
			year: fromCohort.year,
			kind: 'homeroom',
			fromCohortId: fromCohort._id,
			toCohortId: fromCohort._id,
			...(student.chineseClass === undefined ? {} : { fromChineseClass: student.chineseClass }),
			toChineseClass: parsed.classNumber,
			...(args.reason === undefined || args.reason.trim() === ''
				? {}
				: { reason: args.reason.trim() }),
			movedBy: user._id,
			movedAt: Date.now()
		});

		return { success: true, bandChanged };
	}
});

/**
 * The selected year's transfer history, newest first.
 *
 * The rows are sparse (a handful a term), so one year read is cheaper than
 * paginating. Student and cohort names are joined here so the list is readable
 * without a second round of queries in the browser.
 */
export const history = query({
	args: {
		year: v.string(),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const rows = await ctx.db
			.query('esl_student_transfers')
			.withIndex('by_year', (q) => q.eq('year', args.year))
			.take(200);

		const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
		const sorted = rows.sort((a, b) => b.movedAt - a.movedAt).slice(0, limit);

		return await Promise.all(
			sorted.map(async (row) => {
				const [student, fromCohort, toCohort, actor] = await Promise.all([
					ctx.db.get(row.studentId),
					row.fromCohortId ? ctx.db.get(row.fromCohortId) : Promise.resolve(null),
					row.toCohortId ? ctx.db.get(row.toCohortId) : Promise.resolve(null),
					ctx.db.get(row.movedBy)
				]);
				return {
					_id: row._id,
					kind: row.kind,
					studentId: row.studentId,
					studentName: student ? (student.englishName ?? student.chineseName) : 'Unknown student',
					schoolStudentId: student?.schoolStudentId ?? '',
					fromCohort: fromCohort ? cohortLabel(fromCohort) : null,
					toCohort: toCohort ? cohortLabel(toCohort) : null,
					fromChineseClass:
						row.fromChineseClass === undefined || fromCohort === null
							? null
							: chineseClassCode(fromCohort.grade, row.fromChineseClass),
					toChineseClass:
						row.toChineseClass === undefined || toCohort === null
							? null
							: chineseClassCode(toCohort.grade, row.toChineseClass),
					reason: row.reason ?? null,
					movedBy: actor ? displayStaffName(actor.name) : 'Unknown staff',
					movedAt: row.movedAt
				};
			})
		);
	}
});
