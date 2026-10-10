import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';
import { selectOption } from '../../lib/select';
import { buildViewerSession } from '../../mocks/route-mocks';
import { useViewer } from '$lib/viewer.svelte';
import type { ScheduleDayRow } from '$convex/shared/esl';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: undefined, isLoading: true, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true }))
}));

import SchedulePage from '$src/routes/esl/schedule/+page.svelte';

const SEMESTERS = [
	{
		_id: 'sem_s1',
		year: '2025-2026',
		term: 'S1',
		startDate: '2025-09-01',
		derivedEnd: '2025-09-12'
	}
];

const CLASSES = [
	{
		_id: 'class_clil',
		name: 'G7 Basic 1 CLIL',
		type: 'CLIL'
	},
	{
		_id: 'class_comm',
		name: 'G7 Basic 1 Comm',
		type: 'Comm'
	}
];

const EVENTS = [
	{
		_id: 'event_off',
		type: 'off',
		label: 'Moon Festival',
		target: 'all',
		date: '2025-09-05',
		note: 'BBQ logistics'
	},
	{
		_id: 'event_noclass',
		type: 'no_class',
		label: "Sport's Day",
		target: 'all',
		date: '2025-09-08',
		note: 'Bring water'
	}
];

/** The teacher's joined day rows, one slice per acceptance criterion. */
const DAY_ROWS: ScheduleDayRow[] = [
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
		date: '2025-09-10',
		weekday: 'Wednesday',
		classId: 'class_comm',
		type: 'Comm',
		cohortGrade: 7,
		period: 1,
		status: 'partial',
		cause: 'Late start',
		badges: ['out-of-window P1 (window from P2)'],
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

/** Routes each `useQuery` call to canned data by its Convex function name. */
function mockQueries(data: Record<string, unknown>) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const value = data[getFunctionName(reference as never)];
		return { data: value, isLoading: false, error: null };
	}) as never);
}

function withSchedule(
	overrides: {
		semesters?: unknown[];
		rows?: ScheduleDayRow[];
		classes?: unknown[];
		events?: unknown[];
	} = {}
) {
	mockQueries({
		'esl/semesters:list': overrides.semesters ?? SEMESTERS,
		'esl/schedule:teacherDays': overrides.rows ?? DAY_ROWS,
		'esl/classes:listByTeacher': overrides.classes ?? CLASSES,
		'esl/events:listBySemester': overrides.events ?? EVENTS
	});
}

