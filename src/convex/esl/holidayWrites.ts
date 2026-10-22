/**
 * Holiday write seam: the shared appliers behind both the manual CSV
 * upload and the direct gov import. Split out of `./holidays` on purpose
 * — the actions there resolve these through the `internal` registry, so
 * housing them here (a module that never imports `internal`) keeps the
 * types one-directional instead of circular.
 */

import { internalMutation, internalQuery } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import {
	ESL_EVENT_TITLES,
	isValidEslDate,
	isWeekendEslDate,
	translateHolidayCaption,
	type HolidayCsvRow
} from '../shared/esl';

/**
 * The date window a semester owns for off-day stamping: from its start
 * date up to the sibling term's start (S1 ends where S2 begins), or the
 * conventional term boundary while the sibling does not exist yet (S1
 * runs to Feb 1 of the school year's second year, S2 to Aug 1).
 */
export function semesterImportWindow(args: {
	year: string;
	term: 'S1' | 'S2';
	startDate: string;
	siblingStart: string | null;
}): { start: string; end: string } {
	if (args.siblingStart !== null) {
		return { start: args.startDate, end: args.siblingStart };
	}
	const secondYear = args.year.split('-')[1] ?? args.year;
	return {
		start: args.startDate,
		end: args.term === 'S1' ? `${secondYear}-02-01` : `${secondYear}-08-01`
	};
}

/**
 * Replace one calendar year's cache rows wholesale, reporting the change
 * count against what was there before (inserted/updated/deleted by
 * `YYYYMMDD` date).
 */
export async function replaceYearCacheRows(
	ctx: MutationCtx,
	year: string,
	rows: HolidayCsvRow[],
	fetchedAt: number
) {
	const existing = await ctx.db
		.query('esl_holiday_cache')
		.withIndex('by_year', (q) => q.eq('year', year))
		.collect();
	const before = new Map(existing.map((row) => [row.date, row]));
	const after = new Map(rows.map((row) => [row.date, row]));

	let inserted = 0;
	let updated = 0;
	for (const [date, row] of after) {
		const prev = before.get(date);
		if (prev === undefined) {
			inserted++;
		} else if (prev.isHoliday !== row.isHoliday || prev.caption !== row.caption) {
			updated++;
		}
	}
	let deleted = 0;
	for (const date of before.keys()) {
		if (!after.has(date)) deleted++;
	}

	for (const row of existing) {
		await ctx.db.delete(row._id);
	}
	for (const row of rows) {
		await ctx.db.insert('esl_holiday_cache', {
			year,
			date: row.date,
			isHoliday: row.isHoliday,
			// Verbatim caption; unknown ones ride flagged for a human (#208).
			caption: row.caption,
			needsTranslation: translateHolidayCaption(row.caption).needsTranslation,
			fetchedAt
		});
	}

	return {
		year,
		inserted,
		updated,
		deleted,
		days: rows.length,
		holidays: rows.filter((row) => row.isHoliday).length
	};
}

export type OffDayStampReport = {
	inserted: number;
	skippedTaken: number;
	outOfRange: number;
	plainWeekends: number;
	/** Named off days landing on Sat/Sun — no meetings run, so never stamped. */
	weekendHolidays: number;
	needsReview: string[];
	/**
	 * The exact rows this import wrote (`date` + translated name), so a
	 * caller holding wizard state can merge them instead of reloading. Empty
	 * on a re-run that inserts nothing.
	 */
	insertedDays: { date: string; name: string }[];
};

export type OffDayRowClass =
	| { kind: 'workday' }
	| { kind: 'unnamed' }
	| { kind: 'outOfRange' }
	| { kind: 'weekend' }
	| { kind: 'candidate'; date: string };

/**
 * Pure per-row classification shared by the preview and the stamper so
 * both agree on what would happen: workdays and caption-less rows carry
 * nothing stampable, out-of-window and weekend rows are counted but
 * never stamped, and only weekday named off days are candidates.
 */
export function classifyOffDayRow(
	row: HolidayCsvRow,
	window: { start: string; end: string }
): OffDayRowClass {
	if (!row.isHoliday) return { kind: 'workday' };
	if (row.caption.trim() === '') return { kind: 'unnamed' };
	const date = `${row.date.slice(0, 4)}-${row.date.slice(4, 6)}-${row.date.slice(6, 8)}`;
	if (!isValidEslDate(date) || date < window.start || date >= window.end) {
		return { kind: 'outOfRange' };
	}
	if (isWeekendEslDate(date)) return { kind: 'weekend' };
	return { kind: 'candidate', date };
}

/**
 * Stamp parsed calendar rows into a semester as `no_school` events:
 * every `isHoliday` row with a caption becomes one locked-title `Off`
 * row, the translated English name riding in the note (the same shape
 * the wizard's extra-day-off rows use). Rows outside the semester
 * window are counted, never stamped; dates that already hold an event
 * are skipped, never overwritten; caption-less rows carry no name and
 * are skipped.
 */
