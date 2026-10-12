import { describe, it, expect } from 'vitest';
import {
	checklistWindow,
	G9_MOCK_STARTS_BY_TERM,
	PASSPORT_RECORDING_PER_SEMESTER,
	QUNIT_QUIZ_PER_SEMESTER,
	QUNIT_UNIT_PER_SEMESTER,
	expectedG9MockStarts,
	expectedPassportRecordingCounts,
	expectedUnitQuizDrafts,
	offDayChecklist,
	type ChecklistCacheRow,
	type ChecklistEventRow
} from './esl';

const cache = (rows: ChecklistCacheRow[]): ChecklistCacheRow[] => rows;
const events = (rows: ChecklistEventRow[]): ChecklistEventRow[] => rows;

describe('checklist window (#213 group a range)', () => {
	it('clamps to today while no exams exist (finals TBD)', () => {
		expect(checklistWindow('2025-08-31', null, '2025-10-01')).toEqual({
			start: '2025-08-31',
			end: '2025-10-01'
		});
	});

	it('extends to the derived end once exams exist', () => {
		expect(checklistWindow('2025-08-31', '2026-01-20', '2025-10-01')).toEqual({
			start: '2025-08-31',
			end: '2026-01-20'
		});
	});
});

describe('off-day checklist (#213 group a)', () => {
	const rows = cache([
		{ date: '20251006', isHoliday: true, caption: '中秋節' },
		{ date: '20251007', isHoliday: false, caption: '' },
		{ date: '2025-10-08', isHoliday: true, caption: '補假' }
	]);

	it('flags cache holidays in-window without a no-school row as missing', () => {
		const status = offDayChecklist(rows, events([]), {
			start: '2025-10-01',
			end: '2025-10-31'
		});
		expect(status.missing).toEqual(['2025-10-06', '2025-10-08']);
		expect(status.present).toEqual([]);
		expect(status.ok).toBe(false);
	});

	it('marks a date present once a no-school row covers it', () => {
		const status = offDayChecklist(rows, events([{ type: 'no_school', date: '2025-10-06' }]), {
			start: '2025-10-01',
			end: '2025-10-31'
		});
		expect(status.present).toEqual(['2025-10-06']);
		expect(status.missing).toEqual(['2025-10-08']);
	});

	it('ignores holidays outside the window', () => {
		const status = offDayChecklist(rows, events([]), {
			start: '2025-10-07',
			end: '2025-10-07'
		});
		expect(status.missing).toEqual([]);
		expect(status.ok).toBe(true);
	});
});

describe('unit/quiz stub interface (#213 group b, rules owned by #214)', () => {
	it('expects six quizzes per semester', () => {
		expect(QUNIT_QUIZ_PER_SEMESTER).toBe(6);
	});

	it('expects six unit drafts per semester (stub counts; #214 owns dates)', () => {
		expect(QUNIT_UNIT_PER_SEMESTER).toBe(6);
	});

	it('exposes the stub expectation per term behind one seam', () => {
		expect(expectedUnitQuizDrafts('S1')).toEqual({ units: 6, quizzes: 6 });
		expect(expectedUnitQuizDrafts('S2')).toEqual({ units: 6, quizzes: 6 });
	});
});

describe('passport/recording checklist (#213 group c)', () => {
	it('expects three of each per semester', () => {
		expect(PASSPORT_RECORDING_PER_SEMESTER).toBe(3);
		expect(expectedPassportRecordingCounts({ term: 'S1' })).toEqual({
			passport: 3,
			recording: 3
		});
	});

	it('expects two of each for G9 in S2 (first two terms only)', () => {
		expect(expectedPassportRecordingCounts({ term: 'S2', g9S2: true })).toEqual({
			passport: 2,
			recording: 2
		});
	});
});

describe('G9 mock checklist (#213 group d)', () => {
	it('expects two mock starts in S1 and three in S2', () => {
		expect(G9_MOCK_STARTS_BY_TERM).toEqual({ S1: 2, S2: 3 });
		expect(expectedG9MockStarts('S1')).toBe(2);
		expect(expectedG9MockStarts('S2')).toBe(3);
	});
});
