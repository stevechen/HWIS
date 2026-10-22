import { describe, it, expect } from 'vite-plus/test';
import {
	buildPreviewSections,
	formatPreviewDateRange,
	formatSectionRange,
	formatShortDate
} from '$lib/components/esl/wizard/wizard-blocks';
import type { PreviewRow } from '$lib/components/esl/wizard/wizard-save';

const EXAMS = [
	{ label: 'Exam 1', dates: ['2026-10-05', '2026-10-06'] },
	{ label: 'Exam 2', dates: ['2026-11-02', '2026-11-03'] },
	{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
];

function row(
	overrides: Partial<PreviewRow> & Pick<PreviewRow, 'key' | 'date' | 'title'>
): PreviewRow {
	return {
		type: 'no_class',
		target: 'all',
		source: 'step4',
		editable: true,
		...overrides
	};
}

const ROWS: PreviewRow[] = [
	row({ key: 'start', title: 'Start of school', date: '2026-08-31', type: 'start_school' }),
	row({ key: 'holiday', title: 'National Day', date: '2026-10-01', type: 'no_school' }),
	row({ key: 'exam1', title: 'Exam 1', date: '2026-10-05', endDate: '2026-10-06', type: 'exam' }),
	row({ key: 'sports', title: 'Sports Day', date: '2026-10-07' }),
	row({ key: 'quiz1', title: 'Quiz 1', date: '2026-10-19', endDate: '2026-10-21' }),
	row({ key: 'exam2', title: 'Exam 2', date: '2026-11-02', endDate: '2026-11-03', type: 'exam' }),
	row({ key: 'bbb', title: 'BBB', date: '2026-11-10' }),
	row({ key: 'aaa', title: 'AAA', date: '2026-11-10' }),
	row({ key: 'final', title: 'Final', date: '2027-01-18', endDate: '2027-01-20', type: 'exam' }),
	row({ key: 'tail', title: 'Wrap-up', date: '2027-01-21' })
];

describe('buildPreviewSections', () => {
	it('orders sections by block, with no exam sections of their own', () => {
		const { aligned, sections } = buildPreviewSections(ROWS, EXAMS, '2026-08-31', '2027-01-25');
		expect(aligned).toBe(true);
		expect(sections.map((section) => section.key)).toEqual([
			'block-1',
			'block-2',
			'block-3',
			'after-final'
		]);
	});

	it('assigns every event by date, exams included in the block they close', () => {
		const { sections } = buildPreviewSections(ROWS, EXAMS, '2026-08-31', '2027-01-25');
		const byKey = new Map(
			sections.map((section) => [section.key, section.events.map((e) => e.key)])
		);
		// Start of school, a holiday and Exam 1 all land in Block 1.
		expect(byKey.get('block-1')).toEqual(['start', 'holiday', 'exam1']);
		// Exam 2 closes Block 2.
		expect(byKey.get('block-2')).toEqual(['sports', 'quiz1', 'exam2']);
		// Same date keeps the builder's order (BBB before AAA here).
		expect(byKey.get('block-3')).toEqual(['bbb', 'aaa', 'final']);
		expect(byKey.get('after-final')).toEqual(['tail']);
	});

	it('keeps empty blocks but drops an empty tail', () => {
		const { sections } = buildPreviewSections([], EXAMS, '2026-08-31', '2027-01-25');
		expect(sections.map((section) => section.key)).toEqual(['block-1', 'block-2', 'block-3']);
		expect(sections.every((section) => section.events.length === 0)).toBe(true);
		expect(sections[0]?.label).toBe('Block 1');
		// Block 1 closes on Exam 1's last day.
		expect(formatSectionRange(sections[0]!)).toBe('8/31 – 10/6');
	});

	it('groups range events by their start date', () => {
		const banner = row({
			key: 'banner',
			title: 'Banner',
			date: '2026-10-20',
			endDate: '2026-12-01',
			type: 'reminder'
		});
		const { sections } = buildPreviewSections([...ROWS, banner], EXAMS, '2026-08-31', '2027-01-25');
		const block2 = sections.find((section) => section.key === 'block-2');
		expect(block2?.events.map((event) => event.key)).toContain('banner');
	});

	it('puts dates outside every window in a trailing Other section', () => {
		const outside = row({ key: 'outside', title: 'Off-term', date: '2027-02-01' });
		const { sections } = buildPreviewSections(
			[...ROWS, outside],
			EXAMS,
			'2026-08-31',
			'2027-01-25'
		);
		const last = sections[sections.length - 1];
		expect(last?.key).toBe('other');
		expect(last?.events.map((event) => event.key)).toEqual(['outside']);
	});

	it('falls back to a flat date sort when exam anchors are missing', () => {
		const { aligned, sections } = buildPreviewSections(
			ROWS,
			EXAMS.filter((exam) => exam.label !== 'Final'),
			'2026-08-31',
			'2027-01-25'
		);
		expect(aligned).toBe(false);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.kind).toBe('flat');
		expect(sections[0]?.events.map((event) => event.date)).toEqual([
			'2026-08-31',
			'2026-10-01',
			'2026-10-05',
			'2026-10-07',
			'2026-10-19',
			'2026-11-02',
			'2026-11-10',
			'2026-11-10',
			'2027-01-18',
			'2027-01-21'
		]);
	});
});

describe('short date formatting', () => {
	it('drops the weekday and leading zeroes', () => {
		expect(formatShortDate('2026-10-05')).toBe('10/5');
		expect(formatPreviewDateRange('2026-10-05', '2026-10-06')).toBe('10/5–10/6');
		expect(formatPreviewDateRange('2026-10-05', '2026-10-05')).toBe('10/5');
		expect(formatShortDate('')).toBe('');
	});
});
