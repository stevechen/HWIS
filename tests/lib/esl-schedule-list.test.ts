import { describe, it, expect } from 'vitest';
import { countdownText, descriptionText, buildScheduleTsv } from '$lib/esl-schedule-list';
import type { ScheduleDayRow } from '$convex/shared/esl';

const MOCK_ROWS: ScheduleDayRow[] = [
	{
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
		count: { position: 1, total: 4, label: 'Midterm exam' }
	},
	{
		date: '2025-09-03',
		weekday: 'Wednesday',
		classId: 'class_clil',
		type: 'CLIL',
		cohortGrade: 7,
		period: 2,
		status: 'teaching',
		cause: null,
		badges: ['due window 2025-09-01–2025-09-03'],
		dues: [
			{
				label: 'Workbook check',
				type: 'homework_due',
				windowStart: '2025-09-01',
				windowEnd: '2025-09-03'
			}
		],
		count: { position: 2, total: 4, label: 'Midterm exam' }
	},
	{
		date: '2025-09-05',
		weekday: 'Friday',
		classId: 'class_clil',
		type: 'CLIL',
		cohortGrade: 7,
		period: 3,
		status: 'off',
		cause: 'Moon Festival',
		badges: [],
		dues: [],
		count: null
	},
	{
		date: '2025-09-08',
		weekday: 'Monday',
		classId: 'class_comm',
		type: 'Comm',
		cohortGrade: 7,
		period: 5,
		status: 'no_class',
		cause: "Sport's Day",
		badges: [],
		dues: [],
		count: null
	},
	{
		date: '2025-09-10',
		weekday: 'Wednesday',
		classId: 'class_clil',
		type: 'CLIL',
		cohortGrade: 7,
		period: 2,
		status: 'partial',
		cause: 'Late start',
		badges: [],
		dues: [],
		count: { position: 3, total: 4, label: 'Midterm exam' }
	},
	{
		date: '2025-09-11',
		weekday: 'Thursday',
		classId: 'class_comm',
		type: 'Comm',
		cohortGrade: 7,
		period: 6,
		status: 'oral_exam',
		cause: 'Oral exam ahead of Midterm exam',
		badges: ['oral ahead of Midterm exam'],
		dues: [],
		count: { position: 4, total: 4, label: 'Midterm exam' }
	},
	{
		date: '2025-09-12',
		weekday: 'Friday',
		classId: 'class_clil',
		type: 'CLIL',
		cohortGrade: 7,
		period: 3,
		status: 'exam',
		cause: 'Midterm exam',
		badges: [],
		dues: [],
		count: { position: 1, total: 1, label: 'Midterm exam' }
	}
];

const CLASS_NAMES: Record<string, string> = {
	class_clil: 'G7 Basic 1 CLIL',
	class_comm: 'G7 Basic 1 Comm'
};

const EVENT_NOTES: Record<string, string> = {
	'Moon Festival': 'BBQ logistics',
	"Sport's Day": 'Bring water'
};

