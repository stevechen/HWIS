import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';
import {
	assertValidEslTarget,
	defaultTargetForEventType,
	describeEslEventError,
	eventReachesClass,
	lockedTargetForEventType
} from '../shared/esl';

const YEAR = '2025-2026';

async function seededSemester() {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: YEAR,
		term: 'S1',
		startDate: '2025-08-31'
	});
	return { t, semesterId };
}

/**
 * Narrows an event-create result to its single row. Non-exam creates write
 * exactly one row; exam creates fan out to an array (asserted separately),
 * so a test that follows up on one row says so here instead of casting.
 */
function singleId(created: Id<'esl_events'> | Id<'esl_events'>[]): Id<'esl_events'> {
	if (Array.isArray(created)) throw new Error('expected a single event row');
	return created;
}

describe('esl/events.create', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates a ranged task event with a default All target', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Passport check',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
		const eventId = singleId(created);
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({
			type: 'task',
			title: 'Passport check',
			target: 'all',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
	});

	it('refuses a range on a single-date type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_school',
				title: 'Off',
				note: 'Typhoon day',
				date: '2025-09-25',
				endDate: '2025-09-26'
			})
		).rejects.toThrow(/range/i);
	});

	it('refuses a free-text title on a locked type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_school',
				title: 'Typhoon day',
				date: '2025-09-25'
			})
		).rejects.toThrow(/always shows "Off"/);
	});

	it('refuses a blank task title', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'task',
				title: '   ',
				date: '2025-09-25'
			})
		).rejects.toThrow(/title/i);
	});

	it('refuses an exam title outside the locked three', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'exam',
				title: 'Midterm',
				date: '2025-10-16'
			})
		).rejects.toThrow(/Exam 1/);
	});

	it('refuses another event on a no-school day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-25'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				title: 'No class',
				note: 'Assembly',
				date: '2025-09-25'
			})
		).rejects.toThrow();
	});

	it('refuses another event on an exam day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'task',
				title: 'Passport check',
				date: '2025-10-16'
			})
		).rejects.toThrow();
	});

	it('refuses a second partial on one date', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'partial',
			title: 'No class',
			note: 'BBQ',
			date: '2025-09-12',
			startPeriod: 3
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'partial',
				title: 'No class',
				note: 'Late start',
				date: '2025-09-12',
				endPeriod: 2
			})
		).rejects.toThrow(/partial/i);
	});

	it('refuses out-of-range partial periods', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'partial',
				title: 'No class',
				note: 'Late start',
				date: '2025-09-12',
				startPeriod: 9
			})
		).rejects.toThrow(/period/i);
	});

	it('refuses partial bounds on a non-partial type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				title: 'No class',
				note: 'Assembly',
				date: '2025-09-12',
				startPeriod: 3
			})
		).rejects.toThrow(/partial/i);
	});

	it.each([
		['start_school', 'Start at P3', '2025-09-01', 'all'],
		['quiz', 'Unit 1 Quiz Due', '2025-09-02', 'CLIL'],
		['exam', 'Exam 1', '2025-10-16', 'all'],
		['passport_due', 'Passport due', '2025-09-03', 'Comm'],
		['recording_due', 'Recording due', '2025-09-04', 'Comm'],
		['g9_mock', 'G9 Mock Exam', '2025-09-05', 'G9']
	] as const)('ignores the note for banner-only type %s', async (type, title, date, target) => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type,
			title,
			target,
			note: 'should be dropped',
			date
		});
		const eventId = Array.isArray(created) ? created[0] : created;
		if (!eventId) throw new Error('event create returned no rows');
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event.note).toBeUndefined();
	});
});

