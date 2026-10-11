import { action, mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from '../auth';
import { api } from '../_generated/api';
import type { MutationCtx, QueryCtx, ActionCtx } from '../_generated/server';

/**
 * Parses a CSV text with headers: 西元日期,星期,是否放假,備註
 * Handles both Big5 (file 114) and UTF-8-BOM (files 115/116) encodings.
 * The caller must handle encoding conversion before calling this.
 *
 * Returns an array of parsed rows with:
 * - date: YYYY-MM-DD (converted from YYYYMMDD)
 * - weekday: 0=Sun .. 6=Sat
 * - isOffDay: true if 是否放假 === '2'
 * - note: 備註 (optional)
 */
export function parseHolidayCsv(text: string): Array<{
	date: string;
	weekday: number;
	isOffDay: boolean;
	note: string;
}> {
	// Remove BOM if present
	const cleanText = text.replace(/^\ufeff/, '');

	// Normalize line endings
	const normalized = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = normalized.split('\n').filter((line) => line.trim() !== '');

	if (lines.length === 0) {
		throw new Error('CSV file is empty');
	}

	// Parse headers
	const headers = lines[0].split(',').map((h) => h.trim());
	const expectedHeaders = ['西元日期', '星期', '是否放假', '備註'];

	// Validate headers (allow extra columns but require these four)
	for (const expected of expectedHeaders) {
		if (!headers.includes(expected)) {
			throw new Error(`Missing required header: ${expected}`);
		}
	}

	const dateIdx = headers.indexOf('西元日期');
	const weekdayIdx = headers.indexOf('星期');
	const isOffDayIdx = headers.indexOf('是否放假');
	const noteIdx = headers.indexOf('備註');

	const results: Array<{
		date: string;
		weekday: number;
		isOffDay: boolean;
		note: string;
	}> = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		// Simple CSV parsing - handles quoted fields
		const cells: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let j = 0; j < line.length; j++) {
			const char = line[j];
			const nextChar = line[j + 1];

			if (char === '"') {
				if (inQuotes && nextChar === '"') {
					current += '"';
					j++;
				} else {
					inQuotes = !inQuotes;
				}
				continue;
			}

			if (char === ',' && !inQuotes) {
				cells.push(current.trim());
				current = '';
				continue;
			}

			current += char;
		}
		cells.push(current.trim());

		if (cells.length <= Math.max(dateIdx, weekdayIdx, isOffDayIdx, noteIdx)) {
			continue; // Skip malformed rows
		}

		const dateStr = cells[dateIdx]?.trim();
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const _weekdayStr = cells[weekdayIdx]?.trim();
		const isOffDayStr = cells[isOffDayIdx]?.trim();
		const note = cells[noteIdx]?.trim() || '';

		if (!dateStr || !/^\d{8}$/.test(dateStr)) {
			continue; // Skip rows with invalid date format
		}

		// Parse YYYYMMDD to YYYY-MM-DD
		const year = dateStr.slice(0, 4);
		const month = dateStr.slice(4, 6);
		const day = dateStr.slice(6, 8);
		const formattedDate = `${year}-${month}-${day}`;

		// Validate date
		const dateObj = new Date(`${year}-${month}-${day}T00:00:00`);
		if (isNaN(dateObj.getTime())) {
			continue;
		}

		// Weekday: 0=Sun .. 6=Sat (matching JS Date.getDay())
		const weekday = dateObj.getDay();

		// 是否放假: "2" = off day (holiday), "0" or "1" = regular day
		const isOffDay = isOffDayStr === '2';

		results.push({
			date: formattedDate,
			weekday,
			isOffDay,
			note
		});
	}

	return results;
}

/**
 * Handler for uploadCalendarCsv mutation.
 * Parses CSV and stores rows in esl_holiday_cache, overwriting existing year.
 */