describe('esl-schedule-list utilities', () => {
	describe('countdownText', () => {
		it('returns formatted countdown for teaching rows', () => {
			const row = MOCK_ROWS[0];
			expect(countdownText(row)).toBe('Class 1/4 to Midterm exam');
		});

		it('returns formatted countdown for partial rows', () => {
			const row = MOCK_ROWS[4];
			expect(countdownText(row)).toBe('Class 3/4 to Midterm exam');
		});

		it('returns formatted countdown for oral_exam rows', () => {
			const row = MOCK_ROWS[5];
			expect(countdownText(row)).toBe('Class 4/4 to Midterm exam');
		});

		it('returns empty string for off rows', () => {
			const row = MOCK_ROWS[2];
			expect(countdownText(row)).toBe('');
		});

		it('returns empty string for no_class rows', () => {
			const row = MOCK_ROWS[3];
			expect(countdownText(row)).toBe('');
		});

		it('returns empty string for exam rows', () => {
			const row = MOCK_ROWS[6];
			expect(countdownText(row)).toBe('');
		});

		it('returns empty string when count is null', () => {
			const row = { ...MOCK_ROWS[0], count: null };
			expect(countdownText(row)).toBe('');
		});
	});

	describe('descriptionText', () => {
		it('returns class name with period for teaching rows', () => {
			const row = MOCK_ROWS[0];
			expect(descriptionText(row, CLASS_NAMES)).toBe('G7 Basic 1 CLIL P1');
		});

		it('includes badges for teaching rows with dues', () => {
			const row = MOCK_ROWS[1];
			expect(descriptionText(row, CLASS_NAMES)).toBe(
				'G7 Basic 1 CLIL P2 · due window 2025-09-01–2025-09-03'
			);
		});

		it('shows off cause with celebration mark', () => {
			const row = MOCK_ROWS[2];
			expect(descriptionText(row, CLASS_NAMES)).toBe('Off — Moon Festival 🎉');
		});

		it('shows no_class cause with period', () => {
			const row = MOCK_ROWS[3];
			expect(descriptionText(row, CLASS_NAMES)).toBe("G7 Basic 1 Comm P5 · Sport's Day");
		});

		it('shows partial cause', () => {
			const row = MOCK_ROWS[4];
			expect(descriptionText(row, CLASS_NAMES)).toBe('G7 Basic 1 CLIL P2 · Late start');
		});

		it('shows oral_exam cause with badge', () => {
			const row = MOCK_ROWS[5];
			expect(descriptionText(row, CLASS_NAMES)).toBe(
				'G7 Basic 1 Comm P6 · Oral exam ahead of Midterm exam'
			);
		});

		it('shows exam cause', () => {
			const row = MOCK_ROWS[6];
			expect(descriptionText(row, CLASS_NAMES)).toBe('Midterm exam');
		});

		it('includes out-of-window badge for partial rows', () => {
			const row: ScheduleDayRow = {
				...MOCK_ROWS[4], // Use partial row as base
				badges: ['out-of-window P1 (window from P2)']
			};
			expect(descriptionText(row, CLASS_NAMES)).toBe(
				'G7 Basic 1 CLIL P2 · Late start · out-of-window P1 (window from P2)'
			);
		});
	});

	describe('buildScheduleTsv', () => {
		it('produces TSV with correct header', () => {
			const tsv = buildScheduleTsv(MOCK_ROWS, CLASS_NAMES, EVENT_NOTES);
			const lines = tsv.trim().split('\n');
			expect(lines[0]).toBe('#\tDate\tDescription\tNote');
		});

		it('includes all rows in TSV', () => {
			const tsv = buildScheduleTsv(MOCK_ROWS, CLASS_NAMES, EVENT_NOTES);
			const lines = tsv.trim().split('\n');
			expect(lines.length).toBe(MOCK_ROWS.length + 1); // header + data rows
		});

		it('includes countdown in first column', () => {
			const tsv = buildScheduleTsv(MOCK_ROWS, CLASS_NAMES, EVENT_NOTES);
			const lines = tsv.trim().split('\n');
			// First data row (teaching)
			expect(lines[1]).toContain('Class 1/4 to Midterm exam');
			// Off row should have empty countdown
			expect(lines[3].split('\t')[0]).toBe('');
			// Exam row should have empty countdown
			expect(lines[7].split('\t')[0]).toBe('');
		});

		it('includes date in second column', () => {
			const tsv = buildScheduleTsv(MOCK_ROWS, CLASS_NAMES, EVENT_NOTES);
			const lines = tsv.trim().split('\n');
			expect(lines[1].split('\t')[1]).toBe('2025-09-01');
			expect(lines[3].split('\t')[1]).toBe('2025-09-05');
		});

		it('includes description in third column', () => {
			const tsv = buildScheduleTsv(MOCK_ROWS, CLASS_NAMES, EVENT_NOTES);
			const lines = tsv.trim().split('\n');
			expect(lines[1].split('\t')[2]).toBe('G7 Basic 1 CLIL P1');
			expect(lines[3].split('\t')[2]).toBe('Off — Moon Festival 🎉');
			expect(lines[4].split('\t')[2]).toContain("Sport's Day");
		});

		it('includes event note in fourth column', () => {
			const tsv = buildScheduleTsv(MOCK_ROWS, CLASS_NAMES, EVENT_NOTES);
			const lines = tsv.trim().split('\n');
			// Off row should have note
			expect(lines[3].split('\t')[3]).toBe('BBQ logistics');
			// No-class row should have note
			expect(lines[4].split('\t')[3]).toBe('Bring water');
			// Teaching row without note should be empty
			expect(lines[1].split('\t')[3]).toBe('');
		});

		it('escapes tabs and newlines in description', () => {
			const rowWithTab: ScheduleDayRow = {
				...MOCK_ROWS[0],
				badges: ['tab\there']
			};
			const tsv = buildScheduleTsv([rowWithTab], CLASS_NAMES, {});
			expect(tsv).not.toContain('\t\there');
		});
	});
});
