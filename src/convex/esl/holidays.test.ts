import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import {
	decodeHolidayBytes,
	govListingRocYears,
	gregorianToRocYear,
	parseGovDatasetFiles,
	parseHolidayCsv,
	pickGovFileForYear,
	translateHolidayCaption
} from './holidays';
import { classifyOffDayRow, semesterImportWindow } from './holidayWrites';
// Dataset-14718 fixtures: test/seed only, never a production read path.
import fixture115 from '../../../tests/fixtures/esl-holiday/115.csv?raw';
import fixture116 from '../../../tests/fixtures/esl-holiday/116.csv?raw';

describe('holidays.parseHolidayCsv', () => {
	it('parses UTF-8-BOM text with the official headers', () => {
		const csvText = `\ufeff西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,
20250103,五,0,`;
		const rows = parseHolidayCsv(csvText);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toEqual({ date: '20250101', isHoliday: true, caption: '元旦' });
		expect(rows[1]).toEqual({ date: '20250102', isHoliday: false, caption: '' });
		expect(rows[2]).toEqual({ date: '20250103', isHoliday: false, caption: '' });
	});

	it('parses the same content without a BOM', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,`;
		const rows = parseHolidayCsv(csvText);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.isHoliday).toBe(true);
		expect(rows[1]?.isHoliday).toBe(false);
	});

	it('maps 是否放假=2 to off and keeps official makeup rows authoritative', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250530,五,2,補假
20250531,六,2,端午節
20250601,日,0,`;
		const rows = parseHolidayCsv(csvText);
		expect(rows).toEqual([
			{ date: '20250530', isHoliday: true, caption: '補假' },
			{ date: '20250531', isHoliday: true, caption: '端午節' },
			{ date: '20250601', isHoliday: false, caption: '' }
		]);
	});

	it('treats 是否放假=0 and =1 as workdays', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250102,四,1,
20250103,五,0,`;
		const rows = parseHolidayCsv(csvText);
		expect(rows[0]?.isHoliday).toBe(false);
		expect(rows[1]?.isHoliday).toBe(false);
	});

	it('handles quoted notes containing commas', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,"元旦, 新年"`;
		const rows = parseHolidayCsv(csvText);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.caption).toBe('元旦, 新年');
	});

	it('skips rows with non-YYYYMMDD dates but keeps the valid ones', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
not-a-date,四,0,
20250103,五,0,`;
		const rows = parseHolidayCsv(csvText);
		expect(rows.map((row) => row.date)).toEqual(['20250101', '20250103']);
	});

	it('skips impossible calendar dates', () => {
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20251345,四,0,X
20250103,五,0,`;
		const rows = parseHolidayCsv(csvText);
		expect(rows.map((row) => row.date)).toEqual(['20250101', '20250103']);
	});

	it('throws when a required header is missing', () => {
		const csvText = `西元日期,星期,備註
20250101,三,元旦`;
		expect(() => parseHolidayCsv(csvText)).toThrow('Missing required header: 是否放假');
	});

	it('throws on empty input', () => {
		expect(() => parseHolidayCsv('')).toThrow('CSV file is empty');
	});

	it('throws when no row has a valid YYYYMMDD date', () => {
		const csvText = `西元日期,星期,是否放假,備註
not-a-date,四,0,`;
		expect(() => parseHolidayCsv(csvText)).toThrow('No valid rows found in CSV');
	});

	it('tolerates extra columns', () => {
		const csvText = `西元日期,星期,是否放假,備註,extra
20250101,三,2,元旦,x`;
		const rows = parseHolidayCsv(csvText);
		expect(rows).toEqual([{ date: '20250101', isHoliday: true, caption: '元旦' }]);
	});
});

