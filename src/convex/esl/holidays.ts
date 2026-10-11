/**
 * Official-calendar CSV upload (ticket #207): dataset 14718 rows into the
 * year-keyed `esl_holiday_cache`, which stays the runtime source the seed
 * reads at seed time. The pure CSV seam (`parseHolidayCsv`,
 * `decodeHolidayBytes`) lives in `../shared/esl` so the setup page can
 * decode files client-side; this module owns the cache writes.
 */

import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { requireEslAdmin } from '../auth';
import { parseHolidayCsv } from '../shared/esl';

export { decodeHolidayBytes, parseHolidayCsv, type HolidayCsvRow } from '../shared/esl';

/** Validate a `YYYY` calendar-year argument. */
function checkYear(year: string): void {
	if (!/^\d{4}$/.test(year)) {
		throw new Error(`${year} is not a calendar year. Use YYYY.`);
	}
}

/**
 * Upload one calendar year's official CSV text, replacing that year's
 * cache rows wholesale and reporting the change count against what was
 * there before (inserted/updated/deleted by `YYYYMMDD` date).
 *
 * cost: 1 year take + deletes + inserts, one transaction.
 */
export const upload = mutation({
	args: {
		year: v.string(),
		csvText: v.string()
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		checkYear(args.year);

		const rows = parseHolidayCsv(args.csvText);
		const fetchedAt = Date.now();

		const existing = await ctx.db
			.query('esl_holiday_cache')
			.withIndex('by_year', (q) => q.eq('year', args.year))
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
				year: args.year,
				date: row.date,
				isHoliday: row.isHoliday,
				caption: row.caption,
				fetchedAt
			});
		}

		return {
			year: args.year,
			inserted,
			updated,
			deleted,
			days: rows.length,
			holidays: rows.filter((row) => row.isHoliday).length
		};
	}
});

/**
 * The cached rows for one calendar year, in date order — the setup page's
 * read seam. The cache is the runtime source; these fixture files never
 * are (see `tests/fixtures/esl-holiday/`).
 *
 * cost: 1 indexed take of the year's rows.
 */
export const getByYear = query({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query('esl_holiday_cache')
			.withIndex('by_year', (q) => q.eq('year', args.year))
			.collect();
		rows.sort((a, b) => a.date.localeCompare(b.date));
		return rows;
	}
});
