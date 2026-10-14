import { describe, expect, it } from 'vitest';
import {
	ESL_EVENT_TITLES,
	ESL_EVENT_TYPES,
	ESL_EVENT_TYPE_LABELS,
	ESL_EXAM_TITLES,
	ESL_LOCKED_REMINDER_TARGETS,
	ESL_RANGED_EVENT_TYPES,
	ESL_REMINDER_KINDS,
	ESL_REMINDER_TITLES,
	ESL_START_SCHOOL_PERIODS,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	defaultTargetForEventType,
	describeEslEventError,
	dueWindowDates,
	g9MockDates,
	isEslEventType,
	isEslReminderKind,
	isProtectedSeedEvent,
	isRangedEventType,
	lockedTargetForReminderKind,
	migrateLegacyEslEvent,
	migrateToReminderEslEvent,
	type EslEventType
} from './esl';

/**
 * Ticket #216: the 7-type event union with the consolidated `reminder` type.
 * Every event row carries an explicit `title` (chip/banner text) plus a
 * separate `note` (detail line) — the two are never derived from each other.
 * Quiz/task-kind reminders take a free-text title; every other type (and
 * locked reminder kind) has a locked title.
 */
describe('esl event types v4 reminder (#216)', () => {
	it('exposes exactly the seven types, with the old due-types gone', () => {
		expect([...ESL_EVENT_TYPES].sort()).toEqual(
			['exam', 'g9_mock', 'no_class', 'no_school', 'partial', 'reminder', 'start_school'].sort()
		);
		expect(ESL_EVENT_TYPES).not.toContain('quiz');
		expect(ESL_EVENT_TYPES).not.toContain('passport_due');
		expect(ESL_EVENT_TYPES).not.toContain('recording_due');
		expect(ESL_EVENT_TYPES).not.toContain('task');
		expect(ESL_EVENT_TYPES).not.toContain('homework_due');
		expect(ESL_EVENT_TYPES).not.toContain('task_due');
		expect(ESL_EVENT_TYPES).not.toContain('off');
	});

	it('recognises only current types', () => {
		expect(isEslEventType('reminder')).toBe(true);
		expect(isEslEventType('no_school')).toBe(true);
		expect(isEslEventType('g9_mock')).toBe(true);
		expect(isEslEventType('quiz')).toBe(false);
		expect(isEslEventType('passport_due')).toBe(false);
		expect(isEslEventType('task')).toBe(false);
		expect(isEslEventType('homework_due')).toBe(false);
	});

	it('exposes the six reminder kinds with per-kind titles', () => {
		expect([...ESL_REMINDER_KINDS].sort()).toEqual(
			['passport', 'passport_check', 'quiz', 'recording', 'task', 'workbook_check'].sort()
		);
		expect(isEslReminderKind('quiz')).toBe(true);
		expect(isEslReminderKind('task')).toBe(true);
		expect(ESL_REMINDER_TITLES).toMatchObject({
			passport: 'Passport due',
			recording: 'Recording due',
			passport_check: 'Passport check',
			workbook_check: 'Workbook check'
		});
	});

	it('locks the ticket-specified title per type', () => {
		expect(ESL_EVENT_TITLES).toMatchObject({
			start_school: 'Start at P3',
			no_school: 'Off',
			no_class: 'No class',
			partial: 'No class',
			g9_mock: 'G9 Mock Exam'
		});
		expect([...ESL_EXAM_TITLES]).toEqual(['Exam 1', 'Exam 2', 'Final Exam']);
	});

	it('labels every type for the form dropdown from one shared map', () => {
		expect(ESL_EVENT_TYPE_LABELS).toMatchObject({
			start_school: 'Start of school',
			reminder: 'Reminder',
			no_school: 'No school',
			no_class: 'No class',
			partial: 'Partial day',
			exam: 'Exam',
			g9_mock: 'G9 mock'
		});
		for (const type of ESL_EVENT_TYPES) {
			expect(typeof ESL_EVENT_TYPE_LABELS[type]).toBe('string');
		}
	});

	it('treats reminder as the only ranged type', () => {
		expect([...ESL_RANGED_EVENT_TYPES]).toEqual(['reminder']);
		expect(isRangedEventType('reminder')).toBe(true);
		expect(isRangedEventType('exam')).toBe(false);
		expect(isRangedEventType('no_school')).toBe(false);
		expect(isRangedEventType('g9_mock')).toBe(false);
	});

	it('requires a free-text title on quiz/task-kind reminders and nothing else', () => {
		expect(assertValidEslTitle('reminder', 'Passport Unit 3 due', 'task')).toBeNull();
		expect(assertValidEslTitle('reminder', '   ', 'task')).toMatchObject({ kind: 'emptyTitle' });
		expect(assertValidEslTitle('reminder', 'Unit 1 Quiz Due', 'quiz')).toBeNull();
		expect(assertValidEslTitle('reminder', '   ', 'quiz')).toMatchObject({ kind: 'emptyTitle' });
		const error = assertValidEslTitle('reminder', '   ', 'task');
		expect(error && describeEslEventError(error)).toMatch(/title/i);
		const quizError = assertValidEslTitle('reminder', '   ', 'quiz');
		expect(quizError && describeEslEventError(quizError)).toMatch(/quiz/i);
	});

	it('refuses a reminder without a kind', () => {
		expect(assertValidEslTitle('reminder', 'Unit 1 Quiz Due')).toMatchObject({
			kind: 'missingReminderKind'
		});
		expect(assertValidEslTarget('reminder', 'all')).toMatchObject({
			kind: 'missingReminderKind'
		});
	});

	it('accepts only the locked title per fixed type and locked reminder kind', () => {
		const cases: [EslEventType, string][] = [
			['start_school', 'Start at P3'],
			['no_school', 'Off'],
			['no_class', 'No class'],
			['partial', 'No class'],
			['g9_mock', 'G9 Mock Exam']
		];
		for (const [type, title] of cases) {
			expect(assertValidEslTitle(type, title)).toBeNull();
		}
		expect(assertValidEslTitle('reminder', 'Passport due', 'passport')).toBeNull();
		expect(assertValidEslTitle('reminder', 'Recording due', 'recording')).toBeNull();
		expect(assertValidEslTitle('reminder', 'Passport check', 'passport_check')).toBeNull();
		expect(assertValidEslTitle('reminder', 'Workbook check', 'workbook_check')).toBeNull();
		expect(assertValidEslTitle('no_school', 'Typhoon day')).toMatchObject({
			kind: 'lockedTitle'
		});
		expect(assertValidEslTitle('reminder', 'Unit 1 Quiz Due', 'quiz')).toBeNull();
		const locked = assertValidEslTitle('no_school', 'Typhoon day');
		expect(locked && describeEslEventError(locked)).toMatch(/Off/);
	});

	it('locks reminder targets per kind', () => {
		expect(lockedTargetForReminderKind('quiz')).toBe('CLIL');
		expect(lockedTargetForReminderKind('passport')).toBe('Comm');
		expect(lockedTargetForReminderKind('recording')).toBe('Comm');
		expect(lockedTargetForReminderKind('passport_check')).toBe('Comm');
		expect(lockedTargetForReminderKind('workbook_check')).toBe('CLIL');
		expect(lockedTargetForReminderKind('task')).toBeNull();
		expect(ESL_LOCKED_REMINDER_TARGETS.task).toBeNull();
		expect(defaultTargetForEventType('reminder', 'quiz')).toBe('CLIL');
		expect(defaultTargetForEventType('reminder', 'task')).toBe('all');
	});

	it('restricts exams to the three locked exam titles', () => {
		for (const title of ESL_EXAM_TITLES) {
			expect(assertValidEslTitle('exam', title)).toBeNull();
		}
		expect(assertValidEslTitle('exam', 'Final exam')).toMatchObject({ kind: 'lockedTitle' });
		expect(assertValidEslTitle('exam', 'Midterm')).toMatchObject({ kind: 'lockedTitle' });
	});

	it('still protects exams and the G9 ceremony (matched on title or note)', () => {
		expect(isProtectedSeedEvent({ type: 'exam', title: 'Exam 1' })).toBe(true);
		expect(
			isProtectedSeedEvent({
				type: 'no_class',
				title: 'No class',
				target: 'G9',
				note: 'Graduation ceremony'
			})
		).toBe(true);
		expect(isProtectedSeedEvent({ type: 'no_class', title: 'No class' })).toBe(false);
		expect(isProtectedSeedEvent({ type: 'reminder', title: 'Passport Unit 1 due' })).toBe(false);
		expect(isProtectedSeedEvent({ type: 'no_school', title: 'Off', note: 'Moon Festival' })).toBe(
			false
		);
	});
});

