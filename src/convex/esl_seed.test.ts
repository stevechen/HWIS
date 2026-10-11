import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { convexTest, modules, schema } from './test.setup';
import type { ActionCtx } from './_generated/server';
import {
	parseHolidayCsv,
	uploadCalendarCsvHandler,
	getHolidayCacheHandler,
	isOffDayHandler,
	uploadCalendarCsvActionHandler
} from './esl/seed';

let t: Awaited<ReturnType<typeof convexTest>>;

beforeAll(async () => {
	t = await convexTest(schema, modules);
});

describe('esl/seed - parseHolidayCsv', () => {
	it('parses UTF-8-BOM CSV with correct headers', () => {
		const csvText = `\ufeff西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,
20250103,五,0,`;

		const result = parseHolidayCsv(csvText);

		expect(result).toHaveLength(3);
		expect(result[0]).toEqual({
			date: '2025-01-01',
			weekday: 3, // Wednesday
			isOffDay: true,
			note: '元旦'
		});
		expect(result[1]).toEqual({
			date: '2025-01-02',
			weekday: 4, // Thursday
			isOffDay: false,
			note: ''
		});
		expect(result[2]).toEqual({
			date: '2025-01-03',
			weekday: 5, // Friday
			isOffDay: false,
			note: ''
		});
	});

	it('parses CSV without BOM', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,`;

		const result = parseHolidayCsv(csvText);

		expect(result).toHaveLength(2);
		expect(result[0].isOffDay).toBe(true);
		expect(result[1].isOffDay).toBe(false);
	});

	it('handles quoted fields with commas', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,"元旦, 新年"
20250102,四,0,`;

		const result = parseHolidayCsv(csvText);

		expect(result).toHaveLength(2);
		expect(result[0].note).toBe('元旦, 新年');
	});

	it('skips rows with invalid date format', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
invalid,四,0,
20250103,五,0,`;

		const result = parseHolidayCsv(csvText);

		expect(result).toHaveLength(2);
		expect(result[0].date).toBe('2025-01-01');
		expect(result[1].date).toBe('2025-01-03');
	});

	it('skips rows with invalid date values', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20251345,四,0,Invalid month/day
20250103,五,0,`;

		const result = parseHolidayCsv(csvText);

		expect(result).toHaveLength(2);
	});

	it('treats 是否放假=2 as off day, others as regular', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,Holiday
20250102,四,1,Regular
20250103,五,0,Regular
20250104,六,2,Saturday Holiday`;

		const result = parseHolidayCsv(csvText);

		expect(result[0].isOffDay).toBe(true);
		expect(result[1].isOffDay).toBe(false);
		expect(result[2].isOffDay).toBe(false);
		expect(result[3].isOffDay).toBe(true);
	});

	it('throws on missing required headers', () => {
		const csvText = `西元日期,星期,備註
20250101,三,元旦`;

		expect(() => parseHolidayCsv(csvText)).toThrow('Missing required header: 是否放假');
	});

	it('throws on empty CSV', () => {
		expect(() => parseHolidayCsv('')).toThrow('CSV file is empty');
	});

	it('handles extra columns gracefully', () => {
		const csvText = `西元日期,星期,是否放假,備註,ExtraCol
20250101,三,2,元旦,extra`;

		const result = parseHolidayCsv(csvText);

		expect(result).toHaveLength(1);
		expect(result[0].note).toBe('元旦');
	});
});

describe('esl/seed - uploadCalendarCsv mutation', () => {
	beforeEach(async () => {
		await t.run(async (ctx) => {
			// Clear any existing data
			const existing = await ctx.db.query('esl_holiday_cache').collect();
			for (const row of existing) {
				await ctx.db.delete(row._id);
			}
		});
	});

	it('inserts parsed rows and returns counts', async () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,
20250103,五,0,`;

		const result = await t.run(async (ctx) => {
			return uploadCalendarCsvHandler(ctx, { calendarYear: '2025', csvText });
		});

		expect(result.calendarYear).toBe('2025');
		expect(result.insertedCount).toBe(3);
		expect(result.deletedCount).toBe(0);
		expect(result.changedCount).toBe(3);

		// Verify data in DB
		const rows = await t.run(async (ctx) => {
			return getHolidayCacheHandler(ctx, { calendarYear: '2025' });
		});
		expect(rows).toHaveLength(3);
		expect(rows[0].isOffDay).toBe(true);
		expect(rows[1].isOffDay).toBe(false);
	});

	it('overwrites existing rows for the same year', async () => {
		const csvText1 = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,`;

		const csvText2 = `西元日期,星期,是否放假,備註
20250101,三,2,元旦 (updated)
20250102,四,2,補假
20250103,五,0,`;

		await t.run(async (ctx) => {
			return uploadCalendarCsvHandler(ctx, { calendarYear: '2025', csvText: csvText1 });
		});
		const result = await t.run(async (ctx) => {
			return uploadCalendarCsvHandler(ctx, { calendarYear: '2025', csvText: csvText2 });
		});

		expect(result.insertedCount).toBe(3);
		expect(result.deletedCount).toBe(2);
		expect(result.changedCount).toBe(5);

		const rows = await t.run(async (ctx) => {
			return getHolidayCacheHandler(ctx, { calendarYear: '2025' });
		});
		expect(rows).toHaveLength(3);
		expect(rows[0].note).toBe('元旦 (updated)');
		expect(rows[1].isOffDay).toBe(true); // Changed from 0 to 2
		expect(rows[2].date).toBe('2025-01-03');
	});

	it('throws when no valid rows', async () => {
		const csvText = `西元日期,星期,是否放假,備註
invalid,四,0,`;

		await expect(
			t.run(async (ctx) => {
				return uploadCalendarCsvHandler(ctx, { calendarYear: '2025', csvText });
			})
		).rejects.toThrow('No valid rows found in CSV');
	});
});

describe('esl/seed - getHolidayCache query', () => {
	beforeEach(async () => {
		await t.run(async (ctx) => {
			const existing = await ctx.db.query('esl_holiday_cache').collect();
			for (const row of existing) {
				await ctx.db.delete(row._id);
			}
		});
	});

	it('returns rows sorted by date', async () => {
		const csvText = `西元日期,星期,是否放假,備註
20250103,五,0,
20250101,三,2,元旦
20250102,四,0,`;

		await t.run(async (ctx) => {
			return uploadCalendarCsvHandler(ctx, { calendarYear: '2025', csvText });
		});

		const rows = await t.run(async (ctx) => {
			return getHolidayCacheHandler(ctx, { calendarYear: '2025' });
		});

		expect(rows).toHaveLength(3);
		expect(rows[0].date).toBe('2025-01-01');
		expect(rows[1].date).toBe('2025-01-02');
		expect(rows[2].date).toBe('2025-01-03');
	});

	it('returns empty array for non-existent year', async () => {
		const rows = await t.run(async (ctx) => {
			return getHolidayCacheHandler(ctx, { calendarYear: '2026' });
		});
		expect(rows).toHaveLength(0);
	});
});

describe('esl/seed - isOffDay query', () => {
	beforeEach(async () => {
		await t.run(async (ctx) => {
			const existing = await ctx.db.query('esl_holiday_cache').collect();
			for (const row of existing) {
				await ctx.db.delete(row._id);
			}
		});
	});

	it('returns true for off days', async () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦`;

		await t.run(async (ctx) => {
			return uploadCalendarCsvHandler(ctx, { calendarYear: '2025', csvText });
		});

		const result = await t.run(async (ctx) => {
			return isOffDayHandler(ctx, { calendarYear: '2025', date: '2025-01-01' });
		});
		expect(result).toBe(true);
	});

	it('returns false for regular days', async () => {
		const csvText = `西元日期,星期,是否放假,備註
20250102,四,0,`;

		await t.run(async (ctx) => {
			return uploadCalendarCsvHandler(ctx, { calendarYear: '2025', csvText });
		});

		const result = await t.run(async (ctx) => {
			return isOffDayHandler(ctx, { calendarYear: '2025', date: '2025-01-02' });
		});
		expect(result).toBe(false);
	});

	it('returns false for non-existent dates', async () => {
		const result = await t.run(async (ctx) => {
			return isOffDayHandler(ctx, { calendarYear: '2025', date: '2025-01-01' });
		});
		expect(result).toBe(false);
	});
});

