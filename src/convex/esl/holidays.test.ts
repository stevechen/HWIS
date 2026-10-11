import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import { decodeHolidayBytes, parseHolidayCsv, translateHolidayCaption } from './holidays';
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