describe('holidays.decodeHolidayBytes', () => {
	it('strips a UTF-8 BOM and decodes as UTF-8', () => {
		const csvText = `\ufeff西元日期,星期,是否放假,備註
20250101,三,2,元旦
`;
		const bytes = new TextEncoder().encode(csvText);
		expect(decodeHolidayBytes(bytes)).toBe(
			`西元日期,星期,是否放假,備註
20250101,三,2,元旦
`
		);
	});

	it('decodes Big5 bytes (ROC-114 fixture, no BOM)', () => {
		// Byte-for-byte copy of tests/fixtures/esl-holiday/114.csv (?raw
		// would mis-decode Big5 as UTF-8, so the bytes ride inline here).
		const bytes = new Uint8Array([
			0xa6, 0xe8, 0xa4, 0xb8, 0xa4, 0xe9, 0xb4, 0xc1, 0x2c, 0xac, 0x50, 0xb4, 0xc1, 0x2c, 0xac,
			0x4f, 0xa7, 0x5f, 0xa9, 0xf1, 0xb0, 0xb2, 0x2c, 0xb3, 0xc6, 0xb5, 0xf9, 0x0a, 0x32, 0x30,
			0x32, 0x35, 0x30, 0x31, 0x30, 0x31, 0x2c, 0xa4, 0x54, 0x2c, 0x32, 0x2c, 0xa4, 0xb8, 0xa5,
			0xb9, 0x0a, 0x32, 0x30, 0x32, 0x35, 0x30, 0x31, 0x30, 0x32, 0x2c, 0xa5, 0x7c, 0x2c, 0x30,
			0x2c, 0x0a, 0x32, 0x30, 0x32, 0x35, 0x30, 0x31, 0x30, 0x33, 0x2c, 0xa4, 0xad, 0x2c, 0x30,
			0x2c, 0x0a, 0x32, 0x30, 0x32, 0x35, 0x30, 0x35, 0x33, 0x30, 0x2c, 0xa4, 0xad, 0x2c, 0x32,
			0x2c, 0xb8, 0xc9, 0xb0, 0xb2, 0x0a, 0x32, 0x30, 0x32, 0x35, 0x30, 0x35, 0x33, 0x31, 0x2c,
			0xa4, 0xbb, 0x2c, 0x32, 0x2c, 0xba, 0xdd, 0xa4, 0xc8, 0xb8, 0x60, 0x0a, 0x32, 0x30, 0x32,
			0x35, 0x31, 0x30, 0x30, 0x36, 0x2c, 0xa4, 0x40, 0x2c, 0x32, 0x2c, 0xa4, 0xa4, 0xac, 0xee,
			0xb8, 0x60, 0x0a
		]);
		expect(parseHolidayCsv(decodeHolidayBytes(bytes))).toEqual([
			{ date: '20250101', isHoliday: true, caption: '元旦' },
			{ date: '20250102', isHoliday: false, caption: '' },
			{ date: '20250103', isHoliday: false, caption: '' },
			{ date: '20250530', isHoliday: true, caption: '補假' },
			{ date: '20250531', isHoliday: true, caption: '端午節' },
			{ date: '20251006', isHoliday: true, caption: '中秋節' }
		]);
	});

	it('parses the UTF-8-BOM ROC-115 fixture', () => {
		expect(parseHolidayCsv(fixture115)).toEqual([
			{ date: '20260101', isHoliday: true, caption: '元旦' },
			{ date: '20260102', isHoliday: false, caption: '' },
			{ date: '20260216', isHoliday: true, caption: '春節' },
			{ date: '20260217', isHoliday: true, caption: '春節' },
			{ date: '20260619', isHoliday: true, caption: '端午節' }
		]);
	});

	it('parses the UTF-8-BOM ROC-116 fixture', () => {
		expect(parseHolidayCsv(fixture116)).toEqual([
			{ date: '20270101', isHoliday: true, caption: '元旦' },
			{ date: '20270102', isHoliday: false, caption: '' },
			{ date: '20270915', isHoliday: true, caption: '中秋節' }
		]);
	});
});