describe('ESL teacher schedule list page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useViewer).mockReturnValue(
			buildViewerSession({ role: 'teacher', departmentRoles: { esl: 'teacher' } })
		);
		withSchedule();
	});

	it('renders the chronological table with countdown, date, weekday, description, and note columns', async () => {
		render(SchedulePage);

		await expect
			.element(page.getByRole('heading', { name: 'My Semester Schedule' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('columnheader', { name: 'Countdown' })).toBeInTheDocument();
		await expect.element(page.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
		await expect.element(page.getByRole('columnheader', { name: 'Day' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('columnheader', { name: 'Description' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('columnheader', { name: 'Note' })).toBeInTheDocument();
	});

	it('shows per-term count-ups on teaching rows toward the term exam', async () => {
		render(SchedulePage);

		await expect.element(page.getByText('Class 1/4 to Midterm exam')).toBeInTheDocument();
		await expect.element(page.getByText('Class 2/4 to Midterm exam')).toBeInTheDocument();
	});

	it('collapses dues onto the latest eligible day with a window badge, exactly once', async () => {
		render(SchedulePage);

		await expect.element(page.getByText('Workbook check')).toBeInTheDocument();
		await expect.element(page.getByText('due window 2025-09-01–2025-09-03')).toBeInTheDocument();
		const rows = page.getByTestId('esl-schedule.row').all();
		const matching = rows.filter(
			(row) => row.element().textContent?.includes('Workbook check') ?? false
		);
		expect(matching).toHaveLength(1);
	});

	it('greys the off day with its cause and a celebrating mark', async () => {
		render(SchedulePage);

		const rows = page.getByTestId('esl-schedule.row').all();
		const off = rows.find((row) => row.element().textContent?.includes('Moon Festival'));
		expect(off).toBeDefined();
		await expect.element(off!).toHaveTextContent(/Moon Festival/);
		await expect.element(off!).toHaveTextContent(/🎉/);
		await expect.element(off!).toHaveClass(/text-gray-400/);
	});

	it('greys the no-class day with its cause while keeping the meeting row and period', async () => {
		render(SchedulePage);

		await selectOption(page.getByTestId('esl-schedule.class'), 'class_comm');

		const rows = page.getByTestId('esl-schedule.row').all();
		const noClass = rows.find((row) => row.element().textContent?.includes("Sport's Day"));
		expect(noClass).toBeDefined();
		await expect.element(noClass!).toHaveTextContent(/Sport's Day/);
		await expect.element(noClass!).toHaveTextContent(/P5/);
		await expect.element(noClass!).toHaveClass(/text-gray-400/);
	});

	it('renders the exam row red as a plain Exam row with no class count-up', async () => {
		render(SchedulePage);

		const rows = page.getByTestId('esl-schedule.row').all();
		const exam = rows.find((row) => row.element().textContent?.includes('2025-09-12'));
		expect(exam).toBeDefined();
		await expect.element(exam!).toHaveTextContent(/Midterm exam/);
		await expect.element(exam!).toHaveClass(/text-red-500/);
		await expect.element(page.getByText('Class 1/1 to Midterm exam')).not.toBeInTheDocument();
	});

	it('shows each class partial meeting on its own view, badge riding with the Comm one', async () => {
		render(SchedulePage);

		await expect.element(page.getByText('G7 Basic 1 CLIL P2 · Late start')).toBeInTheDocument();
		await expect.element(page.getByText('out-of-window P1 (window from P2)')).not.toBeInTheDocument();
		await selectOption(page.getByTestId('esl-schedule.class'), 'class_comm');

		await expect.element(page.getByText('G7 Basic 1 Comm P1 · Late start')).toBeInTheDocument();
		await expect.element(page.getByText('out-of-window P1 (window from P2)')).toBeInTheDocument();
	});

	it('marks the oral-exam meeting with its badge', async () => {
		render(SchedulePage);

		await selectOption(page.getByTestId('esl-schedule.class'), 'class_comm');

		await expect.element(page.getByText('oral ahead of Midterm exam')).toBeInTheDocument();
	});

	it('shows the admin event note inline in the note column', async () => {
		render(SchedulePage);

		await expect.element(page.getByText('BBQ logistics')).toBeInTheDocument();
	});

	it('never surfaces an editable teacher-note field', async () => {
		render(SchedulePage);

		await expect.element(page.getByTestId('esl-schedule.row').first()).toBeInTheDocument();
		await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
	});

	it('keeps CSV download and copy affordances with the TSV payload', async () => {
		render(SchedulePage);

		await expect
			.element(page.getByRole('button', { name: /download schedule as csv/i }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /copy schedule/i })).toBeInTheDocument();
		const payload = page.getByTestId('esl-schedule.tsv').element() as HTMLTemplateElement;
		const tsv = payload.content.textContent ?? '';
		expect(tsv).toContain('#\tDate\tDescription\tNote');
		expect(tsv).toContain('Workbook check');
	});

	it('shows one class at a time behind the class dropdown, defaulting to the first', async () => {
		render(SchedulePage);

		await expect.element(page.getByText('G7 Basic 1 CLIL P1')).toBeInTheDocument();
		await expect.element(page.getByText('G7 Basic 1 Comm P1 · Late start')).not.toBeInTheDocument();
		await selectOption(page.getByTestId('esl-schedule.class'), 'class_comm');

		await expect.element(page.getByText('G7 Basic 1 CLIL P1')).not.toBeInTheDocument();
		await expect.element(page.getByText('G7 Basic 1 Comm P1 · Late start')).toBeInTheDocument();
	});

	it('links through to the per-class calendar view', async () => {
		render(SchedulePage);

		const link = page.getByRole('link', { name: 'Open the calendar view' });
		await expect.element(link).toBeInTheDocument();
		expect(link.element().getAttribute('href')).toBe('/esl/schedule/calendar');
	});

	it('shows a finals-TBD banner while the semester has no derived end', async () => {
		withSchedule({
			semesters: [
				{ _id: 'sem_s1', year: '2025-2026', term: 'S1', startDate: '2025-09-01', derivedEnd: null }
			]
		});
		render(SchedulePage);

		await expect.element(page.getByText(/final exams TBD/i)).toBeInTheDocument();
	});

	it('prompts for a semester when none exist yet', async () => {
		withSchedule({ semesters: [] });
		render(SchedulePage);

		await expect.element(page.getByTestId('esl-schedule.empty')).toBeInTheDocument();
	});
});
