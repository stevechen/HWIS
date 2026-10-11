import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { deriveSemesterEnd, isValidEslDate, isValidSchoolYear } from '../shared/esl';

const termValidator = v.union(v.literal('S1'), v.literal('S2'));

/** A semester row enriched with its derived end. */
export type SemesterWithEnd = Doc<'esl_semesters'> & { derivedEnd: string | null };

/**
 * Read one semester's exam dates and derive its end. Exams of every target
 * count — a G9-only final still ends the term — because the end is a property
 * of the semester, not of any one teacher's view.
 *
 * cost: 1 indexed take of the semester's events. Free-Quota Impact: one
 * semester's events (tens of rows), not the table.
 */
async function withDerivedEnd(
	ctx: QueryCtx | MutationCtx,
	semester: Doc<'esl_semesters'>
): Promise<SemesterWithEnd> {
	const events = await ctx.db
		.query('esl_events')
		.withIndex('by_semester', (q) => q.eq('semesterId', semester._id))
		.collect();
	const examDates = events.filter((event) => event.type === 'exam').map((event) => event.date);
	return { ...semester, derivedEnd: deriveSemesterEnd(examDates) };
}

/**
 * Create an S1/S2 semester with an explicit start date.
 *
 * The term has an anchor even before exams are entered: the end derives
 * later as the max exam-event date (null until the first final exists).
 * S2 is creatable any time — no hard gate on S1's end — so early planning
 * is never blocked.
 *
 * cost: 1 uniqueness lookup on `by_year_term` + 1 insert.
 */
export const create = mutation({
	args: {
		year: v.string(),
		term: termValidator,
		startDate: v.string(),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		if (!isValidSchoolYear(args.year)) {
			throw new Error('Year must be in YYYY-YYYY form');
		}
		if (!isValidEslDate(args.startDate)) {
			throw new Error(`${args.startDate} is not a valid date. Use YYYY-MM-DD.`);
		}

		const existing = await ctx.db
			.query('esl_semesters')
			.withIndex('by_year_term', (q) => q.eq('year', args.year).eq('term', args.term))
			.first();
		if (existing) {
			throw new Error(`${args.year} ${args.term} already exists.`);
		}

		return await ctx.db.insert('esl_semesters', {
			year: args.year,
			term: args.term,
			startDate: args.startDate,
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});
	}
});

/**
 * One semester with its derived end: `derivedEnd` is the max exam-event
 * date, or null while no exams exist (the "finals TBD" state).
 *
 * cost: 1 point read + 1 indexed take of the semester's events.
 */
export const get = query({
	args: { semesterId: v.id('esl_semesters') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');
		return withDerivedEnd(ctx, semester);
	}
});

/**
 * Every semester, newest year first, each with its derived end.
 *
 * cost: 1 indexed take (descending years) + 1 events take per semester.
 * Free-Quota Impact: semesters are two rows a year; the per-semester reads
 * are the tens of events each holds.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		await requireEslStaff(ctx);

		const semesters = await ctx.db
			.query('esl_semesters')
			.withIndex('by_year_term')
			.order('desc')
			.take(40);
		return Promise.all(semesters.map((semester) => withDerivedEnd(ctx, semester)));
	}
});