describe('holidays.translateHolidayCaption', () => {
	// The cleaned #208 map: one 端午節 key (dup merged), 春節 kept as the
	// Chinese New Year fallback.
	const KNOWN: [string, string][] = [
		['開國紀念日', "New Year's Day"],
		['補假', 'Compensatory day off'],
		['和平紀念日', 'Peace Memorial Day'],
		['兒童節及民族掃墓節', "Children's Day and Tomb-Sweeping Day"],
		['兒童節', "Children's Day"],
		['民族掃墓節', 'Tomb-Sweeping Day'],
		['清明節', 'Tomb-Sweeping Day'],
		['端午節', 'Dragon Boat Festival'],
		['中秋節', 'Moon Festival'],
		['國慶日', 'Double Tenth Day'],
		['勞動節', 'Labor Day'],
		['孔子誕辰紀念日/教師節', "Teacher's Day"],
		['教師節', "Teacher's Day"],
		['臺灣光復暨金門古寧頭大捷紀念日', 'Retrocession Day'],
		['行憲紀念日', 'Xmas'],
		['小年夜', "Lunar New Year's Eve"],
		['農曆除夕', "Lunar New Year's Eve"],
		['春節', 'Chinese New Year']
	];

	it.each(KNOWN)('translates %s without flagging it', (caption, english) => {
		expect(translateHolidayCaption(caption)).toEqual({ english, needsTranslation: false });
	});

	it('stores an unknown caption verbatim and flags it for manual translation', () => {
		// 元旦 (the CSV's Jan-1 shorthand) is deliberately outside the #208
		// list, so it rides through verbatim until a human translates it.
		expect(translateHolidayCaption('元旦')).toEqual({
			english: '元旦',
			needsTranslation: true
		});
	});

	it('leaves empty captions unflagged — workday rows carry no note', () => {
		expect(translateHolidayCaption('')).toEqual({ english: '', needsTranslation: false });
	});
});

const UPLOAD_V1 = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,
20250103,五,0,`;

const UPLOAD_V2 = `西元日期,星期,是否放假,備註
20250101,三,2,元旦新年
20250102,四,2,補假
20250104,六,0,`;

async function adminHarness() {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	return t;
}

describe('holidays.upload', () => {
	afterEach(() => vi.restoreAllMocks());

	it('stores every row year-keyed and reports inserted days + holidays', async () => {
		const t = await adminHarness();
		const result = await t.mutation(api.esl.holidays.upload, {
			year: '2025',
			csvText: UPLOAD_V1
		});
		expect(result).toEqual({
			year: '2025',
			inserted: 3,
			updated: 0,
			deleted: 0,
			days: 3,
			holidays: 1
		});
		const cached = await t.query(api.esl.holidays.getByYear, { year: '2025' });
		expect(cached.map((row) => [row.date, row.isHoliday, row.caption])).toEqual([
			['20250101', true, '元旦'],
			['20250102', false, ''],
			['20250103', false, '']
		]);
		expect(cached.every((row) => row.year === '2025')).toBe(true);
	});

	it('re-upload overwrites the year and reports inserted/updated/deleted', async () => {
		const t = await adminHarness();
		await t.mutation(api.esl.holidays.upload, { year: '2025', csvText: UPLOAD_V1 });
		const result = await t.mutation(api.esl.holidays.upload, {
			year: '2025',
			csvText: UPLOAD_V2
		});
		// 01-01 caption changed, 01-02 flipped to off, 01-04 added, 01-03 gone.
		expect(result).toEqual({
			year: '2025',
			inserted: 1,
			updated: 2,
			deleted: 1,
			days: 3,
			holidays: 2
		});
		const cached = await t.query(api.esl.holidays.getByYear, { year: '2025' });
		expect(cached.map((row) => row.date)).toEqual(['20250101', '20250102', '20250104']);
	});

	it('re-uploading identical content reports zero changes', async () => {
		const t = await adminHarness();
		await t.mutation(api.esl.holidays.upload, { year: '2025', csvText: UPLOAD_V1 });
		const result = await t.mutation(api.esl.holidays.upload, {
			year: '2025',
			csvText: UPLOAD_V1
		});
		expect(result).toMatchObject({ inserted: 0, updated: 0, deleted: 0, days: 3 });
	});

	it('leaves other years untouched', async () => {
		const t = await adminHarness();
		await t.mutation(api.esl.holidays.upload, { year: '2025', csvText: UPLOAD_V1 });
		await t.mutation(api.esl.holidays.upload, { year: '2026', csvText: UPLOAD_V2 });
		expect((await t.query(api.esl.holidays.getByYear, { year: '2025' })).length).toBe(3);
		expect((await t.query(api.esl.holidays.getByYear, { year: '2026' })).length).toBe(3);
	});

	it('refuses non-admin staff', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(
			t.mutation(api.esl.holidays.upload, { year: '2025', csvText: UPLOAD_V1 })
		).rejects.toThrow(/ESL admin/);
	});

	it('refuses a non-YYYY year', async () => {
		const t = await adminHarness();
		await expect(
			t.mutation(api.esl.holidays.upload, { year: '2025-2026', csvText: UPLOAD_V1 })
		).rejects.toThrow(/calendar year/);
	});

	it('stores unknown captions verbatim and flags them for manual translation', async () => {
		const t = await adminHarness();
		// 元旦 is outside the #208 map; 端午節 and 補假 are in it.
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250530,五,2,補假
20250531,六,2,端午節
20250102,四,0,`;
		await t.mutation(api.esl.holidays.upload, { year: '2025', csvText });
		const cached = await t.query(api.esl.holidays.getByYear, { year: '2025' });
		const byDate = new Map(cached.map((row) => [row.date, row]));
		expect(byDate.get('20250101')).toMatchObject({
			caption: '元旦',
			needsTranslation: true
		});
		expect(byDate.get('20250530')).toMatchObject({
			caption: '補假',
			needsTranslation: false
		});
		expect(byDate.get('20250531')).toMatchObject({
			caption: '端午節',
			needsTranslation: false
		});
		expect(byDate.get('20250102')).toMatchObject({ caption: '', needsTranslation: false });
	});

	it('refreshes the flag when a re-uploaded caption changes', async () => {
		const t = await adminHarness();
		await t.mutation(api.esl.holidays.upload, { year: '2025', csvText: UPLOAD_V1 });
		// 01-01 元旦 (unknown) -> 開國紀念日 (known): the flag must clear.
		const csvText = `西元日期,星期,是否放假,備註
20250101,三,2,開國紀念日
20250102,四,0,
20250103,五,0,`;
		await t.mutation(api.esl.holidays.upload, { year: '2025', csvText });
		const cached = await t.query(api.esl.holidays.getByYear, { year: '2025' });
		expect(cached.find((row) => row.date === '20250101')).toMatchObject({
			caption: '開國紀念日',
			needsTranslation: false
		});
	});
});