describe('esl per-type target gating (#212)', () => {
	it('locks quiz to CLIL, passport/recording dues to Comm, mocks to G9, exclusive types to all', () => {
		expect(lockedTargetForEventType('quiz')).toBe('CLIL');
		expect(lockedTargetForEventType('passport_due')).toBe('Comm');
		expect(lockedTargetForEventType('recording_due')).toBe('Comm');
		expect(lockedTargetForEventType('g9_mock')).toBe('G9');
		expect(lockedTargetForEventType('exam')).toBe('all');
		expect(lockedTargetForEventType('no_school')).toBe('all');
		expect(lockedTargetForEventType('no_class')).toBe('all');
	});

	it('leaves Start, Partial, and Task open to the target dropdown', () => {
		expect(lockedTargetForEventType('start_school')).toBeNull();
		expect(lockedTargetForEventType('partial')).toBeNull();
		expect(lockedTargetForEventType('task')).toBeNull();
		expect(defaultTargetForEventType('task')).toBe('all');
		expect(defaultTargetForEventType('quiz')).toBe('CLIL');
	});

	it('refuses a mistargeted write with a sentence naming the locked target', () => {
		expect(assertValidEslTarget('quiz', 'Comm')).toMatchObject({
			kind: 'badTarget',
			expected: 'CLIL'
		});
		expect(describeEslEventError({ kind: 'badTarget', type: 'quiz', expected: 'CLIL' })).toMatch(
			/CLIL/
		);
		expect(assertValidEslTarget('exam', 'all')).toBeNull();
		expect(assertValidEslTarget('task', 'G8')).toBeNull();
	});

	it('reaches G7/G8 grade classes and H1 grade-10 classes', () => {
		expect(eventReachesClass('G7', 'CLIL', 7)).toBe(true);
		expect(eventReachesClass('G7', 'Comm', 7)).toBe(true);
		expect(eventReachesClass('G7', 'G9', 9)).toBe(false);
		expect(eventReachesClass('G8', 'Comm', 8)).toBe(true);
		expect(eventReachesClass('G8', 'CLIL', 7)).toBe(false);
		expect(eventReachesClass('H1', 'H10A', 10)).toBe(true);
		expect(eventReachesClass('H1', 'H10B', 10)).toBe(true);
		expect(eventReachesClass('H1', 'CLIL', 7)).toBe(false);
		// G10 still sees all-target events only otherwise.
		expect(eventReachesClass('CLIL', 'H10A', 10)).toBe(false);
		expect(eventReachesClass('all', 'H10A', 10)).toBe(true);
	});

	it('refuses a quiz outside CLIL and an off outside all', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'quiz',
				title: 'Unit 1 Quiz Due',
				target: 'Comm',
				date: '2025-09-02'
			})
		).rejects.toThrow(/CLIL/);
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_school',
				title: 'Off',
				note: 'Targeted retreat',
				target: 'CLIL',
				date: '2025-09-08'
			})
		).rejects.toThrow(/all/i);
	});

	it('accepts dropdown targets on Start, Partial, and Task', async () => {
		const { t, semesterId } = await seededSemester();
		const taskId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'G8 survey',
			target: 'G8',
			date: '2025-09-03'
		});
		if (Array.isArray(taskId)) throw new Error('task create fanned out');
		const task = await t.query(api.esl.events.get, { eventId: taskId });
		expect(task.target).toBe('G8');
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'partial',
			title: 'No class',
			note: 'Late start',
			target: 'H1',
			date: '2025-09-04'
		});
	});

	it('refuses retargeting onto a type whose gate the target breaks', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Check',
			target: 'G7',
			date: '2025-09-17'
		});
		const eventId = singleId(created);
		if (Array.isArray(eventId)) throw new Error('task create fanned out');
		await expect(
			t.mutation(api.esl.events.update, { eventId, type: 'quiz', title: 'Quiz' })
		).rejects.toThrow(/CLIL/);
		await t.mutation(api.esl.events.update, {
			eventId,
			type: 'quiz',
			title: 'Quiz',
			target: 'CLIL'
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({ type: 'quiz', target: 'CLIL' });
	});
});

