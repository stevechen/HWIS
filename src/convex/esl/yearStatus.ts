import { mutation, query, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { cohortLabel, deriveHomeroom } from '../shared/esl';
import { displayStaffName } from '../shared/staff_name';

/** The grades the ESL programme can run. */
const ESL_GRADES = [7, 8, 9, 10] as const;

type Blocker = { kind: 'missing-homeroom' | 'duplicate-id'; message: string };
type Warning = { kind: 'no-cohorts' | 'empty-cohort'; message: string };

type GradeSummary = {
	grade: number;
	cohorts: number;
	activeStudents: number;
	missingHomerooms: number;
	/** Active student rows whose school ID also appears elsewhere in the year. */
	duplicateIds: number;
};

/**
 * The roster state of one school year.
 *
 * Everything except the sign-off itself is derived on read, so the checklist can
 * never disagree with the roster. The sign-off is the only stored fact: a human
 * decided the year is ready.
 *
 * cost: 1 indexed take of the year's cohorts, 1 roster take per cohort, then 1
 * indexed first() for the sign-off and 1 indexed take for the legacy-meeting
 * check. Bounded by one year of one programme.
 */
async function computeReadiness(ctx: QueryCtx, year: string) {
	const cohorts = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year', (q) => q.eq('year', year))
		.take(100);

	const gradeSummaries = new Map<number, GradeSummary>();
	for (const grade of ESL_GRADES) {
		gradeSummaries.set(grade, {
			grade,
			cohorts: 0,
			activeStudents: 0,
			missingHomerooms: 0,
			duplicateIds: 0
		});
	}

	// Archived cohorts are scanned too: an active student sitting in an archived
	// cohort is still one person, and two such rows must not pass as two people.
	const studentsByCohort = await Promise.all(
		cohorts.map((cohort) =>
			ctx.db
				.query('esl_students')
				.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
				.take(500)
		)
	);

	const activeStudents = studentsByCohort.flat().filter((student) => student.status === 'active');
	const idsByName = new Map<string, string[]>();
	const missingByGrade = new Map<number, number>();
	const emptyCohorts: string[] = [];

	for (const [index, cohort] of cohorts.entries()) {
		const isActiveCohort = cohort.status === 'active';
		const summary = isActiveCohort ? gradeSummaries.get(cohort.grade) : undefined;
		if (summary) summary.cohorts += 1;

		const roster = studentsByCohort[index].filter((student) => student.status === 'active');
		if (isActiveCohort && roster.length === 0) emptyCohorts.push(cohortLabel(cohort));
		if (summary) summary.activeStudents += roster.length;

		for (const student of roster) {
			idsByName.set(student.schoolStudentId, [
				...(idsByName.get(student.schoolStudentId) ?? []),
				student._id
			]);
			const homeroom = deriveHomeroom(cohort.grade, student.chineseClass ?? '');
			if (homeroom === null) {
				missingByGrade.set(cohort.grade, (missingByGrade.get(cohort.grade) ?? 0) + 1);
				if (summary) summary.missingHomerooms += 1;
			}
		}
	}

	const duplicateIds = [...idsByName.entries()]
		.filter(([, ids]) => ids.length > 1)
		.map(([schoolStudentId]) => schoolStudentId)
		.sort();
	const duplicated = new Set(duplicateIds);

	// Per-grade duplicate counts, so the checklist points at the grade that needs
	// fixing rather than only naming the bare ID.
	for (const [index, cohort] of cohorts.entries()) {
		if (cohort.status !== 'active') continue;
		const summary = gradeSummaries.get(cohort.grade);
		if (!summary) continue;
		summary.duplicateIds += studentsByCohort[index].filter(
			(student) => student.status === 'active' && duplicated.has(student.schoolStudentId)
		).length;
	}

	const blockers: Blocker[] = [];
	for (const grade of ESL_GRADES) {
		const missing = missingByGrade.get(grade) ?? 0;
		if (missing > 0) {
			blockers.push({
				kind: 'missing-homeroom',
				message: `${missing} active G${grade} student${missing === 1 ? '' : 's'} have no Chinese homeroom.`
			});
		}
	}
	if (duplicateIds.length > 0) {
		blockers.push({
			kind: 'duplicate-id',
			message: `School student ID${duplicateIds.length === 1 ? '' : 's'} ${duplicateIds.join(', ')} appear${duplicateIds.length === 1 ? 's' : ''} more than once.`
		});
	}

	const warnings: Warning[] = [];
	for (const grade of ESL_GRADES) {
		const summary = gradeSummaries.get(grade);
		if (summary && summary.cohorts === 0) {
			warnings.push({
				kind: 'no-cohorts',
				message: `No active G${grade} cohorts. If this grade does not run this year, ignore this.`
			});
		}
	}
	if (emptyCohorts.length > 0) {
		warnings.push({
			kind: 'empty-cohort',
			message: `Cohorts with no active students: ${emptyCohorts.join(', ')}.`
		});
	}

	const signoff = await ctx.db
		.query('esl_year_signoffs')
		.withIndex('by_year', (q) => q.eq('year', year))
		.first();
	const hasMeetings = await ctx.db
		.query('esl_class_meetings')
		.withIndex('by_year_day_period', (q) => q.eq('year', year))
		.first();

	const confirmedBy = signoff ? await ctx.db.get(signoff.confirmedBy) : null;
	const confirmed = signoff !== null || hasMeetings !== null;

	return {
		year,
		confirmed,
		confirmedReason:
			signoff !== null
				? ('signoff' as const)
				: hasMeetings !== null
					? ('existing-meetings' as const)
					: null,
		confirmedAt: signoff?.confirmedAt ?? null,
		confirmedBy: confirmedBy ? displayStaffName(confirmedBy.name) : null,
		canConfirm: blockers.length === 0,
		blockers,
		warnings,
		grades: [...gradeSummaries.values()],
		activeStudents: activeStudents.length
	};
}

/**
 * The year's roster readiness and sign-off state.
 *
 * `confirmed` is true for a stored sign-off **or** for a year that already has
 * meeting rows: the gate is introduced mid-life, and a running year must keep
 * opening. `confirmedReason` says which. `canConfirm` is false while a blocker
 * remains.
 */
export const readiness = query({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);
		return await computeReadiness(ctx, args.year);
	}
});

