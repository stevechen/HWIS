import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import { shiftEslDate, suggestedS1EndDate, suggestedS2EndDate } from '../shared/esl';

const YEAR = '2025-2026';

async function adminContext() {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	return t;
}

describe('esl/semesters.create', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates an S1 semester with an explicit start date', async () => {
		const t = await adminContext();
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		expect(semesterId).toBeTruthy();
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester).toMatchObject({ year: YEAR, term: 'S1', startDate: '2025-08-31' });
	});

	it('refuses a duplicate (year, term) semester', async () => {
		const t = await adminContext();
		await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		await expect(
			t.mutation(api.esl.semesters.create, {
				year: YEAR,
				term: 'S1',
				startDate: '2025-09-01'
			})
		).rejects.toThrow();
	});

	it('refuses a malformed start date', async () => {
		const t = await adminContext();
		await expect(
			t.mutation(api.esl.semesters.create, {
				year: YEAR,
				term: 'S1',
				startDate: 'not-a-date'
			})
		).rejects.toThrow();
	});

	it('refuses semester creation for non-admin staff', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(
			t.mutation(api.esl.semesters.create, {
				year: YEAR,
				term: 'S1',
				startDate: '2025-08-31'
			})
		).rejects.toThrow(/ESL admin/);
	});
});

describe('esl/semesters.endDateDefault (#209)', () => {
	const CNY_2026_CSV = `西元日期,星期,是否放假,備註
20260101,四,2,元旦
20260215,日,0,
20260216,一,2,春節
20260217,二,2,春節
20260218,三,0,`;

	const NO_CNY_CSV = `西元日期,星期,是否放假,備註
20260101,四,2,元旦
20260216,一,0,
20260217,二,0,`;

	it('proposes July 1 of the second calendar year for S2 with no cache', async () => {
		const t = await adminContext();
		const result = await t.query(api.esl.semesters.endDateDefault, { year: YEAR, term: 'S2' });
		expect(result).toEqual({ status: 'ready', date: '2026-07-01', cnyRunStart: null });
	});

	it('resolves the 春節 run start from cache and proposes start−14d for S1', async () => {
		const t = await adminContext();
		await t.mutation(api.esl.holidays.upload, { year: '2026', csvText: CNY_2026_CSV });
		const result = await t.query(api.esl.semesters.endDateDefault, { year: YEAR, term: 'S1' });
		expect(result).toEqual({ status: 'ready', date: '2026-02-02', cnyRunStart: '2026-02-16' });
	});

	it('reports missing-cache for S1 when the second year was never uploaded', async () => {
		const t = await adminContext();
		const result = await t.query(api.esl.semesters.endDateDefault, { year: YEAR, term: 'S1' });
		expect(result).toEqual({ status: 'missing-cache', year: '2026' });
	});

	it('reports unresolved when the cache holds no 春節 run', async () => {
		const t = await adminContext();
		await t.mutation(api.esl.holidays.upload, { year: '2026', csvText: NO_CNY_CSV });
		const result = await t.query(api.esl.semesters.endDateDefault, { year: YEAR, term: 'S1' });
		expect(result).toEqual({ status: 'unresolved', year: '2026' });
	});

	it('refuses a malformed school year', async () => {
		const t = await adminContext();
		await expect(
			t.query(api.esl.semesters.endDateDefault, { year: '2026', term: 'S1' })
		).rejects.toThrow(/YYYY-YYYY/);
	});
});

describe('semester end-date math (#209)', () => {
	it('shifts back 14 calendar days across a month boundary', () => {
		expect(shiftEslDate('2026-02-16', -14)).toBe('2026-02-02');
	});

	it('shifts back across a year boundary', () => {
		expect(shiftEslDate('2026-01-05', -14)).toBe('2025-12-22');
	});

	it('shifts forward across a month boundary', () => {
		expect(shiftEslDate('2026-02-02', 14)).toBe('2026-02-16');
	});

	it('proposes the S1 end 14 days before the CNY run start', () => {
		expect(suggestedS1EndDate('2026-02-16')).toBe('2026-02-02');
	});

	it('proposes July 1 of the second calendar year for S2', () => {
		expect(suggestedS2EndDate('2025-2026')).toBe('2026-07-01');
	});
});
describe('esl/semesters derived end', () => {
	it('is null before the first final exam exists (finals TBD)', async () => {
		const t = await adminContext();
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester?.derivedEnd).toBeNull();
	});

	it('pins to the max exam date once finals exist', async () => {
		const t = await adminContext();
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		// Tue 2026-01-20 fans out to three days: the end pins to the last one.
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Final Exam',
			date: '2026-01-20'
		});
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester?.derivedEnd).toBe('2026-01-22');
	});
});
