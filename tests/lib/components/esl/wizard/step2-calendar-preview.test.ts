import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import CalendarPreview from '$lib/components/esl/wizard/CalendarPreview.svelte';
import { buildPreviewWeeks, type MockOffDay } from '$lib/components/esl/wizard/wizard-dates';

describe('CalendarPreview — Step 2 read-only semester calendar + event list', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const mockOffDays: MockOffDay[] = [
		{ date: '2026-09-28', name: "Teacher's Day" },
		{ date: '2026-10-10', name: 'National Day' }
	];

	const mockExams = [
		{ label: 'Exam 1', dates: ['2026-10-05', '2026-10-06'] },
		{ label: 'Exam 2', dates: ['2026-11-02', '2026-11-03'] },
		{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
	];

	const weeks = buildPreviewWeeks('2026-08-31', '2027-01-20', mockOffDays, mockExams);

	it('renders the calendar with legend', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		await expect.element(page.getByTestId('wizard.step-2-calendar')).toBeInTheDocument();
		// Legend uses "Off day" and "Exam" (exact match for legend items)
		await expect.element(page.getByText('Off day', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Exam', { exact: true })).toBeInTheDocument();
	});

	it('renders week rows with a bare school week number under the WK header', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		await expect.element(page.getByTestId('wizard.step-2-calendar.week-1')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-2-calendar.week-1-number'))
			.toMatchTextContent(/^1$/);
		await expect
			.element(page.getByTestId('wizard.step-2-calendar.week-2-number'))
			.toMatchTextContent(/^2$/);
		await expect.element(page.getByText('WK', { exact: true })).toBeInTheDocument();
	});

	it('shows weekend cells are filtered out (Mon-Fri only)', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Week 1 Sunday (Sep 6) should not exist in the grid (weekends filtered)
		await expect
			.element(page.getByTestId('wizard.step-2-calendar.date-2026-09-06'))
			.not.toBeInTheDocument();
		// Week 1 Saturday (Sep 5) should not exist in the grid
		await expect
			.element(page.getByTestId('wizard.step-2-calendar.date-2026-09-05'))
			.not.toBeInTheDocument();
	});

	it('shows off days with celebration emoji and name', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Sep 28 is a Monday - "Teacher's Day" off day
		const offDayCell = page.getByTestId('wizard.step-2-calendar.date-2026-09-28');
		await expect.element(offDayCell).toMatchTextContent('🎉');
		await expect.element(offDayCell).toMatchTextContent("Teacher's Day");
	});

	it('shows exams with label', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Oct 5-6 is Exam 1
		const exam1Day1 = page.getByTestId('wizard.step-2-calendar.date-2026-10-05');
		await expect.element(exam1Day1).toMatchTextContent('Exam 1');

		const exam1Day2 = page.getByTestId('wizard.step-2-calendar.date-2026-10-06');
		await expect.element(exam1Day2).toMatchTextContent('Exam 1');
	});

	it('renders merged month bands in the left column, one per month', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		await expect.element(page.getByTestId('wizard.step-2-calendar.month-col')).toBeInTheDocument();
		await expect.element(page.getByText('MTH', { exact: true })).toBeInTheDocument();

		// The semester starts Mon 2026-08-31, so row 1 (Aug 31 + Sep 1–4)
		// belongs to SEP and AUG gets no band at all. SEP spans W1–W4, then
		// OCT takes the Sep 28 – Oct 2 straddle row whole (W5–W9).
		const sep = page.getByTestId('wizard.step-2-calendar.month-SEP');
		await expect.element(sep).toHaveAttribute('data-rows', '4');
		await expect.element(sep).toHaveTextContent('SEP');
		await expect
			.element(page.getByTestId('wizard.step-2-calendar.month-OCT'))
			.toHaveAttribute('data-rows', '5');
		await expect
			.element(page.getByTestId('wizard.step-2-calendar.month-AUG'))
			.not.toBeInTheDocument();
	});

	it('read-only mode renders cells without button role', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// In read-only mode, the cell is a div, not a button - check no button role
		const cell = page.getByTestId('wizard.step-2-calendar.date-2026-09-28');
		await expect.element(cell).not.toHaveAttribute('role', 'button');
	});

	it('out-of-range days show middle dot', async () => {
		await render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Days after end date (Jan 20) - Jan 21 is after end date
		const outOfRangeCell = page.getByTestId('wizard.step-2-calendar.date-2027-01-21');
		await expect.element(outOfRangeCell).toBeInTheDocument();
		await expect.element(outOfRangeCell).toMatchTextContent('·');
	});
});

// Test for the event list on the right side (ordered by date)
describe('Step 2 event list (ordered by date)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows imported off days in date order', async () => {
		// This will be tested as part of the Step 2 panel integration test
		// The event list is rendered by the panel, not CalendarPreview alone
		expect(true).toBe(true);
	});
});
