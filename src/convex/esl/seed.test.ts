import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import {
	findLunarOffCluster,
	fridayBeforeDate,
	isProtectedSeedEvent,
	isWeekendEslDate,
	suggestExamEndDate,
	weekdayDatesBetween
} from '../shared/esl';

describe('seed math: suggestExamEndDate', () => {
	it('adds N-1 weekdays for a mid-week start', () => {
		// Mon 2025-10-13 + 1 weekday = Tue 2025-10-14.
		expect(suggestExamEndDate('2025-10-13', 2)).toBe('2025-10-14');
		// Final exam: three weekdays from Monday lands Wednesday.
		expect(suggestExamEndDate('2025-10-13', 3)).toBe('2025-10-15');
	});

	it('skips weekends: a Friday two-day exam ends Monday', () => {
		expect(suggestExamEndDate('2025-10-17', 2)).toBe('2025-10-20');
	});

	it('skips weekends: a Friday three-day final ends Tuesday', () => {
		expect(suggestExamEndDate('2025-10-17', 3)).toBe('2025-10-21');
	});

	it('a one-day exam ends on its start', () => {
		expect(suggestExamEndDate('2025-10-13', 1)).toBe('2025-10-13');
	});
});

describe('seed math: weekend and Friday-before makeup', () => {
	it('detects weekend dates', () => {
		expect(isWeekendEslDate('2025-10-18')).toBe(true); // Saturday
		expect(isWeekendEslDate('2025-10-19')).toBe(true); // Sunday
		expect(isWeekendEslDate('2025-10-20')).toBe(false); // Monday
	});

	it('resolves the Friday before a Saturday off day', () => {
		expect(fridayBeforeDate('2025-10-18')).toBe('2025-10-17');
	});

	it('resolves the Friday before a Sunday off day', () => {
		expect(fridayBeforeDate('2025-10-19')).toBe('2025-10-17');
	});

	it('resolves the Friday before a mid-week date', () => {
		expect(fridayBeforeDate('2025-10-15')).toBe('2025-10-10');
	});
});

describe('seed math: weekdayDatesBetween', () => {
	it('lists only weekdays in a range', () => {
		// Fri 2025-10-17 .. Mon 2025-10-20 is two weekdays.
		expect(weekdayDatesBetween('2025-10-17', '2025-10-20')).toEqual(['2025-10-17', '2025-10-20']);
	});
});

describe('seed math: findLunarOffCluster', () => {
	// Dragon Boat 2025: lunar 5/5 fell on Sat 05-31, so the school off-day
	// Fri 05-30 is captioned 補假 — the seed must match the isHoliday cluster
	// containing the lunar caption, not caption == date.
	const dragon2025 = [
		{ date: '20250529', isHoliday: false, caption: '' },
		{ date: '20250530', isHoliday: true, caption: '補假' },
		{ date: '20250531', isHoliday: true, caption: '端午節' },
		{ date: '20250601', isHoliday: false, caption: '' }
	];

	it('returns the whole isHoliday run containing the festival caption', () => {
		expect(findLunarOffCluster(dragon2025, '端午節')).toEqual(['2025-05-30', '2025-05-31']);
	});

	it('returns an exact single-day match', () => {
		const moon2024 = [{ date: '20240917', isHoliday: true, caption: '中秋節' }];
		expect(findLunarOffCluster(moon2024, '中秋節')).toEqual(['2024-09-17']);
	});

	it('returns no dates when the caption is absent that year', () => {
		expect(findLunarOffCluster(dragon2025, '中秋節')).toEqual([]);
	});
});

describe('seed math: isProtectedSeedEvent', () => {
	it('protects every exam row', () => {
		expect(isProtectedSeedEvent({ type: 'exam', label: 'Exam 1' })).toBe(true);
		expect(isProtectedSeedEvent({ type: 'exam', label: 'Final exam' })).toBe(true);
	});

	it('protects the graduation ceremony (no_class + G9 ceremony label)', () => {
		expect(
			isProtectedSeedEvent({ type: 'no_class', label: 'Graduation ceremony', target: 'G9' })
		).toBe(true);
	});

	it("leaves Sport's Day, dues, and other no-class rows deletable", () => {
		expect(isProtectedSeedEvent({ type: 'no_class', label: "Sport's Day" })).toBe(false);
		expect(isProtectedSeedEvent({ type: 'task_due', label: 'Passport check' })).toBe(false);
		expect(isProtectedSeedEvent({ type: 'off', label: 'Moon Festival' })).toBe(false);
		expect(isProtectedSeedEvent({ type: 'partial', label: 'BBQ' })).toBe(false);
	});
});

