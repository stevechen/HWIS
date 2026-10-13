import { describe, it, expect } from 'vitest';
import {
	evenUnitRange,
	listTermClassMeetings,
	medianMeetingDate,
	mondayOfWeekContaining,
	oddUnitRange,
	oddUnitRangeForTerm,
	quizDraftForUnit,
	quizTitle,
	unitDraftForRange,
	unitNumbersForSemesterTerm,
	unitTitle,
	weekdayOfDate,
	type ScheduleEventInput,
	type ScheduleMeetingInput,
	type TermClassMeeting
} from './esl';

describe('even units: exact 7 calendar days before the exam', () => {
	it('spans examStart−7d … examStart−1d for a Monday exam', () => {
		// Mon 2025-10-13: the week before, Monday to Sunday.
		expect(evenUnitRange('2025-10-13')).toEqual({
			date: '2025-10-06',
			endDate: '2025-10-12'
		});
	});

	it('uses calendar days with no weekend shifting', () => {
		// The range keeps its weekend days; the views ignore non-teaching
		// days on their own, so the draft must not shift around them.
		const range = evenUnitRange('2025-10-13');
		expect(range.date).toBe('2025-10-06');
		expect(range.endDate).toBe('2025-10-12');
	});

	it('refuses an invalid exam start', () => {
		expect(() => evenUnitRange('not-a-date')).toThrow(/not a valid date/);
	});
});

describe('odd units: the Mon–Fri week containing a date', () => {
	it('resolves the Monday of a mid-week date', () => {
		// Wed 2025-09-17 sits in Mon 09-15 … Fri 09-19.
		expect(mondayOfWeekContaining('2025-09-17')).toBe('2025-09-15');
	});

	it('keeps Monday and Friday inputs in their own week', () => {
		expect(mondayOfWeekContaining('2025-09-15')).toBe('2025-09-15');
		expect(mondayOfWeekContaining('2025-09-19')).toBe('2025-09-15');
	});

	it('returns the full Mon–Fri week, never a clipped edge', () => {
		expect(oddUnitRange('2025-09-17')).toEqual({
			date: '2025-09-15',
			endDate: '2025-09-19'
		});
	});

	it('maps a weekend date back to the week just ended', () => {
		// Sat 2025-09-20 belongs to no teaching week; its Monday is 09-15.
		expect(oddUnitRange('2025-09-20')).toEqual({
			date: '2025-09-15',
			endDate: '2025-09-19'
		});
	});

	it('refuses an invalid date', () => {
		expect(() => oddUnitRange('not-a-date')).toThrow(/not a valid date/);
	});
});

describe('term class-day counting', () => {
	// One G9 class meeting Tue P1 + Thu P2 across Tue 2025-09-02 ..
	// Thu 2025-09-11: four occurrences (09-02, 09-04, 09-09, 09-11).
	const meetings: ScheduleMeetingInput[] = [
		{ classId: 'c1', type: 'G9', cohortGrade: 9, day: 'Tuesday', period: 1 },
		{ classId: 'c1', type: 'G9', cohortGrade: 9, day: 'Thursday', period: 2 }
	];
	const window = { from: '2025-09-02', to: '2025-09-11' };
	const datesOf = (events: ScheduleEventInput[] = []) =>
		listTermClassMeetings({ meetings, events, ...window }).map((hit) => hit.date);

	it('counts every meeting occurrence with no events', () => {
		expect(datesOf()).toEqual(['2025-09-02', '2025-09-04', '2025-09-09', '2025-09-11']);
	});

	it('excludes Off-titled days', () => {
		expect(
			datesOf([{ type: 'no_school', title: 'Off', target: 'all', date: '2025-09-09' }])
		).toEqual(['2025-09-02', '2025-09-04', '2025-09-11']);
	});

	it('excludes No-class-titled days', () => {
		expect(
			datesOf([{ type: 'no_class', title: 'No class', target: 'all', date: '2025-09-04' }])
		).toEqual(['2025-09-02', '2025-09-09', '2025-09-11']);
	});

	it('excludes partial non-matching periods but keeps matching ones', () => {
		// Tue P1 sits below the P3 start bound: no class that period.
		expect(
			datesOf([
				{ type: 'partial', title: 'No class', target: 'all', date: '2025-09-02', startPeriod: 3 }
			])
		).toEqual(['2025-09-04', '2025-09-09', '2025-09-11']);
		// Thu P2 sits inside the ..P4 bound: class as usual.
		expect(
			datesOf([
				{ type: 'partial', title: 'No class', target: 'all', date: '2025-09-04', endPeriod: 4 }
			])
		).toEqual(['2025-09-02', '2025-09-04', '2025-09-09', '2025-09-11']);
	});

	it('excludes out-of-window Start rows but keeps P3-and-later ones', () => {
		const mixed: ScheduleMeetingInput[] = [
			...meetings,
			{ classId: 'c2', type: 'Comm', cohortGrade: 8, day: 'Tuesday', period: 3 }
		];
		const rows = listTermClassMeetings({
			meetings: mixed,
			events: [{ type: 'start_school', title: 'Start at P3', target: 'all', date: '2025-09-02' }],
			...window
		});
		const tuesday = rows.filter((row) => row.date === '2025-09-02');
		// c1's P1 falls before P3 and drops; c2's P3 runs.
		expect(tuesday).toEqual([{ date: '2025-09-02', weekday: 'Tuesday', classId: 'c2', period: 3 }]);
	});

	it('ignores events targeted at other classes', () => {
		// The G9 class is untouched by a CLIL-only off day.
		expect(
			datesOf([{ type: 'no_school', title: 'Off', target: 'CLIL', date: '2025-09-09' }])
		).toEqual(['2025-09-02', '2025-09-04', '2025-09-09', '2025-09-11']);
	});
});