describe('esl exam multi-day creates (#212)', () => {
	it('fans Exam 1 out to 2 teaching days sharing one examGroup', async () => {
		const { t, semesterId } = await seededSemester();
		// Thu 2025-10-16 + Fri 2025-10-17: two consecutive teaching days.
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		if (!Array.isArray(created) || created.length !== 2) {
			throw new Error(`expected 2 exam rows, got ${JSON.stringify(created)}`);
		}
		const [first, second] = await Promise.all(
			created.map((eventId) => t.query(api.esl.events.get, { eventId }))
		);
		expect(first).toMatchObject({ type: 'exam', title: 'Exam 1', date: '2025-10-16' });
		expect(second).toMatchObject({ type: 'exam', title: 'Exam 1', date: '2025-10-17' });
		expect(first?.examGroup).toBe('Exam 1');
		expect(second?.examGroup).toBe('Exam 1');
	});

	it('fans the Final out to 3 teaching days pushing past the weekend', async () => {
		const { t, semesterId } = await seededSemester();
		// Fri 2025-10-17 start: the Final takes Fri + Mon + Tue.
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Final Exam',
			date: '2025-10-17'
		});
		if (!Array.isArray(created)) throw new Error('exam create did not fan out');
		const dates = [];
		for (const eventId of created) {
			const event = await t.query(api.esl.events.get, { eventId });
			dates.push(event.date);
			expect(event.examGroup).toBe('Final Exam');
		}
		expect(dates.sort()).toEqual(['2025-10-17', '2025-10-20', '2025-10-21']);
	});

	it('pushes past off days when fanning out', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Holiday Monday',
			date: '2025-10-20'
		});
		// Fri start with Monday off: Fri + Tue + Wed.
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Final Exam',
			date: '2025-10-17'
		});
		if (!Array.isArray(created)) throw new Error('exam create did not fan out');
		const dates = [];
		for (const eventId of created) {
			dates.push((await t.query(api.esl.events.get, { eventId })).date);
		}
		expect(dates.sort()).toEqual(['2025-10-17', '2025-10-21', '2025-10-22']);
	});

	it('refuses an off colliding with an exam day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		// The fan-out holds Fri 10/17 too: an off landing there refuses.
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_school',
				title: 'Off',
				note: 'Clashing day',
				date: '2025-10-17'
			})
		).rejects.toThrow(/already holds an exam/);
	});

	it('refuses a duplicate exam title while groups remain', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'exam',
				title: 'Exam 1',
				date: '2025-11-17'
			})
		).rejects.toThrow(/already has its days/);
	});

	it('refuses a fourth exam group', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 2',
			date: '2025-11-17'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Final Exam',
			date: '2026-01-20'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'exam',
				title: 'Exam 1',
				date: '2026-02-09'
			})
		).rejects.toThrow(/three exam groups/);
	});

	it('refuses retitling an exam day onto an occupied title', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		if (!Array.isArray(created) || !created[0]) throw new Error('exam create did not fan out');
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 2',
			date: '2025-11-17'
		});
		await expect(
			t.mutation(api.esl.events.update, { eventId: created[0], title: 'Exam 2' })
		).rejects.toThrow(/already has its days/);
	});

	it('moves one exam day while the group stays intact', async () => {
		const { t, semesterId } = await seededSemester();
		// Tue 2026-01-20: the Final takes Tue + Wed + Thu.
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Final Exam',
			date: '2026-01-20'
		});
		if (!Array.isArray(created) || !created[0]) throw new Error('exam create did not fan out');
		await t.mutation(api.esl.events.update, { eventId: created[0], date: '2026-01-23' });
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		const finals = events.filter((event) => event.type === 'exam');
		expect(finals.map((event) => event.date).sort()).toEqual([
			'2026-01-21',
			'2026-01-22',
			'2026-01-23'
		]);
		expect(finals.every((event) => event.examGroup === 'Final Exam')).toBe(true);
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester?.derivedEnd).toBe('2026-01-23');
	});
});

