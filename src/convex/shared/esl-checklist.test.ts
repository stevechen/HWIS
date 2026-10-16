import { describe, it, expect } from 'vite-plus/test';
import {
	checklistWindow,
	examGroupStarts,
	G9_MOCK_STARTS_BY_TERM,
	PASSPORT_RECORDING_PER_SEMESTER,
	planUnitQuizRanges,
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

	it('never expects weekend rows — caption-less or named', () => {
		const weekendHeavy = cache([
			{ date: '20251004', isHoliday: true, caption: '' },
			{ date: '20251005', isHoliday: true, caption: '' },
			{ date: '20251006', isHoliday: true, caption: '中秋節' },
			// 2026-10-10 Double Tenth Day is a Saturday: named, but no
			// meetings run on weekends, so it is not an expected event.
			{ date: '20261010', isHoliday: true, caption: '國慶日' },
			{ date: '20251011', isHoliday: true, caption: '' },
			{ date: '20251012', isHoliday: true, caption: '' }
		]);
		const status = offDayChecklist(weekendHeavy, events([]), {
			start: '2025-10-01',
			end: '2026-10-31'
		});
		expect(status.expected).toEqual(['2025-10-06']);
		expect(status.missing).toEqual(['2025-10-06']);
		expect(status.ok).toBe(false);
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

describe('exam group starts (#213 group b anchors)', () => {
	it('takes the min date per exam group, oldest first', () => {
		expect(
			examGroupStarts([
				{ type: 'exam', title: 'Exam 1', date: '2025-10-14', examGroup: 'Exam 1' },
				{ type: 'exam', title: 'Exam 1', date: '2025-10-13', examGroup: 'Exam 1' },
				{ type: 'exam', title: 'Final Exam', date: '2026-01-20' }
			])
		).toEqual(['2025-10-13', '2026-01-20']);
	});

	it('ignores non-exam rows', () => {
		expect(
			examGroupStarts([
				{ type: 'no_school', title: 'Off', date: '2025-10-06' },
				{ type: 'reminder', title: 'Unit 1', date: '2025-10-07' }
			])
		).toEqual([]);
	});
});

describe('unit/quiz range planning (#213+#214 wiring)', () => {
	const meetings = [
		{ classId: 'c1', type: 'G9', cohortGrade: 9, day: 'Tuesday', period: 1 },
		{ classId: 'c1', type: 'G9', cohortGrade: 9, day: 'Thursday', period: 2 }
	] as const;

	it('anchors even units on the 7 days before each exam start', () => {
		const ranges = planUnitQuizRanges({
			term: 'S1',
			semesterStart: '2025-09-01',
			examStarts: ['2025-10-13', '2025-11-17', '2026-01-19'],
			meetings: [...meetings],
			events: [],
			fallbackEnd: '2025-10-31'
		});
		expect(ranges).toHaveLength(6);
		// U2/U4/U6 sit in the exact 7 calendar days before their exam.
		expect(ranges[1]).toEqual({ date: '2025-10-06', endDate: '2025-10-12' });
		expect(ranges[3]).toEqual({ date: '2025-11-10', endDate: '2025-11-16' });
		expect(ranges[5]).toEqual({ date: '2026-01-12', endDate: '2026-01-18' });
	});

	it('takes odd units from the median week of each term window', () => {
		const ranges = planUnitQuizRanges({
			term: 'S1',
			semesterStart: '2025-09-02',
			examStarts: ['2025-09-12'],
			meetings: [...meetings],
			events: [],
			fallbackEnd: '2025-10-31'
		});
		// Four Tue/Thu occurrences 09-02..09-11: lower median 09-04 lands in
		// Mon 09-01 … Fri 09-05.
		expect(ranges[0]).toEqual({ date: '2025-09-01', endDate: '2025-09-05' });
	});

	it('falls back to 7-day ranges stepping back from the window end', () => {
		const ranges = planUnitQuizRanges({
			term: 'S1',
			semesterStart: '2025-08-31',
			examStarts: [],
			meetings: [],
			events: [],
			fallbackEnd: '2025-10-31'
		});
		expect(ranges).toHaveLength(6);
		expect(ranges[0]).toEqual({ date: '2025-10-25', endDate: '2025-10-31' });
		expect(ranges[1]).toEqual({ date: '2025-10-18', endDate: '2025-10-24' });
		for (const range of ranges) {
			// Every generated range spans at least one school week (#214).
			expect(range.endDate >= range.date).toBe(true);
		}
	});
});
