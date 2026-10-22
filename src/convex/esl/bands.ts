import type { QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { deriveHomeroom } from '../shared/esl';

/**
 * The Chinese homerooms a cohort's active roster draws from, ascending.
 *
 * Derived on every read and never stored (ADR-0025): the roster is a cohort
 * property, so this is the closest thing a class has to "which Chinese classes
 * its students come from". Only active students count — a transferred-out row's
 * homeroom is history — and a cohort with no roster, or one whose rows carry no
 * parseable homeroom yet, yields an empty set.
 *
 * cost: 1 indexed take of the cohort's roster.
 */
export async function cohortHomeroomSet(
	ctx: QueryCtx,
	cohort: Doc<'esl_cohorts'>
): Promise<string[]> {
	const students = await ctx.db
		.query('esl_students')
		.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
		.take(500);

	const homerooms = new Set<string>();
	for (const student of students) {
		if (student.status !== 'active') continue;
		const homeroom = deriveHomeroom(cohort.grade, student.chineseClass ?? '');
		if (homeroom !== null) homerooms.add(homeroom);
	}
	return [...homerooms].sort();
}

/** Whether two sorted homeroom lists share at least one code. */
export function homeroomSetsIntersect(a: readonly string[], b: readonly string[]): boolean {
	const seen = new Set(a);
	return b.some((value) => seen.has(value));
}

/**
 * The active cohorts in a cohort's sibling band, including the cohort itself.
 *
 * Two cohorts are siblings when they are in the same school year and grade and
 * their active rosters share at least one Chinese homeroom. The band is the
 * **transitive connected component** of that relation: if A shares a homeroom
 * with B and B shares a different one with C, all three are one band. A class
 * that is a subset of another's homerooms therefore joins the larger band, and
 * saving either card writes the whole group (ADR-0028).
 *
 * Composition is deliberately *not* exact equality: a `跑班` band can contain
 * cohorts drawn from overlapping but different subsets of the same homerooms.
 * Separate bands generally share no homerooms, so they stay separate.
 *
 * A cohort with an empty homeroom set takes no part: it neither joins a band nor
 * connects two cohorts that would otherwise be separate.
 *
 * cost: 1 indexed take of the year+grade cohorts, then 1 roster take per active
 * cohort in that grade. Bounded by one grade of one year.
 */
export async function findBandCohorts(
	ctx: QueryCtx,
	cohort: Doc<'esl_cohorts'>
): Promise<Doc<'esl_cohorts'>[]> {
	const candidates = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year_grade', (q) => q.eq('year', cohort.year).eq('grade', cohort.grade))
		.collect();

	const active = candidates.filter((candidate) => candidate.status === 'active');
	const homeroomsByCohort = new Map<Id<'esl_cohorts'>, string[]>();
	for (const candidate of active) {
		homeroomsByCohort.set(candidate._id, await cohortHomeroomSet(ctx, candidate));
	}

	const sourceHomerooms = homeroomsByCohort.get(cohort._id) ?? [];
	if (sourceHomerooms.length === 0) return [cohort];

	// Index homerooms to the cohorts that draw from them, then walk the
	// connected component from the source.
	const cohortsByHomeroom = new Map<string, Id<'esl_cohorts'>[]>();
	for (const candidate of active) {
		for (const homeroom of homeroomsByCohort.get(candidate._id) ?? []) {
			const bucket = cohortsByHomeroom.get(homeroom);
			if (bucket) bucket.push(candidate._id);
			else cohortsByHomeroom.set(homeroom, [candidate._id]);
		}
	}

	const visited = new Set<Id<'esl_cohorts'>>([cohort._id]);
	const queue: Id<'esl_cohorts'>[] = [cohort._id];
	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined) break;
		for (const homeroom of homeroomsByCohort.get(current) ?? []) {
			for (const neighbour of cohortsByHomeroom.get(homeroom) ?? []) {
				if (visited.has(neighbour)) continue;
				visited.add(neighbour);
				queue.push(neighbour);
			}
		}
	}

	return active.filter((candidate) => visited.has(candidate._id));
}
