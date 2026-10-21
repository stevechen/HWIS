import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import TeacherScheduleTable from '$lib/components/esl/TeacherScheduleTable.svelte';
import type { ScheduleDayRow } from '$convex/shared/esl';

const SEMESTER_START = '2025-09-01';

/** Renders the table the way `/esl/schedule` does, with one week of rows. */
function renderTable(rows: ScheduleDayRow[], overrides: Record<string, unknown> = {}) {
	return render(TeacherScheduleTable, {
		props: {
			rows,
			classNames: CLASS_NAMES,
			eventNotes: EVENT_NOTES,
			downloadName: 'test',
			semesterStart: SEMESTER_START,
			...overrides
		}
	});
}

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
				type: 'reminder',
				reminderKind: 'workbook_check',
				isBanner: false,
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
		renderTable(MOCK_ROWS);

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
		renderTable(MOCK_ROWS);

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
		renderTable(MOCK_ROWS);

		await expect.element(page.getByText('Class')).toBeInTheDocument();
		// Dues collapse onto the description as titles; the window rides a badge chip.
		const dueDescCell = page
			.getByTestId('esl-schedule.description-cell')
			.filter({ hasText: 'Workbook check' });
		await expect.element(dueDescCell).toMatchTextContent('Workbook check');
		await expect.element(page.getByText('due window 2025-09-01–2025-09-03')).toBeInTheDocument();
		await expect.element(page.getByText('🎉 Off — Moon Festival')).toBeInTheDocument();
		await expect.element(page.getByText("No class — Sport's Day")).toBeInTheDocument();
		await expect.element(page.getByText('Late start')).toBeInTheDocument();
		await expect.element(page.getByText('Oral Exam')).toBeInTheDocument();
		// Check exam row description in description cell specifically: canonical label
		const examDescCell = page
			.getByTestId('esl-schedule.description-cell')
			.filter({ hasText: 'Final Exam' });
		await expect.element(examDescCell).toMatchTextContent('Final Exam');
	});

	it('renders note column with event notes', async () => {
		renderTable(MOCK_ROWS);

		// Check note cells directly
		const offNoteCell = page
			.getByTestId('esl-schedule.note-cell')
			.filter({ hasText: 'BBQ logistics' });
		await expect.element(offNoteCell).toMatchTextContent('BBQ logistics');

		const noClassNoteCell = page
			.getByTestId('esl-schedule.note-cell')
			.filter({ hasText: 'Bring water' });
		await expect.element(noClassNoteCell).toMatchTextContent('Bring water');
	});

	it('applies correct row styling for statuses', async () => {
		renderTable(MOCK_ROWS);

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
		renderTable(MOCK_ROWS);

		await expect
			.element(page.getByRole('button', { name: /download schedule as csv/i }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /copy schedule/i })).toBeInTheDocument();
	});

	it('includes TSV payload in template element', async () => {
		renderTable(MOCK_ROWS);

		const payload = page.getByTestId('esl-schedule.tsv').element() as HTMLTemplateElement;
		const tsv = payload.content.textContent ?? '';
		expect(tsv).toContain('#\tDate\tDescription\tNote');
		// Countdown column carries remaining counts, blank on off / no-class / exam rows
		expect(tsv).toContain('3\t2025-09-01\tClass\t');
		expect(tsv).toContain('\t2025-09-12\tFinal Exam\t');
		expect(tsv).not.toContain('Class 1/4 to Midterm exam');
		// TSV matches display: dues titles in the description, badges in brackets
		expect(tsv).toContain('Workbook check (due window 2025-09-01–2025-09-03)');
		expect(tsv).toContain('BBQ logistics');
		expect(tsv).toContain('Bring water');
	});

	it('names the downloaded file from the download name', async () => {
		renderTable(MOCK_ROWS, { downloadName: 'S1 2025-2026 G7 Basic 1 CLIL schedule' });

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
/**
 * Reminder rendering (#224): a due collapses once per week and rides the week
 * row as a banner, so three reminder rows become one decision. Only dues that
 * opted out of the banner (`isBanner: false`) stay day chips.
 */
describe('TeacherScheduleTable reminders (#224)', () => {
	const BANNER_ROWS: ScheduleDayRow[] = [
		MOCK_ROWS[0],
		MOCK_ROWS[1],
		MOCK_ROWS[2],
		{
			date: '2025-09-08',
			weekday: 'Monday',
			classId: 'class_clil',
			type: 'CLIL',
			cohortGrade: 7,
			period: 1,
			status: 'teaching',
			cause: null,
			badges: [],
			dues: [
				{
					title: 'Passport 1 due',
					type: 'reminder',
					reminderKind: 'passport',
					isBanner: true,
					windowStart: '2025-09-08',
					windowEnd: '2025-09-10'
				}
			],
			count: null
		}
	];

	it('renders a banner due as a week row, not a day chip', async () => {
		renderTable(BANNER_ROWS);

		// The first school week carries no banner row at all.
		await expect.element(page.getByTestId('esl-schedule.banner-week').first()).toBeInTheDocument();
		const weekRows = page.getByTestId('esl-schedule.banner-week').all();
		expect(weekRows).toHaveLength(1);
		await expect.element(weekRows[0]).toMatchTextContent('Week 2');
		await expect.element(weekRows[0]).toMatchTextContent('Passport 1 due · 09/08–09/10');
		await expect
			.element(page.getByTestId('esl-schedule.banner').filter({ hasText: 'Passport 1 due' }))
			.toBeInTheDocument();
	});

	it('keeps the due off the day row it collapsed onto', async () => {
		renderTable(BANNER_ROWS);

		const monday = page.getByTestId('esl-schedule.row').filter({ hasText: '2025-09-08' });
		await expect.element(monday).toMatchTextContent('Class');
		await expect.element(monday).not.toMatchTextContent('Passport 1 due');
		await expect.element(monday.getByTestId('esl-schedule.badge')).not.toBeInTheDocument();
	});

	it('keeps a chip due on its own day row with the window badge', async () => {
		renderTable(MOCK_ROWS);

		const wednesday = page.getByTestId('esl-schedule.row').filter({ hasText: '2025-09-03' });
		await expect.element(wednesday).toMatchTextContent('Workbook check');
		await expect
			.element(page.getByTestId('esl-schedule.badge').filter({ hasText: 'due window' }))
			.toBeInTheDocument();
	});

	it('greys a g9 mock day row with its cause and no countdown', async () => {
		renderTable([
			{
				date: '2025-09-08',
				weekday: 'Monday',
				classId: 'class_g9',
				type: 'G9',
				cohortGrade: 9,
				period: 1,
				status: 'g9_mock',
				cause: 'G9 Mock Exam',
				badges: [],
				dues: [],
				count: null
			},
			{
				date: '2025-09-09',
				weekday: 'Tuesday',
				classId: 'class_g9',
				type: 'G9',
				cohortGrade: 9,
				period: 2,
				status: 'g9_mock',
				cause: 'G9 Mock Exam',
				badges: [],
				dues: [],
				count: null
			}
		]);

		const rows = page.getByTestId('esl-schedule.row').all();
		const mocks = rows.filter((row) => row.element().textContent?.includes('G9 Mock Exam'));
		expect(mocks).toHaveLength(2);
		for (const mock of mocks) {
			await expect.element(mock).toMatchTextContent(/09-0[89]/);
			await expect.element(mock).toHaveClass(/text-gray-400/);
		}
		const countdowns = page.getByTestId('esl-schedule.countdown-cell').all();
		expect(countdowns.map((cell) => cell.element().textContent?.trim())).toEqual(['', '']);
	});

	it('greys the pre-P3 start-day meetings with the Start at P3 cause', async () => {
		renderTable([
			{
				date: '2025-09-01',
				weekday: 'Monday',
				classId: 'class_clil',
				type: 'CLIL',
				cohortGrade: 7,
				period: 1,
				status: 'no_class',
				cause: 'Start at P3',
				badges: [],
				dues: [],
				count: null
			},
			{
				date: '2025-09-01',
				weekday: 'Monday',
				classId: 'class_clil',
				type: 'CLIL',
				cohortGrade: 7,
				period: 3,
				status: 'teaching',
				cause: null,
				badges: [],
				dues: [],
				count: null
			}
		]);

		const rows = page.getByTestId('esl-schedule.row').all();
		const greyed = rows.filter((row) => row.element().textContent?.includes('Start at P3'));
		expect(greyed).toHaveLength(1);
		await expect.element(greyed[0]).toHaveClass(/text-gray-400/);
		await expect.element(greyed[0]).toMatchTextContent('No class — Start at P3');
		const teaching = rows.find((row) => row.element().textContent?.includes('Class'));
		expect(teaching).toBeDefined();
		await expect.element(teaching!).toMatchTextContent('Class');
		await expect.element(teaching!).not.toMatchTextContent('Start at P3');
	});
});