export async function stampOffDayEvents(
	ctx: MutationCtx,
	semester: Doc<'esl_semesters'>,
	rows: HolidayCsvRow[]
): Promise<OffDayStampReport> {
	const sibling = await ctx.db
		.query('esl_semesters')
		.withIndex('by_year_term', (q) =>
			q.eq('year', semester.year).eq('term', semester.term === 'S1' ? 'S2' : 'S1')
		)
		.first();
	const window = semesterImportWindow({
		year: semester.year,
		term: semester.term,
		startDate: semester.startDate,
		siblingStart: sibling?.startDate ?? null
	});

	const existing = await ctx.db
		.query('esl_events')
		.withIndex('by_semester', (q) => q.eq('semesterId', semester._id))
		.collect();
	const taken = new Set(existing.map((event) => event.date));

	let inserted = 0;
	let skippedTaken = 0;
	let outOfRange = 0;
	let plainWeekends = 0;
	let weekendHolidays = 0;
	const needsReview: string[] = [];
	const insertedDays: { date: string; name: string }[] = [];

	for (const row of rows) {
		const classified = classifyOffDayRow(row, window);
		if (classified.kind !== 'candidate') {
			if (classified.kind === 'unnamed') plainWeekends++;
			else if (classified.kind === 'outOfRange') outOfRange++;
			else if (classified.kind === 'weekend') weekendHolidays++;
			continue;
		}
		const { date } = classified;
		if (taken.has(date)) {
			skippedTaken++;
			continue;
		}
		const { english, needsTranslation } = translateHolidayCaption(row.caption);
		await ctx.db.insert('esl_events', {
			semesterId: semester._id,
			type: 'no_school',
			title: ESL_EVENT_TITLES.no_school,
			target: 'all',
			date,
			note: english
		});
		taken.add(date);
		inserted++;
		insertedDays.push({ date, name: english });
		if (needsTranslation) needsReview.push(`${date} ${row.caption}`);
	}

	return {
		inserted,
		skippedTaken,
		outOfRange,
		plainWeekends,
		weekendHolidays,
		needsReview,
		insertedDays
	};
}

const offDayRowValidator = v.object({
	date: v.string(),
	isHoliday: v.boolean(),
	caption: v.string()
});

/** Action-side writer: stamp rows the gov fetch resolved. */
export const applyOffDayRows = internalMutation({
	args: {
		semesterId: v.id('esl_semesters'),
		rows: v.array(offDayRowValidator)
	},
	handler: async (ctx, args) => {
		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');
		return stampOffDayEvents(ctx, semester, args.rows);
	}
});

/** Action-side writer: refresh one year's cache from gov-fetched rows. */
export const saveGovYearCache = internalMutation({
	args: {
		year: v.string(),
		rows: v.array(offDayRowValidator),
		fetchedAt: v.number()
	},
	handler: async (ctx, args) => {
		if (!/^\d{4}$/.test(args.year)) {
			throw new Error(`${args.year} is not a calendar year. Use YYYY.`);
		}
		return replaceYearCacheRows(ctx, args.year, args.rows, args.fetchedAt);
	}
});

/**
 * The import context an action needs but cannot read directly (actions
 * carry no db handle): the semester's window inputs plus the event
 * dates already taken, so previews report skips honestly.
 */
export const readImportContext = internalQuery({
	args: { semesterId: v.id('esl_semesters') },
	handler: async (ctx, args) => {
		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');
		const sibling = await ctx.db
			.query('esl_semesters')
			.withIndex('by_year_term', (q) =>
				q.eq('year', semester.year).eq('term', semester.term === 'S1' ? 'S2' : 'S1')
			)
			.first();
		const takenDates = (
			await ctx.db
				.query('esl_events')
				.withIndex('by_semester', (q) => q.eq('semesterId', args.semesterId))
				.collect()
		).map((event) => event.date);
		return {
			year: semester.year,
			term: semester.term,
			startDate: semester.startDate,
			siblingStart: sibling?.startDate ?? null,
			takenDates
		};
	}
});

/**
 * Import context for a semester that does not exist yet (the setup
 * wizard, ticket #223): the window derives from the draft's year/term/
 * startDate, the sibling (if already saved) still bounds it, and nothing
 * is taken yet. Returned shape matches `readImportContext` exactly.
 */
export const readDraftImportContext = internalQuery({
	args: {
		year: v.string(),
		term: v.union(v.literal('S1'), v.literal('S2')),
		startDate: v.string()
	},
	handler: async (ctx, args) => {
		const sibling = await ctx.db
			.query('esl_semesters')
			.withIndex('by_year_term', (q) =>
				q.eq('year', args.year).eq('term', args.term === 'S1' ? 'S2' : 'S1')
			)
			.first();
		return {
			year: args.year,
			term: args.term,
			startDate: args.startDate,
			siblingStart: sibling?.startDate ?? null,
			takenDates: [] as string[]
		};
	}
});
