import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ScheduleDayRow } from '$convex/shared/esl';
import TeacherCalendar from '$src/routes/esl/schedule/calendar/TeacherCalendar.svelte';
import { buildCalendarFragments } from '$src/routes/esl/schedule/calendar/calendar-weeks';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

const CLASSES = [
	{
		id: 'class_clil',
		name: 'G7 Elementary 1 CLIL',
		short: 'G7 Ele 1',
		type: 'CLIL',
		room: 'ESL C',
		headcount: 25
	},
	{
		id: 'class_comm',
		name: 'G7 Elementary 1 Comm',
		short: 'G7 Ele 1',
		type: 'Comm',
		room: 'ESL D',
		headcount: 24
	}
];

function row(overrides: Partial<ScheduleDayRow> & { date: string }): ScheduleDayRow {
	return {
		weekday: 'Monday',
		classId: 'class_clil',
		type: 'CLIL',
		cohortGrade: 7,
		period: 6,
		status: 'teaching',
		cause: null,
		badges: [],
		dues: [],
		count: null,
		...overrides
	} as ScheduleDayRow;
}

/**
 * Two school weeks plus a month-crossing pair, as independent literals (not
 * computed the way the component does): week 1 holds Mon/Wed/Fri meetings,
 * week 2 holds the collapsed due plus an exam, week 5 straddles Sep–Oct.
 */
const ROWS: ScheduleDayRow[] = [
	row({
		date: '2025-09-01',
		weekday: 'Monday',
		count: { position: 1, total: 5, label: 'Exam 1' }
	}),
	row({
		date: '2025-09-03',
		weekday: 'Wednesday',
		period: 3,
		count: { position: 2, total: 5, label: 'Exam 1' }
	}),
	row({
		date: '2025-09-05',
		weekday: 'Friday',
		period: 4,
		status: 'off',
		cause: 'Moon Festival'
	}),
	row({
		date: '2025-09-08',
		weekday: 'Monday',
		count: { position: 3, total: 5, label: 'Exam 1' },
		badges: ['due window 2025-09-01–2025-09-08'],
		dues: [
			{
				label: 'Passport 1 due',
				type: 'task_due',
				windowStart: '2025-09-01',
				windowEnd: '2025-09-08'
			}
		]
	}),
	row({
		date: '2025-09-10',
		weekday: 'Wednesday',
		period: 3,
		status: 'exam',
		cause: 'Exam 1',
		count: { position: 1, total: 1, label: 'Exam 1' }
	}),
	row({
		date: '2025-09-29',
		weekday: 'Monday',
		count: { position: 4, total: 5, label: 'Exam 1' }
	}),
	row({ date: '2025-10-01', weekday: 'Wednesday', period: 3 }),
	// A later week starting fresh in November: the previous row ends in
	// October, so the November strip renders between the rows.
	row({ date: '2025-11-04', weekday: 'Tuesday', period: 5 })
];

/** Wednesday 2025-09-03: Monday is past, Friday is next. */
const TODAY = '2025-09-03';

function renderCalendar(overrides: Record<string, unknown> = {}) {
	const { fragments, nextDate } = buildCalendarFragments({
		rows: ROWS,
		semesterStart: '2025-08-31',
		today: TODAY
	});
	const onSelectClass = vi.fn();
	const onSaveNote = vi.fn();
	render(TeacherCalendar, {
		props: {
			classes: CLASSES,
			selectedClassId: 'class_clil',
			semesterLabel: 'S1 2025-2026',
			today: TODAY,
			fragments,
			nextDate,
			notes: { '2025-09-01': 'Finished U1 L3.' },
			onSelectClass,
			onSaveNote,
			...overrides
		}
	});
	return { onSelectClass, onSaveNote };
}

