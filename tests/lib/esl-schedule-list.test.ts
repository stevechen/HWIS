import { describe, it, expect } from 'vitest';
import {
	buildEventNoteMap,
	buildScheduleTsv,
	classContext,
	countdownText,
	descriptionText,
	eventNoteKey,
	EXAM_LABELS,
	noteText
} from '$lib/esl-schedule-list';
import { ESL_EXAM_TITLES } from '$convex/shared/esl';
import type { ScheduleDayRow } from '$convex/shared/esl';

function row(overrides: Partial<ScheduleDayRow>): ScheduleDayRow {
	return {
		date: '2025-09-01',
		weekday: 'Monday',
		classId: 'class_clil',
		type: 'CLIL',
		cohortGrade: 7,
		period: 1,
		status: 'teaching',
		cause: null,
		badges: [],
		dues: [],
		count: null,
		...overrides
	};
}

const CLASS_NAMES = { class_clil: 'G7 Basic 1 CLIL' };

describe('esl-schedule-list (#203 canonical columns)', () => {
	it('counts remaining classes down to 0 at the last class before the exam', () => {
		expect(countdownText(row({ count: { position: 1, total: 18, label: 'Exam 1' } }))).toBe('17');
		expect(countdownText(row({ count: { position: 18, total: 18, label: 'Exam 1' } }))).toBe('0');
	});

	it('leaves the countdown blank on off, no-class, and exam rows', () => {
		const count = { position: 1, total: 4, label: 'Exam 1' };
		expect(countdownText(row({ status: 'off', count }))).toBe('');
		expect(countdownText(row({ status: 'no_class', count }))).toBe('');
		expect(countdownText(row({ status: 'exam', count }))).toBe('');
	});

	it('renders no Class x/y to Exam z text anywhere in the countdown', () => {
		const text = countdownText(row({ count: { position: 2, total: 5, label: 'Exam 1' } }));
		expect(text).not.toContain('Class');
		expect(text).not.toContain('to');
	});

	it('renders exam rows by label: Exam 1 / Exam 2 / Final Exam', () => {
		expect(descriptionText(row({ status: 'exam', cause: 'Exam 1' }), CLASS_NAMES)).toBe('Exam 1');
		expect(descriptionText(row({ status: 'exam', cause: 'Exam 2' }), CLASS_NAMES)).toBe('Exam 2');
		expect(descriptionText(row({ status: 'exam', cause: 'Final Exam' }), CLASS_NAMES)).toBe(
			'Final Exam'
		);
	});

	it('renames a legacy generic Final exam label to Final Exam', () => {
		expect(descriptionText(row({ status: 'exam', cause: 'Final exam' }), CLASS_NAMES)).toBe(
			'Final Exam'
		);
	});

	it('keeps class context on teaching rows, with no Class x/y count-up text', () => {
		const text = descriptionText(row({}), CLASS_NAMES);
		expect(text).toBe('G7 Basic 1 CLIL P1');
		expect(text).not.toContain(' to ');
	});

	it('emits the canonical TSV envelope # Date Description Note', () => {
		const rows = [
			row({ date: '2025-09-01', count: { position: 1, total: 2, label: 'Exam 1' } }),
			row({ status: 'exam', cause: 'Exam 1', count: { position: 1, total: 1, label: 'Exam 1' } })
		];
		const tsv = buildScheduleTsv(rows, CLASS_NAMES, {});
		const lines = tsv.split('\n');
		expect(lines[0]).toBe('#\tDate\tDescription\tNote');
		expect(lines[1]?.split('\t')).toEqual(['1', '2025-09-01', 'G7 Basic 1 CLIL P1', '']);
		expect(lines[2]?.split('\t')).toEqual(['', '2025-09-01', 'Exam 1', '']);
	});

	it('shares the single canonical exam-label source with the backend', () => {
		expect(EXAM_LABELS).toBe(ESL_EXAM_TITLES);
	});

	it('keys event notes by date+title so same-title events do not leak notes', () => {
		expect(eventNoteKey('2025-09-05', 'Moon Festival')).toBe('2025-09-05|Moon Festival');
		const map = buildEventNoteMap([
			{ date: '2025-09-05', title: 'Moon Festival', note: 'BBQ logistics' },
			{ date: '2025-10-06', title: 'Moon Festival', note: 'Other note' }
		]);
		const first = noteText(row({ date: '2025-09-05', cause: 'Moon Festival' }), map);
		expect(first).toBe('BBQ logistics');
	});

	it('shows title+note on in-window partial rows, note only out of window', () => {
		const notes = buildEventNoteMap([
			{ date: '2025-09-08', title: 'No class', note: 'Late start' }
		]);
		const inWindow = row({
			date: '2025-09-08',
			status: 'partial',
			cause: 'No class',
			badges: []
		});
		expect(descriptionText(inWindow, CLASS_NAMES)).toBe('G7 Basic 1 CLIL P1 · No class');
		expect(noteText(inWindow, notes)).toBe('Late start');
		const outOfWindow = row({
			date: '2025-09-08',
			status: 'partial',
			cause: 'No class',
			badges: ['out-of-window P1 (window from P2)'],
			outOfWindow: true
		});
		expect(descriptionText(outOfWindow, CLASS_NAMES)).toBe('G7 Basic 1 CLIL P1');
		expect(descriptionText(outOfWindow, CLASS_NAMES)).not.toContain('No class');
		expect(noteText(outOfWindow, notes)).toBe('Late start');
	});

	it('still exposes the class context helper the calendar reuses', () => {
		expect(classContext(row({}), CLASS_NAMES)).toBe('G7 Basic 1 CLIL P1');
	});
});