const YEAR = '2025-2026';

async function adminSemester(term: 'S1' | 'S2', startDate: string) {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: YEAR,
		term,
		startDate
	});
	return { t, semesterId };
}

/** Seed cache rows directly, as fetchTaiwanCalendarYear would have written them. */
async function seedHolidayCache(
	t: Awaited<ReturnType<typeof convexTest>>,
	year: string,
	rows: { date: string; isHoliday: boolean; caption: string }[]
) {
	for (const row of rows) {
		await t.run((ctx) =>
			ctx.db.insert('esl_holiday_cache', {
				year,
				date: row.date,
				isHoliday: row.isHoliday,
				caption: row.caption,
				fetchedAt: 1728000000000
			})
		);
	}
}

describe('esl/seed.seed S1', () => {
	afterEach(() => vi.restoreAllMocks());

	it("seeds start day, BBQ, Sport's Day, exams with weekday ends, and dues", async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		const result = await t.mutation(api.esl.seed.seed, {
			semesterId,
			examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2025-10-17' },
			bbqDate: '2025-09-12',
			sportsDayDate: '2025-10-24',
			moonFestivalDate: '2025-10-06',
			dueWindows: [
				{
					type: 'task_due',
					label: 'Passport Unit 1 due',
					target: 'Comm',
					date: '2025-09-17',
					endDate: '2025-09-24'
				}
			]
		});
		expect(result.unresolvedLunar).toEqual([]);

		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const byLabel = new Map(events.map((event) => [event.label, event]));

		// Start-day partial from P3 on the semester start.
		expect(byLabel.get('First day of S1')).toMatchObject({
			type: 'partial',
			date: '2025-08-31',
			startPeriod: 3
		});
		// BBQ partial with logistics note.
		expect(byLabel.get('BBQ')).toMatchObject({ type: 'partial', date: '2025-09-12' });
		// Sport's Day, deletable.
		expect(byLabel.get("Sport's Day")).toMatchObject({ type: 'no_class', date: '2025-10-24' });

		// Exam 1: two weekdays Mon->Tue; Final from Friday spans the weekend Fri->Tue.
		const exam1 = events.filter((event) => event.label === 'Exam 1');
		expect(exam1.map((event) => event.date).sort()).toEqual(['2025-10-13', '2025-10-14']);
		const finals = events.filter((event) => event.label === 'Final exam');
		expect(finals.map((event) => event.date).sort()).toEqual([
			'2025-10-17',
			'2025-10-20',
			'2025-10-21'
		]);

		// Dues pass through with their windows.
		expect(byLabel.get('Passport Unit 1 due')).toMatchObject({
			type: 'task_due',
			target: 'Comm',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});

		// The derived end pins to the last final day.
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester?.derivedEnd).toBe('2025-11-18');
	});

	it('auto-creates a Friday-before makeup for a weekend off day', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		// 2025-10-18 is a Saturday.
		const result = await t.mutation(api.esl.seed.seed, {
			semesterId,
			examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' },
			extraOffs: [{ date: '2025-10-18', label: 'National Day (observed)' }]
		});
		expect(result.makeup).toEqual([
			{ forDate: '2025-10-18', makeupDate: '2025-10-17', label: 'National Day (observed)' }
		]);
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const makeup = events.find((event) => event.label === 'National Day (observed) (makeup)');
		expect(makeup).toMatchObject({ type: 'off', date: '2025-10-17' });
	});

	it('resolves lunar dates from the holiday cache with provenance', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await seedHolidayCache(t, '2025', [
			{ date: '20251005', isHoliday: false, caption: '' },
			{ date: '20251006', isHoliday: true, caption: '中秋節' }
		]);
		await t.mutation(api.esl.seed.seed, {
			semesterId,
			examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' }
		});
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const moon = events.find((event) => event.label === 'Moon Festival');
		expect(moon).toMatchObject({
			type: 'off',
			date: '2025-10-06',
			provenance: 'holiday_api'
		});
		expect(moon?.unverified).toBeUndefined();
		expect(moon?.note).toMatch(/中秋節/);
	});

	it('flags the admin-typed lunar fallback as unverified', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await t.mutation(api.esl.seed.seed, {
			semesterId,
			examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' },
			moonFestivalDate: '2025-10-06'
		});
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events.find((event) => event.label === 'Moon Festival')).toMatchObject({
			provenance: 'admin_typed',
			unverified: true
		});
	});

	it('reports unresolved lunar festivals when neither cache nor fallback gives a date', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		const result = await t.mutation(api.esl.seed.seed, {
			semesterId,
			examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' }
		});
		expect(result.unresolvedLunar).toEqual(['Moon Festival']);
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events.some((event) => event.label === 'Moon Festival')).toBe(false);
	});

	it('refuses to seed a semester that already holds events', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await t.mutation(api.esl.seed.seed, {
			semesterId,
			examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' }
		});
		await expect(
			t.mutation(api.esl.seed.seed, {
				semesterId,
				examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' }
			})
		).rejects.toThrow(/already holds events/);
	});

	it('surfaces an off day colliding with an exam range', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await expect(
			t.mutation(api.esl.seed.seed, {
				semesterId,
				examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' },
				extraOffs: [{ date: '2025-10-13', label: 'Clashing off day' }]
			})
		).rejects.toThrow(/exclusive/i);
	});

	it('refuses seeding from non-admin staff', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(
			t.mutation(api.esl.seed.seed, {
				semesterId,
				examStarts: { exam1: '2025-10-13', exam2: '2025-11-17', final: '2026-01-19' }
			})
		).rejects.toThrow(/ESL admin/);
	});
});

