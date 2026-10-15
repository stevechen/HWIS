/**
 * Official-calendar CSV upload (ticket #207): dataset 14718 rows into the
 * year-keyed `esl_holiday_cache`, which stays the runtime source the wizard
 * reads at setup time (Step 2 gov import stages off days into wizard state).
 * The pure CSV seam (`parseHolidayCsv`, `decodeHolidayBytes`) lives in `../shared/esl` so the setup page can
 * decode files client-side; the write seam (`replaceYearCacheRows`,
 * `stampOffDayEvents`) lives in `./holidayWrites` so the actions below
 * can resolve it through the `internal` registry without a type cycle.
 *
 * Direct gov import (no download/upload): dataset 14718 exposes no API —
 * only per-year CSV links on its page — so the actions below scrape the
 * page for the standard-flavour files, fetch them server-side, preview
 * the named off days in the semester window, and stamp them on import
 * (events plus cache refresh). Anything the scrape cannot reach fails
 * cleanly back to the manual upload.
 */

import { action, mutation, query } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import { requireEslAdmin } from '../auth';
import {
	decodeHolidayBytes,
	parseHolidayCsv,
	translateHolidayCaption,
	type HolidayCsvRow
} from '../shared/esl';
import {
	classifyOffDayRow,
	replaceYearCacheRows,
	semesterImportWindow,
	stampOffDayEvents,
	type OffDayStampReport
} from './holidayWrites';

export {
	decodeHolidayBytes,
	parseHolidayCsv,
	translateHolidayCaption,
	type HolidayCsvRow
} from '../shared/esl';

/** Validate a `YYYY` calendar-year argument. */
function checkYear(year: string): void {
	if (!/^\d{4}$/.test(year)) {
		throw new Error(`${year} is not a calendar year. Use YYYY.`);
	}
}

/** Validate ROC-year arguments (`115` for 2026). */
function checkRocYears(rocYears: string[]): void {
	if (rocYears.length === 0 || rocYears.length > 2) {
		throw new Error('Pick one or two calendar years.');
	}
	for (const rocYear of rocYears) {
		if (!/^\d{2,3}$/.test(rocYear)) {
			throw new Error(`${rocYear} is not a ROC year (e.g. 115 for 2026).`);
		}
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
		return replaceYearCacheRows(ctx, args.year, rows, Date.now());
	}
});

/**
 * Stamp one official-calendar CSV's named off days straight into a
 * semester as `no_school` events. The cache upload alone writes no events,
 * so semesters created before (or without) a CSV never gain their
 * holidays — Teacher's Day included. This closes that gap.
 *
 * cost: 1 semester read + 1 sibling lookup + 1 events take + 1 insert
 * per new off day, one transaction.
 */
export const importOffDays = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		csvText: v.string()
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');
		const rows = parseHolidayCsv(args.csvText);
		return stampOffDayEvents(ctx, semester, rows);
	}
});

// ---------------------------------------------------------------------------
// Direct gov import: dataset 14718 exposes no API, only per-year CSV links
// on its page, so the actions below scrape the page, fetch the standard
// files server-side, and import without any download/upload round-trip.
// ---------------------------------------------------------------------------

/** Dataset 14718's page: the only machine entry point (no API, file links). */
const GOV_DATASET_URL = 'https://data.gov.tw/dataset/14718';

export type GovCalendarFile = {
	/** ROC year from the filename (`115` for 2026). */
	rocYear: string;
	/** Decoded filename as listed. */
	name: string;
	/** Absolute DGPA download URL. */
	url: string;
};

/**
 * Pull the downloadable calendar files out of the dataset page's HTML.
 * Skips the Google-Calendar import flavour (`…_Google行事曆專用…`) —
 * that file is for Google Calendar, not this format — and dedupes links
 * the page repeats (list + download button).
 */
export function parseGovDatasetFiles(html: string): GovCalendarFile[] {
	const files = new Map<string, GovCalendarFile>();
	const hrefPattern = /href="(https:\/\/www\.dgpa\.gov\.tw\/FileConversion\?[^"]*)"/g;
	let match: RegExpExecArray | null;
	while ((match = hrefPattern.exec(html)) !== null) {
		const url = match[1].replace(/&amp;/g, '&');
		const nameParam = /[?&]name=([^&]*)/.exec(url)?.[1];
		if (nameParam === undefined) continue;
		let name: string;
		try {
			name = decodeURIComponent(nameParam);
		} catch {
			continue;
		}
		if (/google/i.test(name)) continue;
		const rocYear = /^(\d+)年/.exec(name.trim())?.[1];
		if (rocYear === undefined) continue;
		if (!files.has(url)) files.set(url, { rocYear, name, url });
	}
	return [...files.values()];
}

