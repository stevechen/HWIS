import { describe, it, expect } from 'vite-plus/test';
import {
	buildEventNoteMap,
	buildScheduleTsv,
	buildWeekBanners,
	bannerDueLabel,
	classContext,
	countdownText,
	descriptionText,
	eventNoteKey,
	EXAM_LABELS,
	noteText,
	weekIndexOf
} from '$lib/esl-schedule-list';
import { ESL_EXAM_TITLES } from '$convex/shared/esl';
import type { ScheduleDayRow, ScheduleDue } from '$convex/shared/esl';

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

function due(overrides: Partial<ScheduleDue> & { title: string }): ScheduleDue {
	return {
		type: 'reminder',
		reminderKind: 'task',
		isBanner: true,
		windowStart: '2025-09-01',
		windowEnd: '2025-09-03',
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
		// Description no longer includes class name and period
		expect(text).toBe('Class');
		expect(text).not.toContain(' to ');
	});

	it('emits the canonical TSV envelope # Date Description Note', () => {
		const rows = [
			row({ date: '2025-09-01', count: { position: 1, total: 2, label: 'Exam 1' } }),
			row({ status: 'exam', cause: 'Exam 1', count: { position: 1, total: 1, label: 'Exam 1' } })
		];
		const tsv = buildScheduleTsv(rows, CLASS_NAMES, {}, '2025-08-31');
		const lines = tsv.split('\n');
		expect(lines[0]).toBe('#\tDate\tDescription\tNote');
		expect(lines[1]?.split('\t')).toEqual(['1', '2025-09-01', 'Class', '']);
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
		// Description no longer includes class name and period
		expect(descriptionText(inWindow, CLASS_NAMES)).toBe('No class');
		expect(noteText(inWindow, notes)).toBe('Late start');
		const outOfWindow = row({
			date: '2025-09-08',
			status: 'partial',
			cause: 'No class',
			badges: ['out-of-window P1 (window from P2)'],
			outOfWindow: true
		});
		// Out-of-window partial falls back to 'Class'
		expect(descriptionText(outOfWindow, CLASS_NAMES)).toBe('Class');
		expect(descriptionText(outOfWindow, CLASS_NAMES)).not.toContain('No class');
		expect(noteText(outOfWindow, notes)).toBe('Late start');
	});

	it('still exposes the class context helper the calendar reuses', () => {
		expect(classContext(row({}), CLASS_NAMES)).toBe('G7 Basic 1 CLIL P1');
	});
});

/**
 * Reminder rendering (#224): a collapsed due rides the week row as a banner
 * unless the event opted out of the banner, in which case it stays a day chip
 * on the collapse day.
 */
describe('esl-schedule-list week banners (#224)', () => {
	it('numbers school weeks from the semester start', () => {
		expect(weekIndexOf('2025-09-01', '2025-09-01')).toBe(1);
		expect(weekIndexOf('2025-09-05', '2025-09-01')).toBe(1);
		expect(weekIndexOf('2025-09-08', '2025-09-01')).toBe(2);
		expect(weekIndexOf('2025-09-29', '2025-09-01')).toBe(5);
	});

	it('labels a banner with its window, dropping a single-day window', () => {
		expect(
			bannerDueLabel({
				title: 'Passport 1 due',
				windowStart: '2025-09-01',
				windowEnd: '2025-09-08'
			})
		).toBe('Passport 1 due · 09/01–09/08');
		expect(
			bannerDueLabel({
				title: 'Passport check',
				windowStart: '2025-09-05',
				windowEnd: '2025-09-05'
			})
		).toBe('Passport check');
	});

	it('keeps a banner due out of the day-row description, keeps a chip one in it', () => {
		const banner = descriptionText(row({ dues: [due({ title: 'Passport 1 due' })] }), CLASS_NAMES);
		// Banner dues are not shown in day-row description
		expect(banner).toBe('Class');
		const chip = descriptionText(
			row({ dues: [due({ title: 'Passport 1 due', isBanner: false })] }),
			CLASS_NAMES
		);
		// Chip dues are shown in day-row description
		expect(chip).toBe('Passport 1 due');
	});

	it('groups the banner dues of a week under its school-week number', () => {
		const rows = [
			row({ date: '2025-09-01' }),
			row({
				date: '2025-09-05',
				weekday: 'Friday',
				dues: [
					due({ title: 'Recording due', windowStart: '2025-09-02', windowEnd: '2025-09-05' }),
					due({ title: 'Passport 1 due', windowStart: '2025-09-01', windowEnd: '2025-09-05' })
				]
			}),
			// A chip due never becomes a banner.
			row({
				date: '2025-09-08',
				dues: [due({ title: 'Comm survey', isBanner: false, windowStart: '2025-09-08' })]
			})
		];

		const banners = buildWeekBanners(rows, '2025-09-01');

		expect(banners.get(1)).toEqual([
			{
				title: 'Passport 1 due',
				reminderKind: 'task',
				windowStart: '2025-09-01',
				windowEnd: '2025-09-05'
			},
			{
				title: 'Recording due',
				reminderKind: 'task',
				windowStart: '2025-09-02',
				windowEnd: '2025-09-05'
			}
		]);
		// A week whose dues are all chips has no banner entry at all.
		expect(banners.get(2)).toBeUndefined();
	});

	it('banners one due once even when several classes collapse onto the same week', () => {
		const rows = [
			row({ date: '2025-09-05', weekday: 'Friday', dues: [due({ title: 'Passport 1 due' })] }),
			row({
				date: '2025-09-08',
				classId: 'class_comm',
				type: 'Comm',
				dues: [due({ title: 'Passport 1 due' })]
			})
		];

		const banners = buildWeekBanners(rows, '2025-09-01');

		expect(banners.get(1)?.map((banner) => banner.title)).toEqual(['Passport 1 due']);
		expect(banners.get(2)).toBeUndefined();
	});

	it('emits a banner line per week in the TSV payload so a copy keeps the reminder', () => {
		const rows = [
			row({ date: '2025-09-01' }),
			row({
				date: '2025-09-05',
				weekday: 'Friday',
				dues: [due({ title: 'Passport 1 due', windowStart: '2025-09-01', windowEnd: '2025-09-05' })]
			}),
			row({
				date: '2025-09-08',
				dues: [due({ title: 'Passport 2 due', windowStart: '2025-09-08', windowEnd: '2025-09-10' })]
			})
		];

		const tsv = buildScheduleTsv(rows, CLASS_NAMES, {}, '2025-09-01');
		const lines = tsv.split('\n');

		expect(lines[0]).toBe('#\tDate\tDescription\tNote');
		expect(lines[1]).toBe('\t\tWeek 1 · Passport 1 due · 09/01–09/05\t');
		expect(lines[2]).toBe('\t2025-09-01\tClass\t');
		expect(lines[4]).toBe('\t\tWeek 2 · Passport 2 due · 09/08–09/10\t');
	});

	it('emits no banner line when no banner due landed', () => {
		const rows = [row({ date: '2025-09-01' }), row({ date: '2025-09-08' })];
		const tsv = buildScheduleTsv(rows, CLASS_NAMES, {}, '2025-09-01');
		expect(tsv.split('\n')).toHaveLength(3);
	});
});