describe('odd units: median class meeting of the term', () => {
	const meetingOn = (date: string, weekday: TermClassMeeting['weekday']): TermClassMeeting => ({
		date,
		weekday,
		classId: 'c1',
		period: 1
	});

	it('takes the middle meeting of an odd count', () => {
		expect(
			medianMeetingDate([
				meetingOn('2025-09-02', 'Tuesday'),
				meetingOn('2025-09-04', 'Thursday'),
				meetingOn('2025-09-09', 'Tuesday')
			])
		).toBe('2025-09-04');
	});

	it('takes the lower median of an even count', () => {
		expect(
			medianMeetingDate([
				meetingOn('2025-09-02', 'Tuesday'),
				meetingOn('2025-09-04', 'Thursday'),
				meetingOn('2025-09-09', 'Tuesday'),
				meetingOn('2025-09-11', 'Thursday')
			])
		).toBe('2025-09-04');
	});

	it('returns null with no meetings to mediate', () => {
		expect(medianMeetingDate([])).toBeNull();
	});

	it('composes the Mon–Fri week of the term median', () => {
		// Four occurrences (09-02, 09-04, 09-09, 09-11): lower median
		// 09-04 lands in Mon 09-01 … Fri 09-05.
		expect(
			oddUnitRangeForTerm({
				meetings: [
					{ classId: 'c1', type: 'G9', cohortGrade: 9, day: 'Tuesday', period: 1 },
					{ classId: 'c1', type: 'G9', cohortGrade: 9, day: 'Thursday', period: 2 }
				],
				events: [],
				from: '2025-09-02',
				to: '2025-09-11'
			})
		).toEqual({ date: '2025-09-01', endDate: '2025-09-05' });
	});

	it('returns null when the term holds no class meetings', () => {
		expect(
			oddUnitRangeForTerm({
				meetings: [{ classId: 'c1', type: 'G9', cohortGrade: 9, day: 'Tuesday', period: 1 }],
				events: [{ type: 'no_school', title: 'Off', target: 'all', date: '2025-09-02' }],
				from: '2025-09-02',
				to: '2025-09-02'
			})
		).toBeNull();
	});
});

describe('units and quizzes: six per semester', () => {
	it('numbers S1 U1–6 and S2 U7–12', () => {
		expect(unitNumbersForSemesterTerm('S1')).toEqual([1, 2, 3, 4, 5, 6]);
		expect(unitNumbersForSemesterTerm('S2')).toEqual([7, 8, 9, 10, 11, 12]);
	});

	it('titles units sequentially so a skipped unit shifts forward by edit', () => {
		expect(unitTitle(1)).toBe('Unit 1');
		expect(unitTitle(12)).toBe('Unit 12');
	});

	it('titles quizzes numbered so the unit can shift by edit after creation', () => {
		expect(quizTitle(1)).toBe('Unit 1 Quiz Due');
		expect(quizTitle(2)).toBe('Unit 2 Quiz Due');
	});

	it('drafts a unit as a free-title task-kind reminder over its range', () => {
		expect(unitDraftForRange(2, { date: '2025-10-06', endDate: '2025-10-12' })).toEqual({
			unit: 'Unit 2',
			type: 'reminder',
			reminderKind: 'task',
			title: 'Unit 2',
			target: 'all',
			date: '2025-10-06',
			endDate: '2025-10-12',
			isBanner: true
		});
	});

	it('drafts a quiz with the numbered Unit N Quiz Due title and CLIL target over its unit range', () => {
		expect(quizDraftForUnit(2, { date: '2025-10-06', endDate: '2025-10-12' })).toEqual({
			unit: 'Unit 2',
			type: 'reminder',
			reminderKind: 'quiz',
			title: 'Unit 2 Quiz Due',
			target: 'CLIL',
			date: '2025-10-06',
			endDate: '2025-10-12',
			isBanner: true
		});
	});

	it('keeps every generated range at least one school week long', () => {
		// Even: exact 7 calendar days. Odd: always a full Mon–Fri week.
		const even = evenUnitRange('2025-10-13');
		expect(even).toEqual({ date: '2025-10-06', endDate: '2025-10-12' });
		const odd = oddUnitRange('2025-09-17');
		expect(weekdayOfDate(odd.date)).toBe('Monday');
		expect(weekdayOfDate(odd.endDate)).toBe('Friday');
		expect(odd.endDate > odd.date).toBe(true);
	});
});