describe('esl legacy migration (#210, #216)', () => {
	it('unifies homework_due and task_due rows into task-kind reminders, keeping free text', () => {
		expect(migrateLegacyEslEvent({ type: 'homework_due', label: 'Workbook p.42' })).toMatchObject({
			type: 'reminder',
			reminderKind: 'task',
			title: 'Workbook p.42',
			isBanner: true
		});
		expect(migrateLegacyEslEvent({ type: 'task_due', label: 'Passport check' })).toMatchObject({
			type: 'reminder',
			reminderKind: 'task',
			title: 'Passport check'
		});
	});

	it('renames off rows to no_school with the locked title, preserving detail in note', () => {
		expect(
			migrateLegacyEslEvent({ type: 'off', label: 'Typhoon day', note: 'Stay home' })
		).toMatchObject({ type: 'no_school', title: 'Off', note: 'Typhoon day — Stay home' });
	});

	it('keeps already-locked titles untouched', () => {
		expect(migrateLegacyEslEvent({ type: 'off', label: 'Off' })).toMatchObject({
			type: 'no_school',
			title: 'Off',
			note: undefined
		});
	});

	it('canonicalises legacy exam titles onto the locked set', () => {
		expect(migrateLegacyEslEvent({ type: 'exam', label: 'Final exam' })).toMatchObject({
			type: 'exam',
			title: 'Final Exam'
		});
		expect(migrateLegacyEslEvent({ type: 'exam', label: 'Exam 1' })).toMatchObject({
			type: 'exam',
			title: 'Exam 1'
		});
	});

	it('parks unknown exam text in the note under a locked default', () => {
		expect(migrateLegacyEslEvent({ type: 'exam', label: 'Midterm' })).toMatchObject({
			type: 'exam',
			title: 'Exam 1',
			note: 'Midterm'
		});
	});

	it('returns null for unknown types', () => {
		expect(migrateLegacyEslEvent({ type: 'assembly', label: 'Gathering' })).toBeNull();
	});
});

