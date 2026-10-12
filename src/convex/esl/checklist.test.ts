import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

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

async function seedCache(
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

describe('esl/checklist.status', () => {
	afterEach(() => vi.restoreAllMocks());

	it('reports an empty semester: off missing, all draft counts zero', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await seedCache(t, '2025', [
			{ date: '20251006', isHoliday: true, caption: '中秋節' },
			{ date: '20251007', isHoliday: false, caption: '' }
		]);
		const status = await t.query(api.esl.checklist.status, { semesterId, today: '2025-10-31' });
		expect(status.window).toEqual({ start: '2025-08-31', end: '2025-10-31' });
		expect(status.off.missing).toEqual(['2025-10-06']);
		expect(status.off.ok).toBe(false);
		expect(status.quiz).toMatchObject({ expected: 6, present: 0 });
		expect(status.units).toMatchObject({ expected: 6, present: 0 });
		expect(status.passport).toMatchObject({ expected: 3, present: 0 });
		expect(status.recording).toMatchObject({ expected: 3, present: 0 });
		expect(status.g9mock).toMatchObject({ expectedStarts: 2, presentRows: 0 });
	});

	it('marks groups present once the rows exist', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await seedCache(t, '2025', [{ date: '20251006', isHoliday: true, caption: '中秋節' }]);
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Moon Festival',
			date: '2025-10-06'
		});
		for (let i = 0; i < 6; i++) {
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'quiz',
				title: 'Quiz',
				target: 'CLIL',
				date: `2025-09-${String(10 + i).padStart(2, '0')}`
			});
		}
		const status = await t.query(api.esl.checklist.status, { semesterId, today: '2025-10-01' });
		expect(status.off.ok).toBe(true);
		expect(status.quiz).toMatchObject({ expected: 6, present: 6 });
	});

	it('expects three G9 mock starts in S2', async () => {
		const { t, semesterId } = await adminSemester('S2', '2026-02-09');
		const status = await t.query(api.esl.checklist.status, { semesterId, today: '2025-10-01' });
		expect(status.g9mock.expectedStarts).toBe(3);
	});

	it('refuses unauthenticated callers', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		mockAuthUser(null);
		await expect(
			t.query(api.esl.checklist.status, { semesterId, today: '2025-10-01' })
		).rejects.toThrow();
	});
});

describe('esl/checklist.createMissing', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates missing off-days from the cache as no-school rows', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await seedCache(t, '2025', [
			{ date: '20251006', isHoliday: true, caption: '中秋節' },
			{ date: '20251007', isHoliday: false, caption: '' }
		]);
		const result = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'off'
		});
		expect(result).toMatchObject({ created: ['2025-10-06'], skipped: [] });
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events.find((event) => event.date === '2025-10-06')).toMatchObject({
			type: 'no_school',
			title: 'Off',
			target: 'all'
		});
		// Second run finds nothing missing — advisory create is idempotent.
		const rerun = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'off'
		});
		expect(rerun).toMatchObject({ created: [], skipped: [] });
	});

	it('skips (never throws on) an off-day colliding with an exam day', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await seedCache(t, '2025', [{ date: '20251013', isHoliday: true, caption: '國慶日' }]);
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-13'
		});
		const result = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'off'
		});
		expect(result.created).toEqual([]);
		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0]).toMatch(/2025-10-13/);
	});

	it('fills quiz drafts to six with CLIL-locked rows', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		const result = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'quiz'
		});
		expect(result.created).toHaveLength(6);
		expect(result.skipped).toEqual([]);
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const quizzes = events.filter((event) => event.type === 'quiz');
		expect(quizzes).toHaveLength(6);
		expect(quizzes.every((event) => event.title === 'Quiz' && event.target === 'CLIL')).toBe(true);
	});

	it('fills passport and recording dues with Comm-locked rows', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		const passport = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'passport'
		});
		const recording = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'recording'
		});
		expect(passport.created).toHaveLength(3);
		expect(recording.created).toHaveLength(3);
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(
			events
				.filter((event) => event.type === 'passport_due')
				.every((event) => event.title === 'Passport due' && event.target === 'Comm')
		).toBe(true);
		expect(
			events
				.filter((event) => event.type === 'recording_due')
				.every((event) => event.title === 'Recording due' && event.target === 'Comm')
		).toBe(true);
	});

	it('fills unit drafts as Unit N test tasks (manual tasks never count)', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Collect permission slips',
			date: '2025-09-10'
		});
		const result = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'units'
		});
		expect(result.created).toHaveLength(6);
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events.filter((event) => /^unit \d+ test$/i.test(event.title))).toHaveLength(6);
	});

	it('creates G9 mock drafts as two-day G9 pairs (2 starts in S1)', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		const result = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'g9mock'
		});
		expect(result.created).toHaveLength(4);
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const mocks = events.filter((event) => event.type === 'g9_mock');
		expect(mocks).toHaveLength(4);
		expect(mocks.every((event) => event.title === 'G9 Mock Exam' && event.target === 'G9')).toBe(
			true
		);
	});

	it('refuses one-click create from non-admin staff', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(
			t.mutation(api.esl.checklist.createMissing, {
				semesterId,
				today: '2025-10-31',
				group: 'quiz'
			})
		).rejects.toThrow(/ESL admin/);
	});
});