const OFFDAY_CSV = `西元日期,星期,是否放假,備註
20260925,五,2,中秋節
20260926,六,2,
20260927,日,2,
20260928,一,2,孔子誕辰紀念日/教師節
20260929,二,0,
20261010,六,2,國慶日`;

async function semesterHarness() {
	const t = await adminHarness();
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: '2026-2027',
		term: 'S1',
		startDate: '2026-08-31',
		eslRoomLimit: 'D'
	});
	return { t, semesterId };
}

describe('holidays.importOffDays', () => {
	afterEach(() => vi.restoreAllMocks());

	it('stamps named off days as locked-title Off events with translated notes', async () => {
		const { t, semesterId } = await semesterHarness();
		const result = await t.mutation(api.esl.holidays.importOffDays, {
			semesterId,
			csvText: OFFDAY_CSV
		});
		expect(result).toEqual({
			inserted: 2,
			skippedTaken: 0,
			outOfRange: 0,
			plainWeekends: 2,
			weekendHolidays: 1,
			needsReview: [],
			insertedDays: [
				{ date: '2026-09-25', name: 'Moon Festival' },
				{ date: '2026-09-28', name: "Teacher's Day" }
			]
		});
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({
			type: 'no_school',
			title: 'Off',
			target: 'all',
			date: '2026-09-25',
			note: 'Moon Festival'
		});
		expect(events[1]).toMatchObject({
			type: 'no_school',
			title: 'Off',
			target: 'all',
			date: '2026-09-28',
			note: "Teacher's Day"
		});
	});

	it('is idempotent: re-imports skip taken dates instead of overwriting', async () => {
		const { t, semesterId } = await semesterHarness();
		await t.mutation(api.esl.holidays.importOffDays, { semesterId, csvText: OFFDAY_CSV });
		const result = await t.mutation(api.esl.holidays.importOffDays, {
			semesterId,
			csvText: OFFDAY_CSV
		});
		expect(result).toMatchObject({ inserted: 0, skippedTaken: 2 });
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events).toHaveLength(2);
	});

	it('flags unknown captions for human review but still imports them', async () => {
		const { t, semesterId } = await semesterHarness();
		const csvText = `西元日期,星期,是否放假,備註
20260925,五,2,中秋節
20261030,五,2,萬聖節同樂會`;
		const result = await t.mutation(api.esl.holidays.importOffDays, {
			semesterId,
			csvText
		});
		expect(result.inserted).toBe(2);
		expect(result.needsReview).toEqual(['2026-10-30 萬聖節同樂會']);
	});

	it('skips rows outside the semester window', async () => {
		const { t, semesterId } = await semesterHarness();
		// S1 starts 2026-08-31 with no S2 yet, so the window is
		// [2026-08-31, 2027-02-01): 08-30 predates it, 2027-03-01 is past it.
		const csvText = `西元日期,星期,是否放假,備註
20260830,日,2,開學前補假
20270301,一,2,補假
20260925,五,2,中秋節`;
		const result = await t.mutation(api.esl.holidays.importOffDays, {
			semesterId,
			csvText
		});
		expect(result).toMatchObject({ inserted: 1, outOfRange: 2, plainWeekends: 0 });
	});

	it('caps the S1 window where its S2 sibling begins', async () => {
		const { t, semesterId } = await semesterHarness();
		await t.mutation(api.esl.semesters.create, {
			year: '2026-2027',
			term: 'S2',
			startDate: '2027-02-09'
		});
		const csvText = `西元日期,星期,是否放假,備註
20270201,一,2,補假
20270209,二,2,補假`;
		const result = await t.mutation(api.esl.holidays.importOffDays, {
			semesterId,
			csvText
		});
		// 02-09 is S2's start: outside S1, reported rather than stamped.
		expect(result).toMatchObject({ inserted: 1, outOfRange: 1 });
	});

	it('refuses non-admin staff', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		const semesterId = await t.run(async (ctx) => {
			return await ctx.db.insert('esl_semesters', {
				year: '2026-2027',
				term: 'S1',
				startDate: '2026-08-31'
			});
		});
		await expect(
			t.mutation(api.esl.holidays.importOffDays, { semesterId, csvText: OFFDAY_CSV })
		).rejects.toThrow(/ESL admin/);
	});
});

