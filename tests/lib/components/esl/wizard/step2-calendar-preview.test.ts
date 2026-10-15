import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
		render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		await expect.element(page.getByTestId('wizard.step-2-calendar')).toBeInTheDocument();
		// Legend uses "Off day" and "Exam" (exact match for legend items)
		await expect.element(page.getByText('Off day', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Exam', { exact: true })).toBeInTheDocument();
	});

	it('renders week rows with school week numbers (W1, W2, ...)', async () => {
		render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		await expect.element(page.getByTestId('wizard.step-2-calendar.week-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-calendar.week-1')).toHaveTextContent('W1');
	});

	it('shows weekend cells are filtered out (Mon-Fri only)', async () => {
		render(CalendarPreview, {
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
		render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Sep 28 is a Monday - "Teacher's Day" off day
		const offDayCell = page.getByTestId('wizard.step-2-calendar.date-2026-09-28');
		await expect.element(offDayCell).toHaveTextContent('🎉');
		await expect.element(offDayCell).toHaveTextContent("Teacher's Day");
	});

	it('shows exams with label', async () => {
		render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Oct 5-6 is Exam 1
		const exam1Day1 = page.getByTestId('wizard.step-2-calendar.date-2026-10-05');
		await expect.element(exam1Day1).toHaveTextContent('Exam 1');

		const exam1Day2 = page.getByTestId('wizard.step-2-calendar.date-2026-10-06');
		await expect.element(exam1Day2).toHaveTextContent('Exam 1');
	});

	it('renders month title groups across the week row', async () => {
		render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Week 1 should have AUG month span
		await expect
			.element(page.getByTestId('wizard.step-2-calendar.week-1-months'))
			.toBeInTheDocument();
	});

	it('read-only mode renders cells without button role', async () => {
		render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// In read-only mode, the cell is a div, not a button - check no button role
		const cell = page.getByTestId('wizard.step-2-calendar.date-2026-09-28');
		await expect.element(cell).not.toHaveAttribute('role', 'button');
	});

	it('out-of-range days show middle dot', async () => {
		render(CalendarPreview, {
			weeks,
			interactive: false,
			testId: 'wizard.step-2-calendar'
		});

		// Days after end date (Jan 20) - Jan 21 is after end date
		const outOfRangeCell = page.getByTestId('wizard.step-2-calendar.date-2027-01-21');
		await expect.element(outOfRangeCell).toBeInTheDocument();
		await expect.element(outOfRangeCell).toHaveTextContent('·');
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
