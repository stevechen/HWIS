import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	deriveSemesterEnd,
	findLunarOffDays,
	isValidEslDate,
	isValidSchoolYear,
	suggestedS1EndDate,
	suggestedS2EndDate
} from '../shared/esl';
import { normalizeEslCustomRooms } from '../shared/esl_rooms';

const termValidator = v.union(v.literal('S1'), v.literal('S2'));
const roomLimitValidator = v.union(v.literal('D'), v.literal('E'), v.literal('F'), v.literal('G'));

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
		eslRoomLimit: v.optional(roomLimitValidator),
		eslCustomRooms: v.optional(v.array(v.string())),
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
		if (args.term === 'S1' && args.eslRoomLimit === undefined) {
			throw new Error('Semester 1 requires an ESL room limit.');
		}
		const customRooms =
			args.term === 'S1' ? normalizeEslCustomRooms(args.eslCustomRooms ?? []) : [];

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
			...(args.term === 'S1' && args.eslRoomLimit !== undefined
				? { eslRoomLimit: args.eslRoomLimit, eslCustomRooms: customRooms }
				: {}),
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});
	}
});

/**
 * The editable end-date default for semester setup (ticket #209).
 *
 * S2 is pure: July 1st of the school year's second calendar year. S1
 * resolves the `春節` isHoliday-run start in the second calendar year from
 * `esl_holiday_cache` — the contiguous off run containing the 春節 caption,
 * via `findLunarOffDays` — and proposes two weeks before it. A missing year
 * reports `missing-cache`: the setup page already offers that year's CSV
 * upload (#208), and this query recomputes reactively once it lands. A
 * cache with no 春節 run reports `unresolved`, and the admin types the date
 * by hand. Every `ready` date stays a suggestion — the seed form never
 * locks it.
 *
 * cost: S2 none; S1 one indexed take of the year's cache rows.
 */
export const endDateDefault = query({
	args: {
		year: v.string(),
		term: termValidator
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		if (!isValidSchoolYear(args.year)) {
			throw new Error('Year must be in YYYY-YYYY form');
		}

		if (args.term === 'S2') {
			return { status: 'ready', date: suggestedS2EndDate(args.year), cnyRunStart: null } as const;
		}

		const calendarYear = args.year.split('-')[1] ?? args.year;
		const cached = await ctx.db
			.query('esl_holiday_cache')
			.withIndex('by_year', (q) => q.eq('year', calendarYear))
			.collect();
		if (cached.length === 0) {
			return { status: 'missing-cache', year: calendarYear } as const;
		}
		const cluster = findLunarOffDays(
			cached.map((row) => ({ date: row.date, isHoliday: row.isHoliday, caption: row.caption })),
			'春節'
		);
		if (cluster.length === 0) {
			return { status: 'unresolved', year: calendarYear } as const;
		}
		const cnyRunStart = cluster.map((day) => day.date).sort()[0];
		if (cnyRunStart === undefined) {
			return { status: 'unresolved', year: calendarYear } as const;
		}
		return { status: 'ready', date: suggestedS1EndDate(cnyRunStart), cnyRunStart } as const;
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
