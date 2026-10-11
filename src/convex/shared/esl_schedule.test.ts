import { describe, it, expect } from 'vitest';
import {
	ESL_DAYS,
	ESL_PERIODS,
	assertValidMeetings,
	classifySchedule,
	findScheduleProblems,
	describeMeetingShapeError,
	describeScheduleProblem,
	eslMeetingLabel,
	eslMeetingsPerWeek,
	eslPeriodTimes,
	isEslDay,
	isEslPeriod,
	type EslClassType,
	type EslDay,
	type EslScheduleNeighbour
} from './esl';

describe('the school week', () => {
	it('runs Monday to Friday and no weekend lessons', () => {
		expect(ESL_DAYS).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
	});

	it('reads a day as a two-letter label on a chip', () => {
		// Two characters so a class's three meetings fit on one line in a card.
		expect(eslMeetingLabel({ day: 'Wednesday', period: 3 })).toBe('We P3');
	});
});

describe('the bell schedule', () => {
	it('runs eight periods', () => {
		expect(ESL_PERIODS).toHaveLength(8);
	});

	// Written out one row at a time rather than looped, because the point of
	// the literal table is that a generated pattern gets P5 wrong. If someone
	// "simplifies" these into a loop, this test is the thing that notices.
	it.each([
		[1, '08:10', '09:00'],
		[2, '09:10', '10:00'],
		[3, '10:10', '11:00'],
		[4, '11:10', '12:00'],
		[5, '13:05', '13:55'],
		[6, '14:05', '14:55'],
		[7, '15:10', '16:00'],
		[8, '16:10', '17:00']
	])('period %i runs %s to %s', (period, start, end) => {
		expect(eslPeriodTimes(period as number)).toEqual({ start, end });
	});

	it('has two shapes of period, not one', () => {
		// Six periods run :10->:00 across the hour; P5 and P6 run :05->:55.
		// A generator inferred from the majority would produce a wrong P5.
		expect(eslPeriodTimes(5)).toEqual({ start: '13:05', end: '13:55' });
		expect(eslPeriodTimes(6)).toEqual({ start: '14:05', end: '14:55' });
	});

	it('knows a period it does not run', () => {
		expect(isEslPeriod(9)).toBe(false);
		expect(isEslPeriod(0)).toBe(false);
		expect(eslPeriodTimes(9)).toBeNull();
	});

	it('knows a day it does not teach', () => {
		expect(isEslDay('Saturday')).toBe(false);
		expect(isEslDay('Monday')).toBe(true);
	});
});

describe('meetings per week', () => {
	it('gives CLIL three periods and everything else two', () => {
		expect(eslMeetingsPerWeek('CLIL')).toBe(3);
		expect(eslMeetingsPerWeek('Comm')).toBe(2);
		expect(eslMeetingsPerWeek('G9')).toBe(2);
		expect(eslMeetingsPerWeek('H10A')).toBe(2);
		expect(eslMeetingsPerWeek('H10B')).toBe(2);
	});

	// G7 and G8 run five days between their CLIL and Comm classes, which is
	// what ADR-0023 recorded as "5 days" and could not express.
	it('makes a G7/G8 cohort run five days between its two classes', () => {
		expect(eslMeetingsPerWeek('CLIL') + eslMeetingsPerWeek('Comm')).toBe(5);
	});
});

describe('assertValidMeetings', () => {
	it('accepts three distinct days for a CLIL class', () => {
		expect(
			assertValidMeetings('CLIL', [
				{ day: 'Monday', period: 1 },
				{ day: 'Wednesday', period: 2 },
				{ day: 'Friday', period: 3 }
			])
		).toBeNull();
	});

	it('accepts two distinct days for a Comm class', () => {
		expect(
			assertValidMeetings('Comm', [
				{ day: 'Tuesday', period: 5 },
				{ day: 'Thursday', period: 6 }
			])
		).toBeNull();
	});

	// Absence is a legitimate state, not a malformed one: cohorts are composed
	// before anyone has planned slots, and the September import carries no
	// day or time at all.
	it('accepts a class with no meetings', () => {
		expect(assertValidMeetings('CLIL', [])).toBeNull();
	});

	it('rejects too few meetings for the type', () => {
		expect(assertValidMeetings('CLIL', [{ day: 'Monday', period: 1 }])).toEqual({
			kind: 'tooFew',
			expected: 3,
			actual: 1
		});
	});

	it('rejects too many meetings for the type', () => {
		expect(
			assertValidMeetings('Comm', [
				{ day: 'Monday', period: 1 },
				{ day: 'Tuesday', period: 2 },
				{ day: 'Wednesday', period: 3 }
			])
		).toEqual({ kind: 'tooMany', expected: 2, actual: 3 });
	});

	it('rejects two meetings on the same day', () => {
		expect(
			assertValidMeetings('Comm', [
				{ day: 'Monday', period: 1 },
				{ day: 'Monday', period: 4 }
			])
		).toEqual({ kind: 'duplicateDay', day: 'Monday' });
	});

	it('rejects a day the school does not teach', () => {
		// Cast, because the Convex validator already refuses a Saturday
		// before it reaches this function. The check stays because a day
		// could be widened later, and because the pure function is the one
		// place the rule is stated.
		const saturday = 'Saturday' as EslDay;
		expect(
			assertValidMeetings('Comm', [
				{ day: saturday, period: 1 },
				{ day: 'Tuesday', period: 2 }
			])
		).toEqual({ kind: 'unknownDay', day: 'Saturday' });
	});

	it('rejects a period the school does not run', () => {
		expect(
			assertValidMeetings('Comm', [
				{ day: 'Monday', period: 9 },
				{ day: 'Tuesday', period: 2 }
			])
		).toEqual({ kind: 'unknownPeriod', period: 9 });
	});

	it('names the type and the count in the sentence an admin reads', () => {
		const error = assertValidMeetings('CLIL', [{ day: 'Monday', period: 1 }]);
		expect(describeMeetingShapeError('CLIL', error!)).toBe(
			'A G7/8 CLIL class must meet 3 periods a week, but only 1 was given.'
		);
	});
});

