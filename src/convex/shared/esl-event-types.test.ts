import { describe, expect, it } from 'vitest';
import {
	ESL_EVENT_TITLES,
	ESL_EVENT_TYPES,
	ESL_EVENT_TYPE_LABELS,
	ESL_EXAM_TITLES,
	ESL_RANGED_EVENT_TYPES,
	assertValidEslTitle,
	describeEslEventError,
	isEslEventType,
	isProtectedSeedEvent,
	isRangedEventType,
	migrateLegacyEslEvent,
	type EslEventType
} from './esl';

/**
 * Ticket #210: the 10-type event union with locked titles. Every event row
 * carries an explicit `title` (chip/banner text) plus a separate `note`
 * (detail line) — the two are never derived from each other. Only `task`
 * takes a free-text title; every other type's title is locked.
 */
describe('esl event types v3 (#210)', () => {
	it('exposes exactly the ten v3 types, with homework_due gone', () => {
		expect([...ESL_EVENT_TYPES].sort()).toEqual(
			[
				'exam',
				'g9_mock',
				'no_class',
				'no_school',
				'partial',
				'passport_due',
				'quiz',
				'recording_due',
				'start_school',
				'task'
			].sort()
		);
		expect(ESL_EVENT_TYPES).not.toContain('homework_due');
		expect(ESL_EVENT_TYPES).not.toContain('task_due');
		expect(ESL_EVENT_TYPES).not.toContain('off');
	});

	it('recognises only v3 types', () => {
		expect(isEslEventType('task')).toBe(true);
		expect(isEslEventType('no_school')).toBe(true);
		expect(isEslEventType('g9_mock')).toBe(true);
		expect(isEslEventType('homework_due')).toBe(false);
		expect(isEslEventType('task_due')).toBe(false);
		expect(isEslEventType('off')).toBe(false);
	});

	it('locks the ticket-specified title per type', () => {
		expect(ESL_EVENT_TITLES).toMatchObject({
			start_school: 'Start at P3',
			quiz: 'Quiz',
			no_school: 'Off',
			no_class: 'No class',
			partial: 'No class',
			passport_due: 'Passport due',
			recording_due: 'Recording due',
			g9_mock: 'G9 Mock Exam'
		});
		expect([...ESL_EXAM_TITLES]).toEqual(['Exam 1', 'Exam 2', 'Final Exam']);
	});

	it('labels every type for the form dropdown from one shared map', () => {
		expect(ESL_EVENT_TYPE_LABELS).toMatchObject({
			start_school: 'Start of school',
			quiz: 'Quiz',
			no_school: 'No school',
			no_class: 'No class',
			partial: 'Partial day',
			exam: 'Exam',
			passport_due: 'Passport due',
			recording_due: 'Recording due',
			task: 'Task',
			g9_mock: 'G9 mock'
		});
		for (const type of ESL_EVENT_TYPES) {
			expect(typeof ESL_EVENT_TYPE_LABELS[type]).toBe('string');
		}
	});

	it('treats task, quiz, and the named dues as the only ranged types', () => {
		expect([...ESL_RANGED_EVENT_TYPES].sort()).toEqual(
			['passport_due', 'quiz', 'recording_due', 'task'].sort()
		);
		expect(isRangedEventType('task')).toBe(true);
		expect(isRangedEventType('passport_due')).toBe(true);
		expect(isRangedEventType('recording_due')).toBe(true);
		expect(isRangedEventType('quiz')).toBe(true);
		expect(isRangedEventType('exam')).toBe(false);
		expect(isRangedEventType('no_school')).toBe(false);
		expect(isRangedEventType('g9_mock')).toBe(false);
	});

	it('requires a free-text title on task and nothing else', () => {
		expect(assertValidEslTitle('task', 'Passport Unit 3 due')).toBeNull();
		expect(assertValidEslTitle('task', '   ')).toMatchObject({ kind: 'emptyTitle' });
		const error = assertValidEslTitle('task', '   ');
		expect(error && describeEslEventError(error)).toMatch(/title/i);
	});

	it('accepts only the locked title per fixed type', () => {
		const cases: [EslEventType, string][] = [
			['start_school', 'Start at P3'],
			['quiz', 'Quiz'],
			['no_school', 'Off'],
			['no_class', 'No class'],
			['partial', 'No class'],
			['passport_due', 'Passport due'],
			['recording_due', 'Recording due'],
			['g9_mock', 'G9 Mock Exam']
		];
		for (const [type, title] of cases) {
			expect(assertValidEslTitle(type, title)).toBeNull();
		}
		expect(assertValidEslTitle('no_school', 'Typhoon day')).toMatchObject({
			kind: 'lockedTitle'
		});
		expect(assertValidEslTitle('quiz', 'Pop quiz')).toMatchObject({ kind: 'lockedTitle' });
		const locked = assertValidEslTitle('no_school', 'Typhoon day');
		expect(locked && describeEslEventError(locked)).toMatch(/Off/);
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
		expect(isProtectedSeedEvent({ type: 'task', title: 'Passport Unit 1 due' })).toBe(false);
		expect(isProtectedSeedEvent({ type: 'no_school', title: 'Off', note: 'Moon Festival' })).toBe(
			false
		);
	});
});

describe('esl legacy migration (#210)', () => {
	it('unifies homework_due and task_due rows into task, keeping free text', () => {
		expect(migrateLegacyEslEvent({ type: 'homework_due', label: 'Workbook p.42' })).toMatchObject({
			type: 'task',
			title: 'Workbook p.42'
		});
		expect(migrateLegacyEslEvent({ type: 'task_due', label: 'Passport check' })).toMatchObject({
			type: 'task',
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
