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

	it('counts Unit N tasks toward units while manual tasks never count', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Unit 1',
			date: '2025-09-10'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Collect permission slips',
			date: '2025-09-11'
		});
		const status = await t.query(api.esl.checklist.status, { semesterId, today: '2025-10-01' });
		expect(status.units).toMatchObject({ expected: 6, present: 1 });
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

	it('fills quiz drafts to six with ranged CLIL-locked rows (#214 windows)', async () => {
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
		// Every draft spans a real window, not a single placeholder day.
		for (const quiz of quizzes) {
			expect(quiz.endDate).toBeDefined();
			expect(quiz.endDate as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect((quiz.endDate as string) > quiz.date).toBe(true);
		}
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

	it('fills unit drafts as ranged Unit N tasks (manual tasks never count)', async () => {
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
		const units = events
			.filter((event) => /^unit \d+$/i.test(event.title))
			.sort((a, b) => a.title.localeCompare(b.title));
		expect(units.map((event) => event.title)).toEqual([
			'Unit 1',
			'Unit 2',
			'Unit 3',
			'Unit 4',
			'Unit 5',
			'Unit 6'
		]);
		// Every draft spans a real window, not a single placeholder day.
		for (const unit of units) {
			expect(unit.endDate).toBeDefined();
			expect((unit.endDate as string) > unit.date).toBe(true);
		}
		// The checklist goes green on the drafts it just created.
		const status = await t.query(api.esl.checklist.status, { semesterId, today: '2025-10-31' });
		expect(status.units).toMatchObject({ expected: 6, present: 6 });
	});

	it('wires unit drafts to real exam anchors and median weeks (#214 ranges)', async () => {
		const { t, semesterId } = await adminSemester('S1', '2025-08-31');
		// One timetabled class: Tue P1 + Thu P2, so every term window has a
		// countable median week for its odd unit.
		const { classIds } = await t.mutation(api.esl.cohorts.create, {
			year: YEAR,
			grade: 7,
			level: 'Basic',
			classNumber: '1'
		});
		const classId = classIds[0];
		if (classId === undefined) throw new Error('cohort create returned no classes');
		for (const slot of [
			{ day: 'Tuesday', period: 1 },
			{ day: 'Thursday', period: 2 }
		] as const) {
			await t.run((ctx) =>
				ctx.db.insert('esl_class_meetings', {
					classId,
					year: YEAR,
					day: slot.day,
					period: slot.period
				})
			);
		}
		// Three Monday exam starts (each fans out past its start).
		for (const [title, date] of [
			['Exam 1', '2025-10-13'],
			['Exam 2', '2025-11-17'],
			['Final Exam', '2025-12-15']
		] as const) {
			await t.mutation(api.esl.events.create, { semesterId, type: 'exam', title, date });
		}
		const result = await t.mutation(api.esl.checklist.createMissing, {
			semesterId,
			today: '2025-10-31',
			group: 'units'
		});
		expect(result.skipped).toEqual([]);
		expect(result.created).toHaveLength(6);
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const unit = (title: string) => events.find((e) => e.type === 'task' && e.title === title);
		// Even units sit in the exact 7 calendar days before their exam.
		expect(unit('Unit 2')).toMatchObject({ date: '2025-10-06', endDate: '2025-10-12' });
		expect(unit('Unit 4')).toMatchObject({ date: '2025-11-10', endDate: '2025-11-16' });
		expect(unit('Unit 6')).toMatchObject({ date: '2025-12-08', endDate: '2025-12-14' });
		// Odd units are Mon–Fri median weeks inside their term windows.
		for (const title of ['Unit 1', 'Unit 3', 'Unit 5']) {
			const draft = unit(title);
			if (!draft?.endDate) throw new Error(`${title} draft missing its range`);
			const [y1, m1, d1] = draft.date.split('-').map(Number);
			const [y2, m2, d2] = (draft.endDate as string).split('-').map(Number);
			expect(new Date(Date.UTC(y1, m1 - 1, d1)).getUTCDay()).toBe(1);
			expect(new Date(Date.UTC(y2, m2 - 1, d2)).getUTCDay()).toBe(5);
			expect((draft.endDate as string) > draft.date).toBe(true);
		}
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