describe('esl/seed - uploadCalendarCsvAction action', () => {
	beforeEach(async () => {
		await t.run(async (ctx) => {
			const existing = await ctx.db.query('esl_holiday_cache').collect();
			for (const row of existing) {
				await ctx.db.delete(row._id);
			}
		});
	});

	it('handles UTF-8-BOM encoded file', async () => {
		// Create a UTF-8-BOM CSV content
		const csvText = `\ufeff西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,`;
		const buffer = Buffer.from(csvText, 'utf-8');
		const fileBase64 = buffer.toString('base64');

		// Mock the runMutation to call the mutation handler directly
		const result = await t.run(async (ctx) => {
			// Create a mock ctx with runMutation that calls the handler
			const mockCtx: ActionCtx = {
				...ctx,
				runMutation: async (
					_apiRef: unknown,
					args: { calendarYear: string; csvText: string; e2eTag?: string }
				) => {
					return uploadCalendarCsvHandler(ctx, args);
				},
				auth: ctx.auth
			};
			return uploadCalendarCsvActionHandler(mockCtx, {
				calendarYear: '2025',
				fileBase64,
				fileName: 'calendar_2025.csv'
			});
		});

		expect(result.insertedCount).toBe(2);
		expect(result.calendarYear).toBe('2025');
	});

	it('handles Big5 encoded file (no BOM)', async () => {
		// Create a Big5 encoded CSV content using iconv-lite
		const iconv = await import('iconv-lite');
		const csvText = '西元日期,星期,是否放假,備註\n20250101,三,2,NewYear\n';
		const big5Buffer = iconv.default.encode(csvText, 'big5');
		const fileBase64 = big5Buffer.toString('base64');

		const result = await t.run(async (ctx) => {
			const mockCtx: ActionCtx = {
				...ctx,
				runMutation: async (
					_apiRef: unknown,
					args: { calendarYear: string; csvText: string; e2eTag?: string }
				) => {
					return uploadCalendarCsvHandler(ctx, args);
				},
				auth: ctx.auth
			};
			return uploadCalendarCsvActionHandler(mockCtx, {
				calendarYear: '2025',
				fileBase64,
				fileName: 'calendar_2025.csv'
			});
		});

		expect(result.insertedCount).toBe(1);
		expect(result.calendarYear).toBe('2025');
	});
});