describe('esl/events.update', () => {
	it('edits a seeded row in place (title, date, note)', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: "Sport's Day setup",
			date: '2025-10-24'
		});
		const eventId = singleId(created);
		await t.mutation(api.esl.events.update, {
			eventId,
			title: "Sport's Day setup (moved)",
			date: '2025-10-31',
			note: "No Sport's Day in 2027 — delete instead"
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({
			title: "Sport's Day setup (moved)",
			date: '2025-10-31',
			note: "No Sport's Day in 2027 — delete instead"
		});
	});

	it('refuses a title change off the locked value', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-10-24'
		});
		const eventId = singleId(created);
		await expect(
			t.mutation(api.esl.events.update, { eventId, title: "Sport's Day" })
		).rejects.toThrow(/always shows "No class"/);
	});

	it('refuses a move onto a no-school day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-25'
		});
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: 'Assembly',
			date: '2025-09-26'
		});
		const eventId = singleId(created);
		await expect(
			t.mutation(api.esl.events.update, { eventId, date: '2025-09-25' })
		).rejects.toThrow(/exclusive/);
	});

	it('refuses a second partial on one date via update', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'partial',
			title: 'No class',
			note: 'BBQ',
			date: '2025-09-12',
			startPeriod: 3
		});
		const otherId = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'partial',
				title: 'No class',
				note: 'Late start',
				date: '2025-09-13'
			})
		);
		await expect(
			t.mutation(api.esl.events.update, { eventId: otherId, date: '2025-09-12' })
		).rejects.toThrow(/partial/i);
	});

	it('refuses updates from non-admin staff', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-10-24'
		});
		const eventId = singleId(created);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(t.mutation(api.esl.events.update, { eventId, note: 'Changed' })).rejects.toThrow(
			/ESL admin/
		);
	});

	it('ignores the note on update for a banner-only type', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		if (!Array.isArray(created) || !created[0]) throw new Error('exam create did not fan out');
		const eventId = created[0];
		await t.mutation(api.esl.events.update, { eventId, note: 'should be dropped' });
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event.note).toBeUndefined();
	});

	it('clears the note when an update retargets a row to a banner-only type', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Passport check',
			note: 'Unit 3',
			date: '2025-09-17'
		});
		const eventId = singleId(created);
		await t.mutation(api.esl.events.update, {
			eventId,
			type: 'quiz',
			title: 'Quiz',
			target: 'CLIL'
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({ type: 'quiz' });
		expect(event.note).toBeUndefined();
	});
});

describe('esl/events.remove', () => {
	it("deletes a deletable seeded row (Sport's Day, dues)", async () => {
		const { t, semesterId } = await seededSemester();
		const sportsId = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				title: 'No class',
				note: "Sport's Day",
				date: '2025-10-24'
			})
		);
		await t.mutation(api.esl.events.remove, { eventId: sportsId });
		await expect(t.query(api.esl.events.get, { eventId: sportsId })).rejects.toThrow(
			/Event not found/
		);
	});

	it('refuses to delete an exam row', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		if (!Array.isArray(created) || !created[0]) throw new Error('exam create did not fan out');
		const eventId = created[0];
		await expect(t.mutation(api.esl.events.remove, { eventId })).rejects.toThrow(
			/protected|Exam 1/i
		);
	});

	it('refuses to delete the graduation ceremony', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			target: 'all',
			title: 'No class',
			note: 'Graduation ceremony',
			date: '2026-06-19'
		});
		const eventId = singleId(created);
		await expect(t.mutation(api.esl.events.remove, { eventId })).rejects.toThrow(
			/protected|ceremony/i
		);
	});

	it('refuses deletion from non-admin staff', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-10-24'
		});
		const eventId = singleId(created);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(t.mutation(api.esl.events.remove, { eventId })).rejects.toThrow(/ESL admin/);
	});
});

describe('esl/events.migrateToV3', () => {
	it('reports zero migrated rows on a v3 database (idempotent)', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Passport check',
			date: '2025-09-17'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-25'
		});
		const report = await t.mutation(api.esl.events.migrateToV3, {});
		expect(report).toMatchObject({ total: 2, migrated: 0, skipped: [] });
	});

	it('refuses migration from non-admin staff', async () => {
		const { t } = await seededSemester();
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(t.mutation(api.esl.events.migrateToV3, {})).rejects.toThrow(/ESL admin/);
	});

	// NOTE: the `hasTitle` skip guard in `migrateToV3` cannot be covered
	// here — convex-test enforces the schema, so a title-less row is
	// uninsertable by construction. It was proven live instead: the local
	// deployment held 4 title-less exam rows whose labels already read
	// canonical, the old condition skipped all 4, the fixed one migrated
	// them, and the follow-up count came back zero.
});