describe('holidays.govListing', () => {
	it('maps Gregorian years to ROC years, current plus next', () => {
		expect(gregorianToRocYear(2026)).toBe('115');
		expect(govListingRocYears('2026-10-12')).toEqual(['115', '116']);
		expect(govListingRocYears('2027-01-01')).toEqual(['116', '117']);
	});
});

const GOV_PAGE_HTML = `<!doctype html><html><body>
<a href="https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202506/aaa.csv&amp;nfix=&amp;name=${encodeURIComponent('115年中華民國政府行政機關辦公日曆表.csv')}">115</a>
<a href="https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202507/bbb.csv&amp;nfix=&amp;name=${encodeURIComponent('115年中華民國政府行政機關辦公日曆表_Google行事曆專用.csv')}">115 Google</a>
<a href="https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202506/aaa.csv&amp;nfix=&amp;name=${encodeURIComponent('115年中華民國政府行政機關辦公日曆表.csv')}">115 again</a>
<a href="https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202607/ccc.csv&amp;nfix=&amp;name=${encodeURIComponent('116年中華民國政府行政機關辦公日曆表_utf8bom.csv')}">116</a>
<a href="/dataset/14718">not a file</a>
</body></html>`;

describe('holidays.parseGovDatasetFiles', () => {
	it('keeps standard files, drops the Google flavour and repeats', () => {
		const files = parseGovDatasetFiles(GOV_PAGE_HTML);
		expect(files.map((file) => file.rocYear)).toEqual(['115', '116']);
		expect(files[0]).toMatchObject({
			rocYear: '115',
			name: '115年中華民國政府行政機關辦公日曆表.csv'
		});
		expect(files[0]?.url).toContain('https://www.dgpa.gov.tw/FileConversion?filename=');
		expect(files[0]?.url).not.toContain('&amp;');
	});

	it('prefers a marked correction twin, else page order, else null', () => {
		const files = parseGovDatasetFiles(GOV_PAGE_HTML);
		expect(pickGovFileForYear(files, '115')?.name).toContain('115年');
		expect(pickGovFileForYear(files, '117')).toBeNull();
		const twins = [
			{ rocYear: '114', name: '114年中華民國政府行政機關辦公日曆表.csv', url: 'https://x/old' },
			{
				rocYear: '114',
				name: '114年中華民國政府行政機關辦公日曆表(1141020更新).csv',
				url: 'https://x/new'
			}
		];
		expect(pickGovFileForYear(twins, '114')?.url).toBe('https://x/new');
	});
});

