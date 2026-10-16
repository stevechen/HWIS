import { describe, expect, it, afterEach, vi } from 'vite-plus/test';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';
import {
	assertValidEslTarget,
	defaultTargetForEventType,
	describeEslEventError,
	eventReachesClass,
	lockedTargetForEventType,
	lockedTargetForReminderKind
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

	it('creates a ranged task-kind reminder with a default All target', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'reminder',
			reminderKind: 'task',
			title: 'Passport check',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
		const eventId = singleId(created);
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({
			type: 'reminder',
			reminderKind: 'task',
			title: 'Passport check',
			target: 'all',
			date: '2025-09-17',
			endDate: '2025-09-24',
			isBanner: true
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

	it('refuses a blank task-kind reminder title', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'task',
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
				type: 'reminder',
				reminderKind: 'task',
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
		['start_school', undefined, 'Start at P3', '2025-09-01', 'all'],
		['reminder', 'quiz', 'Unit 1 Quiz Due', '2025-09-02', 'CLIL'],
		['exam', undefined, 'Exam 1', '2025-10-16', 'all'],
		['reminder', 'passport', 'Passport due', '2025-09-03', 'Comm'],
		['reminder', 'recording', 'Recording due', '2025-09-04', 'Comm'],
		['reminder', 'passport_check', 'Passport check', '2025-09-06', 'Comm'],
		['reminder', 'workbook_check', 'Workbook check', '2025-09-07', 'CLIL'],
		['g9_mock', undefined, 'G9 Mock Exam', '2025-09-05', 'G9']
	] as const)(
		'ignores the note for banner-only type %s kind %s',
		async (type, kind, title, date, target) => {
			const { t, semesterId } = await seededSemester();
			const created = await t.mutation(api.esl.events.create, {
				semesterId,
				type,
				...(kind === undefined ? {} : { reminderKind: kind }),
				title,
				target,
				note: 'should be dropped',
				date
			});
			const eventId = Array.isArray(created) ? created[0] : created;
			if (!eventId) throw new Error('event create returned no rows');
			const event = await t.query(api.esl.events.get, { eventId });
			expect(event.note).toBeUndefined();
		}
	);
});

describe('esl per-type target gating (#212)', () => {
	it('locks quiz-kind reminders to CLIL, passport/recording/checks to Comm, mocks to G9, exclusive types to all', () => {
		expect(lockedTargetForReminderKind('quiz')).toBe('CLIL');
		expect(lockedTargetForReminderKind('passport')).toBe('Comm');
		expect(lockedTargetForReminderKind('recording')).toBe('Comm');
		expect(lockedTargetForReminderKind('passport_check')).toBe('Comm');
		expect(lockedTargetForReminderKind('workbook_check')).toBe('CLIL');
		expect(lockedTargetForEventType('reminder')).toBeNull();
		expect(lockedTargetForEventType('g9_mock')).toBe('G9');
		expect(lockedTargetForEventType('exam')).toBe('all');
		expect(lockedTargetForEventType('no_school')).toBe('all');
		// no_class is now open (Graduation is G9, others default to all)
		expect(lockedTargetForEventType('no_class')).toBeNull();
	});

	it('leaves Start, Partial, and task-kind reminders open to the target dropdown', () => {
		expect(lockedTargetForEventType('start_school')).toBeNull();
		expect(lockedTargetForEventType('partial')).toBeNull();
		expect(lockedTargetForReminderKind('task')).toBeNull();
		expect(defaultTargetForEventType('reminder', 'task')).toBe('all');
		expect(defaultTargetForEventType('reminder', 'quiz')).toBe('CLIL');
	});

	it('refuses a mistargeted write with a sentence naming the locked target', () => {
		expect(assertValidEslTarget('reminder', 'Comm', 'quiz')).toMatchObject({
			kind: 'badTarget',
			expected: 'CLIL'
		});
		expect(
			describeEslEventError({
				kind: 'badTarget',
				type: 'reminder',
				expected: 'CLIL',
				reminderKind: 'quiz'
			})
		).toMatch(/CLIL/);
		expect(assertValidEslTarget('exam', 'all')).toBeNull();
		expect(assertValidEslTarget('reminder', 'G8', 'task')).toBeNull();
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

	it('refuses a quiz-kind reminder outside CLIL and an off outside all', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'quiz',
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

	it('accepts dropdown targets on Start, Partial, and task-kind reminders', async () => {
		const { t, semesterId } = await seededSemester();
		const taskId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'reminder',
			reminderKind: 'task',
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

	it('refuses retargeting onto a kind whose gate the target breaks', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'reminder',
			reminderKind: 'task',
			title: 'Check',
			target: 'G7',
			date: '2025-09-17'
		});
		const eventId = singleId(created);
		if (Array.isArray(eventId)) throw new Error('task create fanned out');
		await expect(
			t.mutation(api.esl.events.update, { eventId, reminderKind: 'quiz', title: 'Quiz' })
		).rejects.toThrow(/CLIL/);
		await t.mutation(api.esl.events.update, {
			eventId,
			reminderKind: 'quiz',
			title: 'Quiz',
			target: 'CLIL'
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({ type: 'reminder', reminderKind: 'quiz', target: 'CLIL' });
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
			type: 'reminder',
			reminderKind: 'task',
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

	it('clears the note when an update retargets a row to a banner-only kind', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'reminder',
			reminderKind: 'task',
			title: 'Passport check',
			note: 'Unit 3',
			date: '2025-09-17'
		});
		const eventId = singleId(created);
		await t.mutation(api.esl.events.update, {
			eventId,
			reminderKind: 'quiz',
			title: 'Quiz',
			target: 'CLIL'
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({ type: 'reminder', reminderKind: 'quiz' });
		expect(event.note).toBeUndefined();
	});
});

/**
 * Ticket #217: the mutation surface the semester-setup wizard writes
 * through — reminder kinds with their locked targets and banner default,
 * due windows that may not straddle an exam day, the first day's stored
 * P1–P2 window, and the two-day G9 mock.
 */
describe('esl/events wizard writes (#217)', () => {
	it('locks each reminder kind to its own target when the target is omitted', async () => {
		const { t, semesterId } = await seededSemester();
		const cases = [
			['quiz', 'Unit 1 Quiz Due', 'CLIL'],
			['passport', 'Passport due', 'Comm'],
			['recording', 'Recording due', 'Comm'],
			['passport_check', 'Passport check', 'Comm'],
			['workbook_check', 'Workbook check', 'CLIL'],
			['task', 'Passport Unit 3 due', 'all']
		] as const;
		for (const [kind, title, target] of cases) {
			const created = singleId(
				await t.mutation(api.esl.events.create, {
					semesterId,
					type: 'reminder',
					reminderKind: kind,
					title,
					date: '2025-09-17',
					endDate: '2025-09-24'
				})
			);
			const event = await t.query(api.esl.events.get, { eventId: created });
			expect(event).toMatchObject({ type: 'reminder', reminderKind: kind, target });
		}
	});

	it('refuses a reminder kind aimed outside its locked target', async () => {
		const { t, semesterId } = await seededSemester();
		for (const [kind, title, target] of [
			['quiz', 'Unit 1 Quiz Due', 'Comm'],
			['passport', 'Passport due', 'CLIL'],
			['workbook_check', 'Workbook check', 'Comm'],
			['passport_check', 'Passport check', 'CLIL']
		] as const) {
			await expect(
				t.mutation(api.esl.events.create, {
					semesterId,
					type: 'reminder',
					reminderKind: kind,
					title,
					target,
					date: '2025-09-17',
					endDate: '2025-09-24'
				})
			).rejects.toThrow(/CLIL|Comm/);
		}
	});

	it('banks a reminder as a banner by default and keeps an explicit opt-out', async () => {
		const { t, semesterId } = await seededSemester();
		const bannerId = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'passport',
				title: 'Passport due',
				target: 'Comm',
				date: '2025-09-17',
				endDate: '2025-09-24'
			})
		);
		expect(await t.query(api.esl.events.get, { eventId: bannerId })).toMatchObject({
			isBanner: true
		});
		const quietId = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'passport',
				title: 'Passport due',
				target: 'Comm',
				date: '2025-10-06',
				endDate: '2025-10-10',
				isBanner: false
			})
		);
		expect(await t.query(api.esl.events.get, { eventId: quietId })).toMatchObject({
			isBanner: false
		});
	});

	it('refuses a range whose end falls before its start', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'passport',
				title: 'Passport due',
				target: 'Comm',
				date: '2025-09-24',
				endDate: '2025-09-17'
			})
		).rejects.toThrow(/before/i);
	});

	it('refuses a due window that straddles an exam day, naming it', async () => {
		const { t, semesterId } = await seededSemester();
		// Exam 1 fans out to Thu 10/16 + Fri 10/17.
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'passport',
				title: 'Passport due',
				target: 'Comm',
				date: '2025-10-15',
				endDate: '2025-10-18'
			})
		).rejects.toThrow(/2025-10-16 already holds an exam/);
	});

	it('accepts a due window that ends the teaching day before an exam', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		const created = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'passport',
				title: 'Passport due',
				target: 'Comm',
				date: '2025-10-06',
				endDate: '2025-10-15'
			})
		);
		expect(await t.query(api.esl.events.get, { eventId: created })).toMatchObject({
			date: '2025-10-06',
			endDate: '2025-10-15'
		});
	});

	it('fans Exam 2 out to two days sharing one examGroup', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 2',
			date: '2025-11-17'
		});
		if (!Array.isArray(created) || created.length !== 2) {
			throw new Error(`expected 2 Exam 2 rows, got ${JSON.stringify(created)}`);
		}
		const rows = [];
		for (const eventId of created) {
			rows.push(await t.query(api.esl.events.get, { eventId }));
		}
		expect(rows.map((row) => row.date)).toEqual(['2025-11-17', '2025-11-18']);
		expect(rows.every((row) => row.examGroup === 'Exam 2' && row.target === 'all')).toBe(true);
	});

	it('fans a G9 mock out to two consecutive single-date rows', async () => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'g9_mock',
			title: 'G9 Mock Exam',
			date: '2025-09-05'
		});
		if (!Array.isArray(created) || created.length !== 2) {
			throw new Error(`expected 2 g9_mock rows, got ${JSON.stringify(created)}`);
		}
		const rows = [];
		for (const eventId of created) {
			rows.push(await t.query(api.esl.events.get, { eventId }));
		}
		// Single dates, never a range: no endDate on either row.
		expect(rows.map((row) => row.date)).toEqual(['2025-09-05', '2025-09-06']);
		expect(rows.every((row) => row.endDate === undefined)).toBe(true);
		expect(rows.every((row) => row.type === 'g9_mock' && row.target === 'G9')).toBe(true);
		expect(rows.every((row) => row.title === 'G9 Mock Exam')).toBe(true);
	});

	it('refuses a G9 mock landing on an exam day', async () => {
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
				type: 'g9_mock',
				title: 'G9 Mock Exam',
				date: '2025-10-17'
			})
		).rejects.toThrow(/already holds an exam/);
	});

	it('defaults the first day of school to a P1–P2 window', async () => {
		const { t, semesterId } = await seededSemester();
		const created = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'start_school',
				title: 'Start at P3',
				date: '2025-09-01'
			})
		);
		expect(await t.query(api.esl.events.get, { eventId: created })).toMatchObject({
			startPeriod: 1,
			endPeriod: 2
		});
	});

	it('keeps an explicit first-day window and refuses a reversed one', async () => {
		const { t, semesterId } = await seededSemester();
		const created = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'start_school',
				title: 'Start at P3',
				date: '2025-09-01',
				startPeriod: 2,
				endPeriod: 3
			})
		);
		expect(await t.query(api.esl.events.get, { eventId: created })).toMatchObject({
			startPeriod: 2,
			endPeriod: 3
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'start_school',
				title: 'Start at P3',
				date: '2025-09-02',
				startPeriod: 4,
				endPeriod: 2
			})
		).rejects.toThrow(/starts at P4 but ends at P2/);
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				title: 'No class',
				note: 'Assembly',
				date: '2025-09-03',
				startPeriod: 3
			})
		).rejects.toThrow(/partial/i);
	});

	it('keeps the first-day window across an edit and re-defaults it when cleared', async () => {
		const { t, semesterId } = await seededSemester();
		const created = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'start_school',
				title: 'Start at P3',
				date: '2025-09-01'
			})
		);
		await t.mutation(api.esl.events.update, { eventId: created, date: '2025-09-02' });
		expect(await t.query(api.esl.events.get, { eventId: created })).toMatchObject({
			date: '2025-09-02',
			startPeriod: 1,
			endPeriod: 2
		});
		await t.mutation(api.esl.events.update, { eventId: created, clearPeriods: true });
		expect(await t.query(api.esl.events.get, { eventId: created })).toMatchObject({
			startPeriod: 1,
			endPeriod: 2
		});
	});

	it('drops the first-day window when the row is retyped onto an unbounded type', async () => {
		const { t, semesterId } = await seededSemester();
		const created = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'start_school',
				title: 'Start at P3',
				date: '2025-09-01'
			})
		);
		await t.mutation(api.esl.events.update, {
			eventId: created,
			type: 'no_class',
			title: 'No class',
			note: 'Assembly'
		});
		const event = await t.query(api.esl.events.get, { eventId: created });
		expect(event).toMatchObject({ type: 'no_class' });
		expect(event.startPeriod).toBeUndefined();
		expect(event.endPeriod).toBeUndefined();
	});

	it('refuses widening a due window onto an exam day via update', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		const created = singleId(
			await t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'passport',
				title: 'Passport due',
				date: '2025-10-06',
				endDate: '2025-10-15'
			})
		);
		await expect(
			t.mutation(api.esl.events.update, { eventId: created, endDate: '2025-10-17' })
		).rejects.toThrow(/2025-10-16 already holds an exam/);
		await t.mutation(api.esl.events.update, { eventId: created, endDate: '2025-10-15' });
		expect(await t.query(api.esl.events.get, { eventId: created })).toMatchObject({
			endDate: '2025-10-15'
		});
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
	it('reports zero migrated rows on a current database (idempotent)', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'reminder',
			reminderKind: 'task',
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
