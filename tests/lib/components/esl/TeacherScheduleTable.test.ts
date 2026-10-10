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

	it('renders countdown column with correct values', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'test'
			}
		});

		// Teaching rows show countdown
		await expect.element(page.getByText('Class 1/4 to Midterm exam')).toBeInTheDocument();
		await expect.element(page.getByText('Class 2/4 to Midterm exam')).toBeInTheDocument();
		await expect.element(page.getByText('Class 3/4 to Midterm exam')).toBeInTheDocument();
		await expect.element(page.getByText('Class 4/4 to Midterm exam')).toBeInTheDocument();

		// Off, no_class, exam rows have empty countdown
		const rows = page.getByTestId('schedule-row').all();
		const offRow = rows.find((r) => r.element().textContent?.includes('Moon Festival'));
		expect(offRow).toBeDefined();
		const offCountdown = offRow!.element().querySelector('[data-testid="countdown-cell"]');
		expect(offCountdown?.textContent?.trim()).toBe('');

		const noClassRow = rows.find((r) => r.element().textContent?.includes("Sport's Day"));
		expect(noClassRow).toBeDefined();
		const noClassCountdown = noClassRow!.element().querySelector('[data-testid="countdown-cell"]');
		expect(noClassCountdown?.textContent?.trim()).toBe('');

		const examRow = rows.find((r) => r.element().textContent?.includes('2025-09-12'));
		expect(examRow).toBeDefined();
		const examCountdown = examRow!.element().querySelector('[data-testid="countdown-cell"]');
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
		await expect
			.element(page.getByText('G7 Basic 1 CLIL P2 · due window 2025-09-01–2025-09-03'))
			.toBeInTheDocument();
		await expect.element(page.getByText('Off — Moon Festival 🎉')).toBeInTheDocument();
		await expect.element(page.getByText("G7 Basic 1 Comm P5 · Sport's Day")).toBeInTheDocument();
		await expect.element(page.getByText('G7 Basic 1 CLIL P2 · Late start')).toBeInTheDocument();
		await expect
			.element(page.getByText('G7 Basic 1 Comm P6 · Oral exam ahead of Midterm exam'))
			.toBeInTheDocument();
		// Check exam row description in description cell specifically
		const examRow = page.getByTestId('schedule-row').filter({ hasText: '2025-09-12' });
		const examDescCell = examRow.locator('[data-testid="description-cell"]');
		await expect.element(examDescCell).toHaveTextContent('Midterm exam');
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
		const offRow = page.getByTestId('schedule-row').filter({ hasText: 'Moon Festival' });
		const offNoteCell = offRow.locator('[data-testid="note-cell"]');
		await expect.element(offNoteCell).toHaveTextContent('BBQ logistics');

		const noClassRow = page.getByTestId('schedule-row').filter({ hasText: "Sport's Day" });
		const noClassNoteCell = noClassRow.locator('[data-testid="note-cell"]');
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

		const rows = page.getByTestId('schedule-row').all();

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

		const payload = page.getByTestId('schedule-tsv').element() as HTMLTemplateElement;
		const tsv = payload.content.textContent ?? '';
		expect(tsv).toContain('#\tDate\tDescription\tNote');
		// TSV matches display: description column includes badges, not due labels
		expect(tsv).toContain('due window 2025-09-01–2025-09-03');
		expect(tsv).toContain('BBQ logistics');
		expect(tsv).toContain('Bring water');
	});

	it('filename includes class name', async () => {
		render(TeacherScheduleTable, {
			props: {
				rows: MOCK_ROWS,
				classNames: CLASS_NAMES,
				eventNotes: EVENT_NOTES,
				downloadName: 'S1 2025-2026 G7 Basic 1 CLIL schedule'
			}
		});

		const downloadBtn = page.getByRole('button', { name: /download schedule as csv/i });
		// The download name should be used for the filename
		expect(downloadBtn.element().getAttribute('data-filename')).toContain('G7 Basic 1 CLIL');
	});
});