describe('classifySchedule', () => {
	const sound = [
		{ day: 'Monday', period: 1 },
		{ day: 'Wednesday', period: 2 },
		{ day: 'Friday', period: 3 }
	] as const;

	/**
	 * `classifySchedule` takes the gate's output rather than the neighbours, so
	 * the badge and the chips come from one rule pass. The tests still describe a
	 * world by its neighbours; this is where the two meet.
	 */
	const classify = (
		subject: {
			type: EslClassType;
			cohortId: string;
			room?: string;
			teacherId?: string;
			meetings: readonly { day: EslDay; period: number }[];
		},
		neighbours: (EslScheduleNeighbour & { cohortId: string })[]
	) => classifySchedule(subject, findScheduleProblems(subject, neighbours));

	const neighbour = (overrides: Record<string, unknown> = {}) => ({
		classId: 'other',
		className: 'G7 Basic 1 Comm',
		cohortId: 'cohort_other',
		room: 'ESL A',
		teacherId: 'teacher_other',
		meetings: sound,
		...overrides
	});

	it('reports a sound schedule as sound', () => {
		expect(
			classify({ type: 'CLIL', cohortId: 'cohort_a', room: 'ESL B', meetings: sound }, [
				neighbour()
			])
		).toBeNull();
	});

	it('reports an unscheduled class before anything else', () => {
		// Also missing a room, but scheduling has to happen first for the
		// room to mean anything.
		expect(classify({ type: 'CLIL', cohortId: 'cohort_a', meetings: [] }, [])).toEqual({
			state: 'no-schedule'
		});
	});

	it('reports the wrong number of meetings as incomplete', () => {
		expect(
			classify(
				{
					type: 'CLIL',
					cohortId: 'cohort_a',
					room: 'ESL B',
					meetings: [{ day: 'Monday', period: 1 }]
				},
				[]
			)
		).toEqual({ state: 'incomplete' });
	});

	it('reports a scheduled class with no room as missing its room', () => {
		expect(classify({ type: 'CLIL', cohortId: 'cohort_a', meetings: sound }, [])).toEqual({
			state: 'missing-room'
		});
	});

	it('names the other class when one cohort draws on two rooms at once', () => {
		const problem = classify(
			{ type: 'CLIL', cohortId: 'cohort_a', room: 'ESL B', meetings: sound },
			[
				neighbour({
					cohortId: 'cohort_a',
					className: 'G7 Basic 1 Comm',
					meetings: [{ day: 'Monday', period: 1 }]
				})
			]
		);
		expect(problem).toMatchObject({
			state: 'conflicting',
			dimension: 'cohort',
			day: 'Monday',
			period: 1
		});
		expect(describeScheduleProblem(problem!)).toBe('Mo P1 — G7 Basic 1 Comm shares its roster');
	});

	it('reports a teacher clash without blocking it', () => {
		const problem = classify(
			{
				type: 'CLIL',
				cohortId: 'cohort_a',
				room: 'ESL B',
				teacherId: 'teacher_one',
				meetings: sound
			},
			[neighbour({ cohortId: 'cohort_other', teacherId: 'teacher_one' })]
		);
		expect(problem).toMatchObject({ state: 'conflicting', dimension: 'teacher' });
	});

	it('reports a room clash without blocking it', () => {
		const problem = classify(
			{
				type: 'CLIL',
				cohortId: 'cohort_a',
				room: 'ESL A',
				teacherId: 'teacher_one',
				meetings: sound
			},
			[
				neighbour({
					cohortId: 'cohort_other',
					room: 'ESL A',
					teacherId: 'teacher_two'
				})
			]
		);
		expect(problem).toMatchObject({ state: 'conflicting', dimension: 'room' });
	});

	it('ignores a clash on a different day', () => {
		expect(
			classify(
				{
					type: 'CLIL',
					cohortId: 'cohort_a',
					room: 'ESL B',
					teacherId: 'teacher_one',
					meetings: sound
				},
				[
					neighbour({
						cohortId: 'cohort_other',
						teacherId: 'teacher_one',
						meetings: [{ day: 'Tuesday', period: 7 }]
					})
				]
			)
		).toBeNull();
	});

	// The editor passes the class being edited among the year's neighbours, so
	// its own saved rows read back as a clash. The caller excludes the class
	// being edited; this pins that the exclusion is the caller's job.
	it('reports the class against itself when it is not excluded', () => {
		const problem = classify(
			{
				type: 'CLIL',
				cohortId: 'cohort_a',
				room: 'ESL B',
				teacherId: 'teacher_one',
				meetings: sound
			},
			[
				neighbour({
					classId: 'self',
					cohortId: 'cohort_a',
					className: 'G7 Basic 1 CLIL',
					room: 'ESL B',
					teacherId: 'teacher_one',
					meetings: sound
				})
			]
		);
		expect(problem).toMatchObject({
			state: 'conflicting',
			other: { classId: 'self' }
		});
	});
});