describe('holidayWrites.semesterImportWindow', () => {
	it('caps S1 where its S2 sibling begins', () => {
		expect(
			semesterImportWindow({
				year: '2026-2027',
				term: 'S1',
				startDate: '2026-08-31',
				siblingStart: '2027-02-09'
			})
		).toEqual({ start: '2026-08-31', end: '2027-02-09' });
	});

	it('falls back to the conventional boundary without a sibling', () => {
		expect(
			semesterImportWindow({
				year: '2026-2027',
				term: 'S1',
				startDate: '2026-08-31',
				siblingStart: null
			})
		).toEqual({ start: '2026-08-31', end: '2027-02-01' });
		expect(
			semesterImportWindow({
				year: '2025-2026',
				term: 'S2',
				startDate: '2026-02-09',
				siblingStart: null
			})
		).toEqual({ start: '2026-02-09', end: '2026-08-01' });
	});
});

describe('holidayWrites.classifyOffDayRow', () => {
	const window = { start: '2026-08-31', end: '2027-02-01' };

	it('passes weekday named off days through as candidates', () => {
		expect(
			classifyOffDayRow({ date: '20260928', isHoliday: true, caption: '教師節' }, window)
		).toEqual({ kind: 'candidate', date: '2026-09-28' });
	});

	it('skips workdays, unnamed rows, out-of-window rows, and weekend holidays', () => {
		expect(classifyOffDayRow({ date: '20260929', isHoliday: false, caption: '' }, window)).toEqual({
			kind: 'workday'
		});
		expect(classifyOffDayRow({ date: '20260926', isHoliday: true, caption: '' }, window)).toEqual({
			kind: 'unnamed'
		});
		expect(
			classifyOffDayRow({ date: '20260101', isHoliday: true, caption: '開國紀念日' }, window)
		).toEqual({ kind: 'outOfRange' });
		// 2026-10-10 Double Tenth Day is a Saturday: named, in-window,
		// but never stamped — no meetings run on weekends.
		expect(
			classifyOffDayRow({ date: '20261010', isHoliday: true, caption: '國慶日' }, window)
		).toEqual({ kind: 'weekend' });
	});
});

const GOV_CSV_115 = `西元日期,星期,是否放假,備註
20260101,四,2,開國紀念日
20260103,六,2,
20260928,一,2,孔子誕辰紀念日/教師節
20260929,二,0,
20261010,六,2,國慶日`;

function stubGovFetch(csvByMarker: Record<string, string>) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockImplementation((url: string) => {
			if (url === 'https://data.gov.tw/dataset/14718') {
				return Promise.resolve({
					ok: true,
					status: 200,
					text: () => Promise.resolve(GOV_PAGE_HTML)
				});
			}
			const csv = Object.entries(csvByMarker).find(([marker]) => url.includes(marker))?.[1];
			if (csv === undefined) {
				return Promise.resolve({ ok: false, status: 404 });
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				arrayBuffer: () => Promise.resolve(new TextEncoder().encode(csv).buffer)
			});
		})
	);
}