describe('esl reminder consolidation (#216)', () => {
	it('maps v3 quiz rows to quiz-kind reminders', () => {
		expect(migrateToReminderEslEvent({ type: 'quiz', title: 'Unit 1 Quiz Due' })).toMatchObject({
			type: 'reminder',
			reminderKind: 'quiz',
			title: 'Unit 1 Quiz Due',
			isBanner: true
		});
	});

	it('maps v3 passport/recording dues to locked-kind reminders', () => {
		expect(
			migrateToReminderEslEvent({ type: 'passport_due', title: 'Passport due' })
		).toMatchObject({
			type: 'reminder',
			reminderKind: 'passport',
			title: 'Passport due',
			isBanner: true
		});
		expect(
			migrateToReminderEslEvent({ type: 'recording_due', title: 'Recording due' })
		).toMatchObject({ type: 'reminder', reminderKind: 'recording', isBanner: true });
	});

	it('maps v3 task rows to task-kind reminders keeping free text', () => {
		expect(migrateToReminderEslEvent({ type: 'task', title: 'Workbook p.42' })).toMatchObject({
			type: 'reminder',
			reminderKind: 'task',
			title: 'Workbook p.42'
		});
	});

	it('returns null for non-due types', () => {
		expect(migrateToReminderEslEvent({ type: 'exam', title: 'Exam 1' })).toBeNull();
		expect(migrateToReminderEslEvent({ type: 'reminder', title: 'Anything' })).toBeNull();
	});
});

