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
});