describe('teacher calendar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
	});

	it('lands on the current week on mount', async () => {
		renderCalendar();

		await expect.element(page.getByTestId('teacher-calendar.week-1')).toBeInTheDocument();
		expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
	});

	it('titles the class with headcount and room readouts', async () => {
		renderCalendar();

		await expect.element(page.getByRole('heading', { name: /G7 Ele 1 CLIL/ })).toBeInTheDocument();
		await expect.element(page.getByText('25', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('ESL C', { exact: true })).toBeInTheDocument();
	});

	it('opens the ellipsis class menu and switches class on choice', async () => {
		const { onSelectClass } = renderCalendar();

		await page.getByRole('button', { name: 'Choose class' }).click();
		await expect.element(page.getByRole('menu', { name: 'Classes' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('menuitemradio', { name: /G7 Ele 1 Comm/ }))
			.toBeInTheDocument();

		await page.getByRole('menuitemradio', { name: /G7 Ele 1 Comm/ }).click();
		expect(onSelectClass).toHaveBeenCalledWith('class_comm');
	});

	it('renders one card per meeting date with slash dates and weekdays', async () => {
		renderCalendar();

		await expect.element(page.getByTestId('teacher-calendar.card-2025-09-01')).toBeInTheDocument();
		await expect.element(page.getByTestId('teacher-calendar.card-2025-09-10')).toBeInTheDocument();
		await expect.element(page.getByText('9/01 Mon')).toBeInTheDocument();
		await expect.element(page.getByText('9/10 Wed')).toBeInTheDocument();
	});

	it('greys cancelled meetings with their cause', async () => {
		renderCalendar();

		const card = page.getByTestId('teacher-calendar.card-2025-09-05');
		await expect.element(card.getByText('🎉 Off')).toBeInTheDocument();
		await expect.element(card.getByText('Moon Festival')).toBeInTheDocument();
	});

	it('right-aligns Class k/n count-ups on teaching cards, none on exams', async () => {
		renderCalendar();

		await expect.element(page.getByText('Class 1/5 to Exam 1')).toBeInTheDocument();
		const examCard = page.getByTestId('teacher-calendar.card-2025-09-10');
		await expect.element(examCard.getByText('Exam', { exact: true })).toBeInTheDocument();
		await expect.element(examCard.getByText('Class 1/1 to Exam 1')).not.toBeInTheDocument();
	});

	it('marks oral-exam meetings and keeps their count-up', async () => {
		const oralRows = [
			row({
				date: '2025-09-08',
				weekday: 'Monday',
				status: 'oral_exam',
				cause: 'Oral exam ahead of Exam 1',
				badges: ['oral ahead of Exam 1'],
				count: { position: 3, total: 5, label: 'Exam 1' }
			})
		];
		const { fragments, nextDate } = buildCalendarFragments({
			rows: oralRows,
			semesterStart: '2025-08-31',
			today: TODAY
		});
		render(TeacherCalendar, {
			props: {
				classes: CLASSES,
				selectedClassId: 'class_clil',
				semesterLabel: 'S1 2025-2026',
				today: TODAY,
				fragments,
				nextDate,
				notes: {},
				onSelectClass: vi.fn(),
				onSaveNote: vi.fn()
			}
		});

		const card = page.getByTestId('teacher-calendar.card-2025-09-08');
		await expect.element(card.getByText('Oral Exam', { exact: true })).toBeInTheDocument();
		await expect.element(card.getByText('Class 3/5 to Exam 1')).toBeInTheDocument();
	});

	it('spans range banners across the week row with the window', async () => {
		renderCalendar();

		await expect.element(page.getByText(/Passport 1 due/)).toBeInTheDocument();
		await expect.element(page.getByText(/9\/01.*9\/08/)).toBeInTheDocument();
	});

	it('marks Today and Next while hatching past cards', async () => {
		renderCalendar();

		const todayCard = page.getByTestId('teacher-calendar.card-2025-09-03');
		await expect.element(todayCard.getByText('● Today')).toBeInTheDocument();
		const nextCard = page.getByTestId('teacher-calendar.card-2025-09-05');
		await expect.element(nextCard.getByText('Next →')).toBeInTheDocument();
		await expect.element(page.getByTestId('teacher-calendar.past-2025-09-01')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('teacher-calendar.past-2025-09-03'))
			.not.toBeInTheDocument();
	});

	it('shows a month strip between rows and a divider inside straddling weeks', async () => {
		renderCalendar();

		await expect.element(page.getByText('November', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByTestId('teacher-calendar.card-2025-10-01')).toBeInTheDocument();
	});

	it('keeps a note box on every card, filled or empty', async () => {
		renderCalendar();

		await expect.element(page.getByLabelText(/Note for 2025-09-01/)).toHaveValue('Finished U1 L3.');
		await expect.element(page.getByLabelText(/Note for 2025-09-05/)).toBeInTheDocument();
	});

	it('saves an edited note through the save seam', async () => {
		const { onSaveNote } = renderCalendar();

		const box = page.getByLabelText('Note for 2025-09-03');
		await box.fill('Start L4, bring cards.');
		// Leaving the box blurs it, which saves through the seam.
		await page.getByRole('button', { name: '● Today' }).click();
		await expect
			.element(page.getByLabelText('Note for 2025-09-03'))
			.toHaveValue('Start L4, bring cards.');
		expect(onSaveNote).toHaveBeenCalledWith('2025-09-03', 'Start L4, bring cards.');
	});

	it('returns to the current week from the Today button', async () => {
		renderCalendar();

		vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
		await page.getByRole('button', { name: '● Today' }).click();
		expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
	});

	it('degrades to empty boxes when no notes loaded yet', async () => {
		renderCalendar({ notes: {} });

		await expect.element(page.getByLabelText('Note for 2025-09-01')).toHaveValue('');
	});
});
