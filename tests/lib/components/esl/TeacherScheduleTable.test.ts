import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TeacherScheduleTable from '$lib/components/esl/TeacherScheduleTable.svelte';
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
				title: 'Workbook check',
				type: 'task',
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
		cause: 'Final Exam',
		badges: [],
		dues: [],
		count: { position: 1, total: 1, label: 'Final Exam' }
	}
];

const CLASS_NAMES: Record<string, string> = {
	class_clil: 'G7 Basic 1 CLIL',
	class_comm: 'G7 Basic 1 Comm'
};

// #203 keys event notes by date+title so same-title events do not leak notes.
const EVENT_NOTES: Record<string, string> = {
	'2025-09-05|Moon Festival': 'BBQ logistics',
	"2025-09-08|Sport's Day": 'Bring water'
};

describe('TeacherScheduleTable', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders table with correct headers: #, Date, Description, Note', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'S1 2025-2026 G7 Basic 1 CLIL schedule'
			}
		});

		await expect.element(page.getByRole('columnheader', { name: '#' })).toBeInTheDocument();
		await expect.element(page.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('columnheader', { name: 'Description' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('columnheader', { name: 'Note' })).toBeInTheDocument();
		// Day column should NOT be present
		await expect.element(page.getByRole('columnheader', { name: 'Day' })).not.toBeInTheDocument();
	});

	it('renders countdown column with remaining counts', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'test'
			}
		});

		// No legacy count-up text anywhere in the countdown
		await expect.element(page.getByText('Class 1/4 to Midterm exam')).not.toBeInTheDocument();
		await expect.element(page.getByText('Class 2/4 to Midterm exam')).not.toBeInTheDocument();
		await expect.element(page.getByText('Class 3/4 to Midterm exam')).not.toBeInTheDocument();
		await expect.element(page.getByText('Class 4/4 to Midterm exam')).not.toBeInTheDocument();

		// Teaching rows show remaining classes (total - position), down to 0
		// at the last class before the exam; off, no_class, exam rows are blank.
		await expect.element(page.getByTestId('esl-schedule.row').first()).toBeInTheDocument();
		const cells = page.getByTestId('esl-schedule.countdown-cell').all();
		expect(cells.map((c) => c.element().textContent?.trim())).toEqual([
			'3',
			'2',
			'',
			'',
			'1',
			'0',
			''
		]);

		// Off, no_class, exam rows have empty countdown
		const rows = page.getByTestId('esl-schedule.row').all();
		const offRow = rows.find((r) => r.element().textContent?.includes('Moon Festival'));
		expect(offRow).toBeDefined();
		const offCountdown = offRow!
			.element()
			.querySelector('[data-testid="esl-schedule.countdown-cell"]');
		expect(offCountdown?.textContent?.trim()).toBe('');

		const noClassRow = rows.find((r) => r.element().textContent?.includes("Sport's Day"));
		expect(noClassRow).toBeDefined();
		const noClassCountdown = noClassRow!
			.element()
			.querySelector('[data-testid="esl-schedule.countdown-cell"]');
		expect(noClassCountdown?.textContent?.trim()).toBe('');

		const examRow = rows.find((r) => r.element().textContent?.includes('2025-09-12'));
		expect(examRow).toBeDefined();
		const examCountdown = examRow!
			.element()
			.querySelector('[data-testid="esl-schedule.countdown-cell"]');
		expect(examCountdown?.textContent?.trim()).toBe('');
	});

	it('renders description column with correct content', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'test'
			}
		});

		await expect.element(page.getByText('G7 Basic 1 CLIL P1')).toBeInTheDocument();
		// Dues collapse onto the description as titles; the window rides a badge chip.
		const dueRow = page.getByTestId('esl-schedule.row').filter({ hasText: '2025-09-03' });
		const dueDescCell = dueRow.locator('[data-testid="esl-schedule.description-cell"]');
		await expect.element(dueDescCell).toHaveTextContent('G7 Basic 1 CLIL P2 · Workbook check');
		await expect.element(page.getByText('due window 2025-09-01–2025-09-03')).toBeInTheDocument();
		await expect
			.element(page.getByText('G7 Basic 1 CLIL P3 · 🎉 Off — Moon Festival'))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("G7 Basic 1 Comm P5 · No-class — Sport's Day"))
			.toBeInTheDocument();
		await expect.element(page.getByText('G7 Basic 1 CLIL P2 · Late start')).toBeInTheDocument();
		await expect
			.element(page.getByText('G7 Basic 1 Comm P6 · Oral exam ahead of Midterm exam'))
			.toBeInTheDocument();
		// Check exam row description in description cell specifically: canonical label
		const examRow = page.getByTestId('esl-schedule.row').filter({ hasText: '2025-09-12' });
		const examDescCell = examRow.locator('[data-testid="esl-schedule.description-cell"]');
		await expect.element(examDescCell).toHaveTextContent('Final Exam');
	});

	it('renders note column with event notes', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'test'
			}
		});

		// Check note cells directly
		const offRow = page.getByTestId('esl-schedule.row').filter({ hasText: 'Moon Festival' });
		const offNoteCell = offRow.locator('[data-testid="esl-schedule.note-cell"]');
		await expect.element(offNoteCell).toHaveTextContent('BBQ logistics');

		const noClassRow = page.getByTestId('esl-schedule.row').filter({ hasText: "Sport's Day" });
		const noClassNoteCell = noClassRow.locator('[data-testid="esl-schedule.note-cell"]');
		await expect.element(noClassNoteCell).toHaveTextContent('Bring water');
	});

	it('applies correct row styling for statuses', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'test'
			}
		});

		const rows = page.getByTestId('esl-schedule.row').all();

		// Off row should be greyed with celebration mark
		const offRow = rows.find((r) => r.element().textContent?.includes('Moon Festival'));
		expect(offRow).toBeDefined();
		await expect.element(offRow!).toHaveClass(/text-gray-400/);

		// No-class row should be greyed
		const noClassRow = rows.find((r) => r.element().textContent?.includes("Sport's Day"));
		expect(noClassRow).toBeDefined();
		await expect.element(noClassRow!).toHaveClass(/text-gray-400/);

		// Exam row should be red
		const examRow = rows.find((r) => r.element().textContent?.includes('2025-09-12'));
		expect(examRow).toBeDefined();
		await expect.element(examRow!).toHaveClass(/text-red-500/);
	});

	it('shows download and copy buttons', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'S1 2025-2026 G7 Basic 1 CLIL schedule'
			}
		});

		await expect
			.element(page.getByRole('button', { name: /download schedule as csv/i }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /copy schedule/i })).toBeInTheDocument();
	});

	it('includes TSV payload in template element', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'S1 2025-2026 G7 Basic 1 CLIL schedule'
			}
		});

		const payload = page.getByTestId('esl-schedule.tsv').element() as HTMLTemplateElement;
		const tsv = payload.content.textContent ?? '';
		expect(tsv).toContain('#\tDate\tDescription\tNote');
		// Countdown column carries remaining counts, blank on off / no-class / exam rows
		expect(tsv).toContain('3\t2025-09-01\tG7 Basic 1 CLIL P1\t');
		expect(tsv).toContain('\t2025-09-12\tFinal Exam\t');
		expect(tsv).not.toContain('Class 1/4 to Midterm exam');
		// TSV matches display: dues titles in the description, badges in brackets
		expect(tsv).toContain('G7 Basic 1 CLIL P2 · Workbook check (due window 2025-09-01–2025-09-03)');
		expect(tsv).toContain('BBQ logistics');
		expect(tsv).toContain('Bring water');
	});

	it('names the downloaded file from the download name', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'S1 2025-2026 G7 Basic 1 CLIL schedule'
			}
		});

		await expect
			.element(page.getByRole('button', { name: /download schedule as csv/i }))
			.toBeInTheDocument();

		// The component builds the download anchor on click; capture its filename.
		const downloads: (string | null)[] = [];
		const originalClick = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
			downloads.push(this.getAttribute('download'));
		};
		try {
			(
				page
					.getByRole('button', { name: /download schedule as csv/i })
					.element() as HTMLButtonElement
			).click();
		} finally {
			HTMLAnchorElement.prototype.click = originalClick;
		}

		// The download name should be used for the filename
		expect(downloads).toEqual(['S1 2025-2026 G7 Basic 1 CLIL schedule.csv']);
	});
});