describe('esl/seed.seed S2', () => {
	afterEach(() => vi.restoreAllMocks());

	it('seeds ceremony, spring break, anniversary + makeup, mocks, and exams', async () => {
		const { t, semesterId } = await adminSemester('S2', '2026-02-09');
		// 2026-03-28 is a Saturday: the anniversary makeup prefills Friday-before.
		const result = await t.mutation(api.esl.seed.seed, {
			semesterId,
			examStarts: { exam1: '2026-03-16', exam2: '2026-04-20', final: '2026-06-15' },
			ceremonyDate: '2026-06-22',
			springBreakStart: '2026-04-02',
			springBreakEnd: '2026-04-03',
			anniversaryDate: '2026-03-28',
			g9MockStarts: ['2026-03-02'],
			dragonBoatDate: '2026-06-19'
		});
		expect(result.unresolvedLunar).toEqual([]);

		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const byLabel = new Map(events.map((event) => [event.label, event]));

		expect(byLabel.get('First day of S2')).toMatchObject({
			type: 'partial',
			date: '2026-02-09',
			startPeriod: 3
		});
		expect(byLabel.get('Graduation ceremony')).toMatchObject({
			type: 'no_class',
			target: 'G9',
			date: '2026-06-22'
		});
		expect(byLabel.get('Anniversary')).toMatchObject({ type: 'no_class', date: '2026-03-28' });
		expect(byLabel.get('Anniversary (makeup)')).toMatchObject({
			type: 'off',
			date: '2026-03-27'
		});
		// G9 mocks are no_class+G9 two-day rows, never exam-typed.
		const mocks = events.filter((event) => event.label === 'G9 mock');
		expect(mocks).toHaveLength(2);
		expect(mocks.every((event) => event.type === 'no_class' && event.target === 'G9')).toBe(true);

		// The ceremony stays protected after seeding.
		const ceremony = byLabel.get('Graduation ceremony');
		if (!ceremony) throw new Error('ceremony seed row missing');
		await expect(t.mutation(api.esl.events.remove, { eventId: ceremony._id })).rejects.toThrow(
			/protected/i
		);
	});
});

describe('esl/seed.fetchTaiwanCalendarYear', () => {
	afterEach(() => vi.restoreAllMocks());

	function stubCalendarFetch(payload: unknown, ok = true) {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok,
				status: ok ? 200 : 404,
				json: () => Promise.resolve(payload)
			})
		);
	}

	it('writes the year cache from the holiday API', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		stubCalendarFetch([
			{ date: '20251005', isHoliday: false, caption: '' },
			{ date: '20251006', isHoliday: true, caption: '中秋節' }
		]);
		const summary = await t.action(api.esl.seed.fetchTaiwanCalendarYear, {
			calendarYear: '2025'
		});
		expect(summary).toMatchObject({ year: '2025', days: 2 });
		const cached = await t.run((ctx) =>
			ctx.db
				.query('esl_holiday_cache')
				.withIndex('by_year', (q) => q.eq('year', '2025'))
				.collect()
		);
		expect(cached).toHaveLength(2);
		expect(fetch).toHaveBeenCalledWith('https://api.pin-yi.me/taiwan-calendar/2025/');
	});

	it('refuses an unsupported year with the admin-typed fallback message', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		stubCalendarFetch({
			http_code: 404,
			message: '資料取得失敗，請參考 API 文件目前支援的年份',
			status: 'error'
		});
		await expect(
			t.action(api.esl.seed.fetchTaiwanCalendarYear, { calendarYear: '2028' })
		).rejects.toThrow(/admin-typed/i);
	});
});
