import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import WeekPicker from '$lib/components/esl/wizard/WeekPicker.svelte';

describe('WeekPicker — Step 2 end date', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders 2 rows for S1 (Jan 20 week + next)', async () => {
		const mondays = ['2027-01-18', '2027-01-25']; // Jan 20 week + next
		await render(WeekPicker, {
			mondays,
			selectedDate: '2027-01-20',
			snapToMonday: false,
			showWeekNumbers: false,
			onPick: vi.fn(),
			testId: 'wizard.step-2-end-picker'
		});

		await expect.element(page.getByTestId('wizard.step-2-end-picker')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-end-picker.row-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-end-picker.row-2')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-2-end-picker.row-3'))
			.not.toBeInTheDocument();
	});

	it('renders 1 row for S2 (Jun 30 week)', async () => {
		const mondays = ['2026-06-29']; // Jun 30 week
		await render(WeekPicker, {
			mondays,
			selectedDate: '2026-06-30',
			snapToMonday: false,
			showWeekNumbers: false,
			onPick: vi.fn(),
			testId: 'wizard.step-2-end-picker'
		});

		await expect.element(page.getByTestId('wizard.step-2-end-picker')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-end-picker.row-1')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-2-end-picker.row-2'))
			.not.toBeInTheDocument();
	});

	it('highlights the default date cell (Jan 20 for S1)', async () => {
		const mondays = ['2027-01-18', '2027-01-25'];
		await render(WeekPicker, {
			mondays,
			selectedDate: '2027-01-20',
			snapToMonday: false,
			showWeekNumbers: false,
			onPick: vi.fn(),
			testId: 'wizard.step-2-end-picker'
		});

		// With snapToMonday=false, the exact date cell is highlighted
		const cell = page.getByTestId('wizard.step-2-end-picker.date-2027-01-20');
		await expect.element(cell).toHaveAttribute('aria-pressed', 'true');
	});

	it('clicking a date calls onPick with the exact date (snapToMonday=false)', async () => {
		const mondays = ['2027-01-18', '2027-01-25'];
		const onPick = vi.fn();
		await render(WeekPicker, {
			mondays,
			selectedDate: '2027-01-20',
			snapToMonday: false,
			showWeekNumbers: false,
			onPick,
			testId: 'wizard.step-2-end-picker'
		});

		await page.getByTestId('wizard.step-2-end-picker.date-2027-01-22').click();
		expect(onPick).toHaveBeenCalledWith('2027-01-22');
	});

	it('weekend dates are not rendered in the grid (Mon-Fri only)', async () => {
		const mondays = ['2027-01-18', '2027-01-25'];
		const onPick = vi.fn();
		await render(WeekPicker, {
			mondays,
			selectedDate: '2027-01-20',
			snapToMonday: false,
			showWeekNumbers: false,
			onPick,
			testId: 'wizard.step-2-end-picker'
		});

		// Jan 23, 2027 is a Saturday - should not exist in the grid
		await expect
			.element(page.getByTestId('wizard.step-2-end-picker.date-2027-01-23'))
			.not.toBeInTheDocument();
		// Jan 24, 2027 is a Sunday - should not exist in the grid
		await expect
			.element(page.getByTestId('wizard.step-2-end-picker.date-2027-01-24'))
			.not.toBeInTheDocument();
	});

	it('shows date numbers without leading zeros', async () => {
		const mondays = ['2027-01-18', '2027-01-25'];
		await render(WeekPicker, {
			mondays,
			selectedDate: '2027-01-20',
			snapToMonday: false,
			showWeekNumbers: false,
			onPick: vi.fn(),
			testId: 'wizard.step-2-end-picker'
		});

		// Check the first cell (Monday Jan 18) shows "1/18"
		await expect
			.element(page.getByTestId('wizard.step-2-end-picker.date-2027-01-18'))
			.toMatchTextContent('1/18');
		// Check Friday Jan 22 shows "1/22"
		await expect
			.element(page.getByTestId('wizard.step-2-end-picker.date-2027-01-22'))
			.toMatchTextContent('1/22');
	});
});