export async function uploadCalendarCsvHandler(
	ctx: MutationCtx,
	args: { calendarYear: string; csvText: string; e2eTag?: string }
) {
	await requireAdminForSensitiveOperation(ctx);

	const { calendarYear, csvText } = args;

	// Parse the CSV
	const parsedRows = parseHolidayCsv(csvText);

	if (parsedRows.length === 0) {
		throw new Error('No valid rows found in CSV');
	}

	// Delete existing rows for this calendar year
	const existingRows = await ctx.db
		.query('esl_holiday_cache')
		.withIndex('by_calendarYear', (q) => q.eq('calendarYear', calendarYear))
		.collect();

	for (const row of existingRows) {
		await ctx.db.delete(row._id);
	}

	// Insert new rows
	let insertedCount = 0;
	for (const row of parsedRows) {
		await ctx.db.insert('esl_holiday_cache', {
			calendarYear,
			date: row.date,
			weekday: row.weekday,
			isOffDay: row.isOffDay,
			note: row.note,
			uploadedAt: Date.now()
		});
		insertedCount++;
	}

	return {
		calendarYear,
		insertedCount,
		deletedCount: existingRows.length,
		changedCount: insertedCount + existingRows.length // total rows affected
	};
}

/**
 * Mutation to upload and parse a calendar CSV for a specific year.
 * Overwrites existing rows for that calendar year.
 * Returns the number of rows inserted and changed.
 */
export const uploadCalendarCsv = mutation({
	args: {
		calendarYear: v.string(),
		csvText: v.string(), // Already decoded from Big5 or UTF-8-BOM
		e2eTag: v.optional(v.string())
	},
	handler: uploadCalendarCsvHandler
});

/**
 * Handler for uploadCalendarCsvAction action.
 * Accepts a base64-encoded file content and detects encoding (Big5 vs UTF-8-BOM).
 */
export async function uploadCalendarCsvActionHandler(
	ctx: ActionCtx,
	args: { calendarYear: string; fileBase64: string; fileName: string; e2eTag?: string }
) {
	await requireAdminForSensitiveOperation(ctx);

	const { calendarYear, fileBase64 } = args;

	// Decode base64
	const buffer = Buffer.from(fileBase64, 'base64');

	// Detect encoding: check for UTF-8 BOM (EF BB BF)
	let csvText: string;
	const hasUtf8Bom =
		buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;

	if (hasUtf8Bom) {
		// UTF-8 with BOM - strip BOM and decode as UTF-8
		csvText = buffer.subarray(3).toString('utf-8');
	} else {
		// Assume Big5 encoding (file 114)
		// Use TextDecoder with 'big5' encoding
		const decoder = new TextDecoder('big5');
		csvText = decoder.decode(buffer);
	}

	// Call the mutation to parse and store
	const result = await ctx.runMutation(api.esl.seed.uploadCalendarCsv, {
		calendarYear,
		csvText,
		e2eTag: args.e2eTag
	});

	return result;
}

/**
 * Action to upload a calendar CSV file (handles file upload and encoding).
 * Accepts a base64-encoded file content and detects encoding (Big5 vs UTF-8-BOM).
 */
export const uploadCalendarCsvAction = action({
	args: {
		calendarYear: v.string(),
		fileBase64: v.string(), // Base64 encoded file content
		fileName: v.string(),
		e2eTag: v.optional(v.string())
	},
	handler: uploadCalendarCsvActionHandler
});

/**
 * Handler for getHolidayCache query.
 */
export async function getHolidayCacheHandler(ctx: QueryCtx, args: { calendarYear: string }) {
	const rows = await ctx.db
		.query('esl_holiday_cache')
		.withIndex('by_calendarYear', (q) => q.eq('calendarYear', args.calendarYear))
		.collect();

	// Sort by date
	rows.sort((a, b) => a.date.localeCompare(b.date));

	return rows;
}

/**
 * Query to get all holiday cache rows for a calendar year.
 */
export const getHolidayCache = query({
	args: {
		calendarYear: v.string()
	},
	handler: getHolidayCacheHandler
});

/**
 * Handler for isOffDay query.
 */
export async function isOffDayHandler(ctx: QueryCtx, args: { calendarYear: string; date: string }) {
	const row = await ctx.db
		.query('esl_holiday_cache')
		.withIndex('by_calendarYear_date', (q) =>
			q.eq('calendarYear', args.calendarYear).eq('date', args.date)
		)
		.first();

	return row?.isOffDay ?? false;
}

/**
 * Query to check if a specific date is an off day.
 */
export const isOffDay = query({
	args: {
		calendarYear: v.string(),
		date: v.string() // YYYY-MM-DD
	},
	handler: isOffDayHandler
});
