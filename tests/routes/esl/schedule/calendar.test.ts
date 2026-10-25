import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
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
		cause: 'Moon Festival',
		// Off rows still carry the previous class day's count; the calendar
		// must hide it since an off day doesn't count toward the exam.
		count: { position: 2, total: 5, label: 'Exam 1' }
	}),
	row({
		date: '2025-09-08',
		weekday: 'Monday',
		count: { position: 3, total: 5, label: 'Exam 1' },
		badges: ['due window 2025-09-01–2025-09-08'],
		dues: [
			{
				title: 'Passport 1 due',
				type: 'reminder',
				reminderKind: 'passport',
				isBanner: true,
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
	const scrollIntoViewMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		scrollIntoViewMock.mockReset();
		vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scrollIntoViewMock);
	});

	it('lands on the current week on mount', async () => {
		renderCalendar();

		await expect.element(page.getByTestId('teacher-calendar.week-1')).toBeInTheDocument();
		expect(scrollIntoViewMock).toHaveBeenCalled();
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

	it('renders one card per meeting date with slash dates (weekdays in header)', async () => {
		renderCalendar();

		await expect.element(page.getByTestId('teacher-calendar.card-2025-09-01')).toBeInTheDocument();
		await expect.element(page.getByTestId('teacher-calendar.card-2025-09-10')).toBeInTheDocument();
		await expect.element(page.getByText('Sep 1', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('10', { exact: true })).toBeInTheDocument();
	});

	it('greys cancelled meetings with their cause', async () => {
		renderCalendar();

		const card = page.getByTestId('teacher-calendar.card-2025-09-05');
		await expect.element(card.getByText('🎉 Off')).toBeInTheDocument();
		// cause is hidden for off days since chip already indicates Off
		await expect.element(card.getByText('Moon Festival')).not.toBeInTheDocument();
		// and the count-up is hidden too: an off day doesn't count toward the exam
		await expect.element(card.getByText('Class 2/5 to Exam 1')).not.toBeInTheDocument();
	});

	it('right-aligns Class k/n count-ups on teaching cards, none on exams', async () => {
		renderCalendar();

		await expect.element(page.getByText('1/5')).toBeInTheDocument();
		const examCard = page.getByTestId('teacher-calendar.card-2025-09-10');
		await expect.element(examCard.getByText('Exam 1', { exact: true })).toBeInTheDocument();
		await expect.element(examCard.getByText('Class 1/1 to Exam 1')).not.toBeInTheDocument();
		// cause is in the chip, not duplicated below
		await expect.element(examCard.getByText('Exam 1', { exact: true })).toBeInTheDocument();
	});

	it('marks oral-exam meetings without count-up', async () => {
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
		await render(TeacherCalendar, {
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
		await expect.element(card.getByText('3/5')).not.toBeInTheDocument();
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

	it('keeps note boxes on teaching cards only — off days have none', async () => {
		renderCalendar();

		await expect.element(page.getByLabelText(/Note for 2025-09-01/)).toHaveValue('Finished U1 L3.');
		await expect.element(page.getByLabelText(/Note for 2025-09-05/)).not.toBeInTheDocument();
	});

	it('drops the note box on no-class days too', async () => {
		const noClassRows = [
			{
				...row({
					date: '2025-09-08',
					count: { position: 3, total: 5, label: 'Exam 1' }
				}),
				status: 'no_class' as const,
				cause: 'Assembly'
			}
		];
		const { fragments, nextDate } = buildCalendarFragments({
			rows: noClassRows,
			semesterStart: '2025-08-31',
			today: TODAY
		});
		await render(TeacherCalendar, {
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

		await expect.element(page.getByLabelText(/Note for 2025-09-08/)).not.toBeInTheDocument();
	});

	it('shows partial days as a No class chip with the note as description', async () => {
		const partialRows = [
			row({
				date: '2025-09-08',
				weekday: 'Monday',
				status: 'partial' as const,
				cause: 'BBQ from 12:00',
				count: { position: 3, total: 5, label: 'Exam 1' }
			})
		];
		const { fragments, nextDate } = buildCalendarFragments({
			rows: partialRows,
			semesterStart: '2025-08-31',
			today: TODAY
		});
		await render(TeacherCalendar, {
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
		await expect.element(card.getByText('No class', { exact: true })).toBeInTheDocument();
		await expect.element(card.getByText('BBQ from 12:00')).toBeInTheDocument();
		// Partial days still teach, so the note box stays.
		await expect.element(page.getByLabelText(/Note for 2025-09-08/)).toBeInTheDocument();
	});

	it('labels every note box with the exact Note… placeholder (#205)', async () => {
		renderCalendar();

		const boxes = page.getByLabelText(/Note for /).all();
		expect(boxes.length).toBeGreaterThan(0);
		for (const box of boxes) {
			await expect.element(box).toHaveAttribute('placeholder', 'Note…');
		}
	});

	it('keeps the always-visible note box on exam cards too', async () => {
		renderCalendar();

		await expect.element(page.getByLabelText('Note for 2025-09-10')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Note for 2025-09-10')).toHaveValue('');
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

		scrollIntoViewMock.mockClear();
		await page.getByRole('button', { name: '● Today' }).click();
		expect(scrollIntoViewMock).toHaveBeenCalled();
	});

	it('degrades to empty boxes when no notes loaded yet', async () => {
		renderCalendar({ notes: {} });

		await expect.element(page.getByLabelText('Note for 2025-09-01')).toHaveValue('');
	});
});
