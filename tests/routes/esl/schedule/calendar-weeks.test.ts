import { describe, it, expect } from 'vite-plus/test';
import { buildCalendarFragments } from '$src/routes/esl/schedule/calendar/calendar-weeks';
import type { ScheduleDayRow } from '$convex/shared/esl';

function row(overrides: Partial<ScheduleDayRow> & { date: string }): ScheduleDayRow {
	return {
		weekday: 'Monday',
		classId: 'class_clil',
		type: 'CLIL',
		cohortGrade: 7,
		period: 6,
		status: 'teaching',
		cause: null,
		badges: [],
		dues: [],
		count: null,
		...overrides
	} as ScheduleDayRow;
}

const TODAY = '2025-09-03';

function fragmentsOf(rows: ScheduleDayRow[]) {
	return buildCalendarFragments({ rows, semesterStart: '2025-08-31', today: TODAY }).fragments;
}

describe('buildCalendarFragments (#224)', () => {
	it('banners a due with the banner flag, keyed to its collapse week', () => {
		const fragments = fragmentsOf([
			row({ date: '2025-09-01' }),
			row({
				date: '2025-09-05',
				weekday: 'Friday',
				dues: [
					{
						title: 'Passport 1 due',
						type: 'reminder',
						reminderKind: 'passport',
						isBanner: true,
						windowStart: '2025-09-01',
						windowEnd: '2025-09-05'
					}
				]
			})
		]);

		expect(fragments).toHaveLength(1);
		expect(fragments[0].banners).toEqual([
			{
				title: 'Passport 1 due',
				reminderKind: 'passport',
				windowStart: '2025-09-01',
				windowEnd: '2025-09-05'
			}
		]);
	});

	it('keeps a due that opted out of the banner off the week banner and on its card', () => {
		const fragments = fragmentsOf([
			row({
				date: '2025-09-01',
				dues: [
					{
						title: 'Comm survey',
						type: 'reminder',
						reminderKind: 'task',
						isBanner: false,
						windowStart: '2025-09-01',
						windowEnd: '2025-09-03'
					}
				]
			})
		]);

		expect(fragments[0].banners).toEqual([]);
		expect(fragments[0].cards[0].dues).toEqual([
			{
				title: 'Comm survey',
				reminderKind: 'task',
				windowStart: '2025-09-01',
				windowEnd: '2025-09-03'
			}
		]);
	});

	it('banners one reminder once even when several of a class’s days carry it', () => {
		const due = {
			title: 'Passport 1 due',
			type: 'reminder',
			reminderKind: 'passport',
			isBanner: true,
			windowStart: '2025-09-01',
			windowEnd: '2025-09-05'
		} as const;
		const fragments = fragmentsOf([
			row({ date: '2025-09-01', dues: [due] }),
			row({ date: '2025-09-03', weekday: 'Wednesday', dues: [due] })
		]);

		expect(fragments[0].banners).toHaveLength(1);
		expect(fragments).toHaveLength(1);
	});

	it('banners a G9 class’s passport due in its window’s week (#278)', () => {
		// The fragment builder is class-agnostic: reach is decided upstream in
		// `buildTeacherDayRows` (covered in esl/schedule.test.ts), so what this
		// pins is that a G9 row arriving with a due banners like any other row.
		const fragments = fragmentsOf([
			row({
				date: '2025-09-03',
				weekday: 'Wednesday',
				classId: 'class_g9',
				type: 'G9',
				cohortGrade: 9,
				dues: [
					{
						title: 'Passport due',
						type: 'reminder',
						reminderKind: 'passport',
						isBanner: true,
						windowStart: '2025-09-01',
						windowEnd: '2025-09-05'
					}
				]
			})
		]);

		expect(fragments).toHaveLength(1);
		expect(fragments[0].banners).toEqual([
			{
				title: 'Passport due',
				reminderKind: 'passport',
				windowStart: '2025-09-01',
				windowEnd: '2025-09-05'
			}
		]);
	});

	it('stacks several of a week’s reminders in window order', () => {
		const fragments = fragmentsOf([
			row({ date: '2025-09-01' }),
			row({
				date: '2025-09-05',
				weekday: 'Friday',
				dues: [
					{
						title: 'Recording due',
						type: 'reminder',
						reminderKind: 'recording',
						isBanner: true,
						windowStart: '2025-09-02',
						windowEnd: '2025-09-05'
					},
					{
						title: 'Passport 1 due',
						type: 'reminder',
						reminderKind: 'passport',
						isBanner: true,
						windowStart: '2025-09-01',
						windowEnd: '2025-09-05'
					}
				]
			})
		]);

		expect(fragments[0].banners.map((banner) => banner.title)).toEqual([
			'Passport 1 due',
			'Recording due'
		]);
	});

	it('banners an overflowing window in its anchor week, not the collapse week', () => {
		// Quiz-style window: anchored on week 2's Monday (09/08) but the
		// window overruns into week 3 when a holiday eats a class day, and
		// the due collapses onto Mon 09/15. The banner must ride week 2 —
		// the week whose classes carry the quiz.
		const due = {
			title: 'Quiz 2 due',
			type: 'reminder' as const,
			reminderKind: 'quiz' as const,
			isBanner: true as const,
			windowStart: '2025-09-08',
			windowEnd: '2025-09-15'
		};
		const fragments = fragmentsOf([
			row({ date: '2025-09-08' }),
			row({ date: '2025-09-10', weekday: 'Wednesday' }),
			row({ date: '2025-09-15', weekday: 'Monday', dues: [due] })
		]);

		// semesterStart 08/31: week 2 starts 09/07, week 3 starts 09/14.
		expect(fragments[0].banners.map((banner) => banner.title)).toEqual(['Quiz 2 due']);
		expect(fragments[1].banners).toEqual([]);
	});

	it('carries a g9 mock day as its own card status with no count-up', () => {
		const fragments = fragmentsOf([
			row({
				date: '2025-09-08',
				status: 'g9_mock',
				cause: 'G9 Mock Exam',
				count: null
			}),
			row({
				date: '2025-09-09',
				weekday: 'Tuesday',
				status: 'g9_mock',
				cause: 'G9 Mock Exam',
				count: null
			})
		]);

		expect(fragments[0].cards.map((card) => card.status)).toEqual(['g9_mock', 'g9_mock']);
		expect(fragments[0].cards.every((card) => card.countdown === null)).toBe(true);
		expect(fragments[0].cards.every((card) => card.cause === 'G9 Mock Exam')).toBe(true);
	});

	it('drops the count-up on off and no-class days even when the row carries a count', () => {
		const fragments = fragmentsOf([
			row({
				date: '2025-09-09',
				weekday: 'Tuesday',
				status: 'off',
				cause: 'Moon Festival',
				// The backend still computes a count on non-teaching rows (it
				// mirrors the previous class day); the calendar must hide it.
				count: { position: 2, total: 5, label: 'Exam 1' }
			}),
			row({
				date: '2025-09-10',
				weekday: 'Wednesday',
				status: 'no_class',
				cause: 'Assembly',
				count: { position: 2, total: 5, label: 'Exam 1' }
			}),
			row({
				date: '2025-09-12',
				weekday: 'Friday',
				count: { position: 3, total: 5, label: 'Exam 1' }
			})
		]);

		expect(fragments[0].cards.map((card) => card.countdown)).toEqual([null, null, '3 of 5']);
	});
});