describe('holidays.previewGovImport', () => {
	afterEach(() => vi.restoreAllMocks());

	it('previews in-window named off days with skip counts', async () => {
		const { t, semesterId } = await semesterHarness();
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		const preview = await t.action(api.esl.holidays.previewGovImport, {
			semesterId,
			rocYears: ['115']
		});
		expect(preview.years).toMatchObject([{ rocYear: '115', status: 'ok', holidays: 4 }]);
		expect(preview.days).toEqual([
			{ date: '2026-09-28', name: "Teacher's Day", needsReview: false }
		]);
		// 01-01 predates the 08-31 start; the bare Saturday carries no name.
		expect(preview).toMatchObject({ outOfRange: 1, plainWeekends: 1, skippedTaken: 0 });
	});

	it('marks unpublished years missing without failing the others', async () => {
		const { t, semesterId } = await semesterHarness();
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		const preview = await t.action(api.esl.holidays.previewGovImport, {
			semesterId,
			rocYears: ['115', '117']
		});
		expect(preview.years).toMatchObject([
			{ rocYear: '115', status: 'ok' },
			{ rocYear: '117', status: 'missing' }
		]);
		expect(preview.days).toHaveLength(1);
	});

	it('refuses bad year picks', async () => {
		const { t, semesterId } = await semesterHarness();
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		await expect(
			t.action(api.esl.holidays.previewGovImport, { semesterId, rocYears: [] })
		).rejects.toThrow(/one or two/);
		await expect(
			t.action(api.esl.holidays.previewGovImport, { semesterId, rocYears: ['1155'] })
		).rejects.toThrow(/ROC year/);
	});

	it('previews a not-yet-saved semester from draft context (wizard #223)', async () => {
		const t = await adminHarness();
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		const preview = await t.action(api.esl.holidays.previewGovImport, {
			draft: { year: '2026-2027', term: 'S1', startDate: '2026-08-31' },
			rocYears: ['115']
		});
		// Same window as the saved-semester harness above (no sibling yet).
		expect(preview.years).toMatchObject([{ rocYear: '115', status: 'ok', holidays: 4 }]);
		expect(preview.days).toEqual([
			{ date: '2026-09-28', name: "Teacher's Day", needsReview: false }
		]);
		expect(preview).toMatchObject({ outOfRange: 1, plainWeekends: 1, skippedTaken: 0 });
	});

	it('bounds the draft window at an already-saved sibling', async () => {
		const t = await adminHarness();
		await t.mutation(api.esl.semesters.create, {
			year: '2026-2027',
			term: 'S2',
			startDate: '2027-02-11'
		});
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		const preview = await t.action(api.esl.holidays.previewGovImport, {
			draft: { year: '2026-2027', term: 'S1', startDate: '2026-08-31' },
			rocYears: ['115']
		});
		// 2026-09-28 still lands inside (before the S2 start); the bound only
		// clips days past it.
		expect(preview.days).toEqual([
			{ date: '2026-09-28', name: "Teacher's Day", needsReview: false }
		]);
	});

	it('requires exactly one of semesterId or draft', async () => {
		const t = await adminHarness();
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		await expect(
			t.action(api.esl.holidays.previewGovImport, { rocYears: ['115'] })
		).rejects.toThrow(/exactly one/);
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: '2026-2027',
			term: 'S1',
			startDate: '2026-08-31',
			eslRoomLimit: 'D'
		});
		await expect(
			t.action(api.esl.holidays.previewGovImport, {
				semesterId,
				draft: { year: '2026-2027', term: 'S1', startDate: '2026-08-31' },
				rocYears: ['115']
			})
		).rejects.toThrow(/exactly one/);
	});
});

describe('holidays.importGovOffDays', () => {
	afterEach(() => vi.restoreAllMocks());

	it('stamps events and refreshes the cache, idempotently', async () => {
		const { t, semesterId } = await semesterHarness();
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		const first = await t.action(api.esl.holidays.importGovOffDays, {
			semesterId,
			rocYears: ['115']
		});
		expect(first.years).toMatchObject([{ rocYear: '115', status: 'ok' }]);
		expect(first.years[0]?.cache).toMatchObject({ inserted: 5, updated: 0, deleted: 0 });
		expect(first.events).toMatchObject({
			inserted: 1,
			outOfRange: 1,
			plainWeekends: 1,
			weekendHolidays: 1
		});

		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events.map((event) => [event.date, event.title])).toEqual([['2026-09-28', 'Off']]);
		const cached = await t.query(api.esl.holidays.getByYear, { year: '2026' });
		expect(cached).toHaveLength(5);

		const second = await t.action(api.esl.holidays.importGovOffDays, {
			semesterId,
			rocYears: ['115']
		});
		expect(second.events).toMatchObject({ inserted: 0, skippedTaken: 1 });
	});

	it('refuses a picked year with no listed file', async () => {
		const { t, semesterId } = await semesterHarness();
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		await expect(
			t.action(api.esl.holidays.importGovOffDays, { semesterId, rocYears: ['117'] })
		).rejects.toThrow(/no listed calendar file/);
	});

	it('fails cleanly when the dataset page is unreachable', async () => {
		const { t, semesterId } = await semesterHarness();
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		await expect(
			t.action(api.esl.holidays.importGovOffDays, { semesterId, rocYears: ['115'] })
		).rejects.toThrow(/manually below/);
	});

	it('refuses non-admin staff', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		stubGovFetch({ 'aaa.csv': GOV_CSV_115 });
		const semesterId = await t.run(async (ctx) => {
			return await ctx.db.insert('esl_semesters', {
				year: '2026-2027',
				term: 'S1',
				startDate: '2026-08-31'
			});
		});
		await expect(
			t.action(api.esl.holidays.importGovOffDays, { semesterId, rocYears: ['115'] })
		).rejects.toThrow(/ESL admin/);
	});
});