/**
 * Record an admin's sign-off that the year's roster is complete.
 *
 * Refused while a blocker remains — a sign-off over a blank homeroom would make
 * sibling detection lie. Idempotent: re-confirming an already signed year
 * returns the existing record rather than writing a second row.
 */
export const confirm = mutation({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		const user = await requireEslAdmin(ctx);

		const status = await computeReadiness(ctx, args.year);
		if (!status.canConfirm) {
			throw new Error(
				`Roster is not ready: ${status.blockers.map((blocker) => blocker.message).join(' ')}`
			);
		}

		const existing = await ctx.db
			.query('esl_year_signoffs')
			.withIndex('by_year', (q) => q.eq('year', args.year))
			.first();
		if (existing) return { success: true, alreadyConfirmed: true };

		await ctx.db.insert('esl_year_signoffs', {
			year: args.year,
			confirmedAt: Date.now(),
			confirmedBy: user._id
		});
		return { success: true, alreadyConfirmed: false };
	}
});

/**
 * Withdraw the sign-off. Schedules are untouched; the Classes page returns to
 * its gate screen, which is the point of allowing a late correction.
 */
export const unconfirm = mutation({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const existing = await ctx.db
			.query('esl_year_signoffs')
			.withIndex('by_year', (q) => q.eq('year', args.year))
			.first();
		if (existing) await ctx.db.delete(existing._id);
		return { success: true };
	}
});