/**
 * Pick one year's standard file. Re-uploaded corrections ride alongside
 * the original (114 shipped an `1141020更新` twin), so an explicitly
 * marked correction wins; otherwise page order decides.
 */
export function pickGovFileForYear(
	files: readonly GovCalendarFile[],
	rocYear: string
): GovCalendarFile | null {
	const candidates = files.filter((file) => file.rocYear === rocYear);
	const first = candidates[0];
	if (first === undefined) return null;
	return candidates.find((file) => /更新|修正/.test(file.name)) ?? first;
}

/** Gregorian year → ROC year (`2026` → `115`). */
export function gregorianToRocYear(gregorianYear: number): string {
	return String(gregorianYear - 1911);
}

/**
 * The ROC years the picker offers: current + next calendar year.
 * `today` is `YYYY-MM-DD` (parameterized for tests).
 */
export function govListingRocYears(today: string): string[] {
	const gregorian = Number(today.slice(0, 4));
	return [gregorianToRocYear(gregorian), gregorianToRocYear(gregorian + 1)];
}

/** Fetch text or fail cleanly back to the manual upload. */
async function fetchGovText(url: string, what: string): Promise<string> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		throw new Error(`${what} is unreachable right now. Upload the CSV manually below instead.`);
	}
	if (!response.ok) {
		throw new Error(
			`${what} returned HTTP ${response.status}. Upload the CSV manually below instead.`
		);
	}
	return await response.text();
}

async function fetchGovBytes(url: string, what: string): Promise<Uint8Array> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		throw new Error(`${what} is unreachable right now. Upload the CSV manually below instead.`);
	}
	if (!response.ok) {
		throw new Error(
			`${what} returned HTTP ${response.status}. Upload the CSV manually below instead.`
		);
	}
	return new Uint8Array(await response.arrayBuffer());
}

export type GovPreviewDay = {
	/** `YYYY-MM-DD` in-window date. */
	date: string;
	/** Translated English name. */
	name: string;
	needsReview: boolean;
};

export type GovYearPreview = {
	rocYear: string;
	fileName: string | null;
	status: 'ok' | 'missing' | 'unreadable';
	days: number;
	holidays: number;
};

/**
 * Resolve the picked ROC years to files and parse them, without writing
 * anything. Years with no listed file report `missing` (not published
 * yet); files that fail to parse report `unreadable` — either way the
 * other years still resolve.
 */
async function resolveGovYears(rocYears: string[]): Promise<{
	years: GovYearPreview[];
	rowsByYear: { rocYear: string; rows: HolidayCsvRow[] }[];
}> {
	const page = await fetchGovText(GOV_DATASET_URL, 'The government dataset page');
	const files = parseGovDatasetFiles(page);

	const years: GovYearPreview[] = [];
	const rowsByYear: { rocYear: string; rows: HolidayCsvRow[] }[] = [];
	for (const rocYear of rocYears) {
		const file = pickGovFileForYear(files, rocYear);
		if (file === null) {
			years.push({ rocYear, fileName: null, status: 'missing', days: 0, holidays: 0 });
			continue;
		}
		let rows: HolidayCsvRow[];
		try {
			const bytes = await fetchGovBytes(file.url, `The ${rocYear} calendar file`);
			rows = parseHolidayCsv(decodeHolidayBytes(bytes));
		} catch {
			years.push({ rocYear, fileName: file.name, status: 'unreadable', days: 0, holidays: 0 });
			continue;
		}
		years.push({
			rocYear,
			fileName: file.name,
			status: 'ok',
			days: rows.length,
			holidays: rows.filter((row) => row.isHoliday).length
		});
		rowsByYear.push({ rocYear, rows });
	}

	return { years, rowsByYear };
}

/**
 * Preview the picked ROC years against the semester in view: the named
 * off days that would be stamped, in date order, plus the skip counts.
 * Writes nothing.
 *
 * cost: 1 admin gate + 1 import-context read + dataset page + 1 CSV
 * fetch per picked year.
 */
export type GovPreviewResult = {
	years: GovYearPreview[];
	days: GovPreviewDay[];
	skippedTaken: number;
	outOfRange: number;
	plainWeekends: number;
	weekendHolidays: number;
};