/**
 * Ticket #217: the write rules the semester-setup wizard depends on — the
 * first day's period window, the fixed two-day G9 mock, and the due windows
 * that may never straddle an exam day.
 */
describe('esl wizard write rules (#217)', () => {
	it('carries the first day of school as a P1–P2 window', () => {
		expect(ESL_START_SCHOOL_PERIODS).toEqual({ startPeriod: 1, endPeriod: 2 });
	});

	it('lets the first day of school take period bounds and refuses them on every other type', () => {
		expect(
			assertValidEslEvent({
				type: 'start_school',
				date: '2025-09-01',
				startPeriod: ESL_START_SCHOOL_PERIODS.startPeriod,
				endPeriod: ESL_START_SCHOOL_PERIODS.endPeriod
			})
		).toBeNull();
		expect(
			assertValidEslEvent({ type: 'no_class', date: '2025-09-01', startPeriod: 3 })
		).toMatchObject({ kind: 'boundsNotAllowed', type: 'no_class' });
		expect(describeEslEventError({ kind: 'boundsNotAllowed', type: 'no_class' })).toMatch(
			/partial/i
		);
		expect(
			assertValidEslEvent({
				type: 'start_school',
				date: '2025-09-01',
				startPeriod: 3,
				endPeriod: 1
			})
		).toMatchObject({ kind: 'boundsOrder', startPeriod: 3, endPeriod: 1 });
	});

	it('spreads a G9 mock over two consecutive single dates', () => {
		expect(g9MockDates('2025-09-05')).toEqual(['2025-09-05', '2025-09-06']);
		expect(g9MockDates('2025-12-31')).toEqual(['2025-12-31', '2026-01-01']);
	});

	it('runs a due window over teaching days, past weekends', () => {
		expect(
			dueWindowDates({ startDate: '2025-10-17', dayCount: 3, blockedDates: new Set() })
		).toEqual(['2025-10-17', '2025-10-20', '2025-10-21']);
		// A weekend click snaps forward to the first teaching day.
		expect(
			dueWindowDates({ startDate: '2025-10-18', dayCount: 2, blockedDates: new Set() })
		).toEqual(['2025-10-20', '2025-10-21']);
	});

	it('stops a due window short of a blocked day', () => {
		// Wed 10/22 is an exam day: the window ends the teaching day before it,
		// so the range never straddles one.
		expect(
			dueWindowDates({
				startDate: '2025-10-20',
				dayCount: 5,
				blockedDates: new Set(['2025-10-22'])
			})
		).toEqual(['2025-10-20', '2025-10-21']);
		// No blocked day in the way: the full five days run to Friday.
		expect(
			dueWindowDates({
				startDate: '2025-10-20',
				dayCount: 5,
				blockedDates: new Set(['2025-10-29'])
			})
		).toEqual(['2025-10-20', '2025-10-21', '2025-10-22', '2025-10-23', '2025-10-24']);
		// Past the blocked day the window fills again from the next teaching day.
		expect(
			dueWindowDates({
				startDate: '2025-10-23',
				dayCount: 5,
				blockedDates: new Set(['2025-10-22'])
			})
		).toEqual(['2025-10-23', '2025-10-24', '2025-10-27', '2025-10-28', '2025-10-29']);
	});

	it('never lets a due window straddle a blocked day', () => {
		const blocked = new Set(['2025-10-22']);
		for (const startDate of ['2025-10-17', '2025-10-20', '2025-10-21']) {
			const days = dueWindowDates({ startDate, dayCount: 5, blockedDates: blocked });
			expect(days.length).toBeGreaterThan(0);
			expect(days.every((date) => !blocked.has(date))).toBe(true);
			expect(days.every((date) => date < '2025-10-22')).toBe(true);
		}
		// A start on the blocked day itself has no room: the window is empty
		// and the caller places it on the next teaching day instead.
		expect(dueWindowDates({ startDate: '2025-10-22', dayCount: 5, blockedDates: blocked })).toEqual(
			[]
		);
	});
});
