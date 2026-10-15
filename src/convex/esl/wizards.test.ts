import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

const YEAR = '2026-2027';

const OFF_DAYS = [{ date: '2026-11-10', name: 'National Day' }];

const EXAMS = [
	{ label: 'Exam 1' as const, dates: ['2026-11-02', '2026-11-03'] },
	{ label: 'Exam 2' as const, dates: ['2026-12-07', '2026-12-08'] },
	{ label: 'Final' as const, dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
];

const SINGLES = { anniv: null, makeup: null, sports: '2026-10-07', grad: null, bbq: null };

const RANGES = {
	q1: ['2026-10-05', '2026-10-06', '2026-10-07'],
	q2: ['2026-10-19', '2026-10-20', '2026-10-21'],
	q3: ['2026-11-04', '2026-11-05', '2026-11-06'],
	q4: ['2026-11-18', '2026-11-19', '2026-11-20'],
	q5: ['2026-12-09', '2026-12-10', '2026-12-11'],
	q6: ['2026-12-23', '2026-12-24', '2026-12-28'],
	pd1: ['2026-10-05', '2026-10-06', '2026-10-07'],
	pd2: ['2026-11-04', '2026-11-05', '2026-11-06'],
	pd3: ['2026-12-09', '2026-12-10', '2026-12-11'],
	rd1: ['2026-10-05', '2026-10-06', '2026-10-07'],
	rd2: ['2026-11-04', '2026-11-05', '2026-11-06'],
	rd3: ['2026-12-09', '2026-12-10', '2026-12-11'],
	pcheck: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'],
	wcheck: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08']
};

async function saveArgs(e2eTag?: string) {
	return {
		year: YEAR,
		term: 'S1' as const,
		startDate: '2026-08-31',
		offDays: OFF_DAYS,
		exams: EXAMS,
		singles: SINGLES,
		sportsOn: true,
		pairs: {
			mock1: ['2026-10-12', '2026-10-13'],
			mock2: ['2026-10-19', '2026-10-20'],
			mock3: null
		},
		ranges: RANGES,
		customs: [],
		extras: [],
		...(e2eTag === undefined ? {} : { e2eTag })
	};
}

describe('esl/wizards.saveSemester', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates the semester and every event kind in one call', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });

		const result = await t.action(api.esl.wizards.saveSemester, await saveArgs());

		const semester = await t.query(api.esl.semesters.get, { semesterId: result.semesterId });
		expect(semester).toMatchObject({ year: YEAR, term: 'S1', startDate: '2026-08-31' });

		const rows = await t.query(api.esl.events.listBySemester, {
			semesterId: result.semesterId
		});
		const byType = (type: string) => rows.filter((row) => row.type === type);
		// 1 start + 1 off + 7 exam days (2+2+3) + sports + 4 mock days + 14 reminders
		expect(byType('start_school')).toHaveLength(1);
		expect(byType('no_school')).toHaveLength(1);
		expect(byType('exam')).toHaveLength(7);
		expect(byType('no_class')).toHaveLength(1);
		expect(byType('g9_mock')).toHaveLength(4);
		expect(byType('reminder')).toHaveLength(14);
		expect(result.eventIds).toHaveLength(rows.length);
	});

	it('stamps the first-day P1–P2 window and banners by default', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });

		const result = await t.action(api.esl.wizards.saveSemester, await saveArgs());
		const rows = await t.query(api.esl.events.listBySemester, {
			semesterId: result.semesterId
		});

		const start = rows.find((row) => row.type === 'start_school');
		expect(start).toMatchObject({ startPeriod: 1, endPeriod: 2, date: '2026-08-31' });
		const quiz = rows.find((row) => row.reminderKind === 'quiz');
		expect(quiz).toMatchObject({ target: 'CLIL', isBanner: true });
		const off = rows.find((row) => row.type === 'no_school');
		expect(off).toMatchObject({ title: 'Off', note: 'National Day' });
	});

	it("maps the wizard's Final label to the canonical Final Exam title + group", async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });

		const result = await t.action(api.esl.wizards.saveSemester, await saveArgs());
		const rows = await t.query(api.esl.events.listBySemester, {
			semesterId: result.semesterId
		});
		const finals = rows.filter((row) => row.type === 'exam' && row.date >= '2027-01-18');
		expect(finals).toHaveLength(3);
		for (const row of finals) {
			expect(row).toMatchObject({ title: 'Final Exam', examGroup: 'Final Exam' });
		}
	});

	it('refuses a duplicate year+term without writing anything', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });

		await t.action(api.esl.wizards.saveSemester, await saveArgs());
		await expect(t.action(api.esl.wizards.saveSemester, await saveArgs())).rejects.toThrow(
			'already exists'
		);

		const semesters = await t.query(api.esl.semesters.list, {});
		expect(semesters.filter((s) => s.year === YEAR && s.term === 'S1')).toHaveLength(1);
	});

	it('fails payload validation before creating the semester', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });

		const bad = await saveArgs();
		await expect(
			t.action(api.esl.wizards.saveSemester, {
				...bad,
				customs: [
					{
						id: 'custom-1',
						type: 'banner',
						startDate: '2026-10-14',
						endDate: '2026-10-10',
						bannerText: 'Backwards',
						target: 'all'
					}
				]
			})
		).rejects.toThrow();

		const semesters = await t.query(api.esl.semesters.list, {});
		expect(semesters).toHaveLength(0);
	});

	it('refuses non-admin callers', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

		await expect(t.action(api.esl.wizards.saveSemester, await saveArgs())).rejects.toThrow();
	});

	it('refuses a custom event without text and stamps e2eTag on writes', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });

		const bad = await saveArgs();
		await expect(
			t.action(api.esl.wizards.saveSemester, {
				...bad,
				customs: [
					{
						id: 'custom-1',
						type: 'meeting',
						date: '2026-10-14',
						target: 'all',
						subType: 'task',
						note: ''
					}
				]
			})
		).rejects.toThrow(/text/i);

		const tagged = await saveArgs('wizard-e2e');
		const result = await t.action(api.esl.wizards.saveSemester, tagged);
		const rows = await t.query(api.esl.events.listBySemester, {
			semesterId: result.semesterId
		});
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.e2eTag).toBe('wizard-e2e');
		}
		const semester = await t.query(api.esl.semesters.get, { semesterId: result.semesterId });
		expect(semester?.e2eTag).toBe('wizard-e2e');
	});
});