export const previewGovImport = action({
	args: {
		semesterId: v.optional(v.id('esl_semesters')),
		// Draft context for a semester that does not exist yet (the setup
		// wizard stages off days into wizard state; nothing is written
		// until Step 5 saves). Exactly one of semesterId/draft is required.
		draft: v.optional(
			v.object({
				year: v.string(),
				term: v.union(v.literal('S1'), v.literal('S2')),
				startDate: v.string()
			})
		),
		rocYears: v.array(v.string())
	},
	handler: async (ctx, args): Promise<GovPreviewResult> => {
		await ctx.runQuery(internal.esl.admin.checkEslAdmin, {});
		checkRocYears(args.rocYears);

		if (args.semesterId !== undefined && args.draft !== undefined) {
			throw new Error('Pass exactly one of semesterId or draft context, not both.');
		}
		const target =
			args.semesterId !== undefined
				? { kind: 'saved' as const, semesterId: args.semesterId }
				: args.draft !== undefined
					? { kind: 'draft' as const, ...args.draft }
					: null;
		if (target === null) {
			throw new Error('Pass exactly one of semesterId or draft context.');
		}
		const context =
			target.kind === 'saved'
				? await ctx.runQuery(internal.esl.holidayWrites.readImportContext, {
						semesterId: target.semesterId
					})
				: await ctx.runQuery(internal.esl.holidayWrites.readDraftImportContext, {
						year: target.year,
						term: target.term,
						startDate: target.startDate
					});
		const window = semesterImportWindow({
			year: context.year,
			term: context.term,
			startDate: context.startDate,
			siblingStart: context.siblingStart
		});
		const taken = new Set(context.takenDates);

		const resolved = await resolveGovYears(args.rocYears);

		let skippedTaken = 0;
		let outOfRange = 0;
		let plainWeekends = 0;
		let weekendHolidays = 0;
		const days: GovPreviewDay[] = [];
		for (const { rows } of resolved.rowsByYear) {
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
				days.push({ date, name: english, needsReview: needsTranslation });
				taken.add(date);
			}
		}
		days.sort((a, b) => a.date.localeCompare(b.date));

		return {
			years: resolved.years,
			days,
			skippedTaken,
			outOfRange,
			plainWeekends,
			weekendHolidays
		};
	}
});

export type GovImportYearResult = GovYearPreview & {
	cache: { inserted: number; updated: number; deleted: number } | null;
};

/**
 * Import the picked ROC years straight into the semester: fetch each
 * file, stamp its in-window named off days as events, and refresh that
 * year's cache rows so the seed, checklist, and S1 end-date default keep
 * working. A picked year with no listed file, or a file that fails to
 * parse, refuses the whole import naming the year — re-preview after
 * fixing the pick. Idempotent: re-running stamps nothing new.
 *
 * cost: 1 admin gate + 1 import-context read + dataset page + 1 CSV
 * fetch, 1 cache transaction, and 1 stamp transaction per picked year.
 */
export type GovImportResult = {
	years: GovImportYearResult[];
	events: OffDayStampReport;
};

export const importGovOffDays = action({
	args: {
		semesterId: v.id('esl_semesters'),
		rocYears: v.array(v.string())
	},
	handler: async (ctx, args): Promise<GovImportResult> => {
		await ctx.runQuery(internal.esl.admin.checkEslAdmin, {});
		checkRocYears(args.rocYears);

		const page = await fetchGovText(GOV_DATASET_URL, 'The government dataset page');
		const files = parseGovDatasetFiles(page);

		const years: GovImportYearResult[] = [];
		const allRows: HolidayCsvRow[] = [];
		for (const rocYear of args.rocYears) {
			const file = pickGovFileForYear(files, rocYear);
			if (file === null) {
				throw new Error(
					`ROC year ${rocYear} has no listed calendar file (not published yet?). Re-preview after fixing the pick, or upload the CSV manually below.`
				);
			}
			let rows: HolidayCsvRow[];
			try {
				const bytes = await fetchGovBytes(file.url, `The ${rocYear} calendar file`);
				rows = parseHolidayCsv(decodeHolidayBytes(bytes));
			} catch {
				throw new Error(
					`The ${rocYear} calendar file could not be read. Re-preview after fixing the pick, or upload the CSV manually below.`
				);
			}
			const gregorianYear = String(Number(rocYear) + 1911);
			const cache = await ctx.runMutation(internal.esl.holidayWrites.saveGovYearCache, {
				year: gregorianYear,
				rows,
				fetchedAt: Date.now()
			});
			years.push({
				rocYear,
				fileName: file.name,
				status: 'ok' as const,
				days: rows.length,
				holidays: rows.filter((row) => row.isHoliday).length,
				cache: { inserted: cache.inserted, updated: cache.updated, deleted: cache.deleted }
			});
			allRows.push(...rows);
		}

		const events = await ctx.runMutation(internal.esl.holidayWrites.applyOffDayRows, {
			semesterId: args.semesterId,
			rows: allRows
		});
		return { years, events };
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
