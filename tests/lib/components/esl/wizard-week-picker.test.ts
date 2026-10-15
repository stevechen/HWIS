import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import WeekPicker from '$lib/components/esl/wizard/WeekPicker.svelte';

/**
 * WeekPicker as Step 1 drives it (ticket #219): one row per Monday, Mon–Fri
 * cells only, click snaps to the row's Monday, the row holding the selected
 * start date is pre-highlighted.
 */
const S1_MONDAYS = ['2026-08-31', '2026-09-07'];
const S2_MONDAYS = ['2026-02-09', '2026-02-16', '2026-02-23'];

describe('WeekPicker (step 1 usage)', () => {
	it('renders one row per Monday with Mon–Fri cells only', async () => {
		render(WeekPicker, { mondays: S2_MONDAYS, selectedDate: null, onPick: () => {} });

		await expect.element(page.getByTestId('week-picker.row-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('week-picker.row-2')).toBeInTheDocument();
		await expect.element(page.getByTestId('week-picker.row-3')).toBeInTheDocument();
		await expect.element(page.getByTestId('week-picker.row-4')).not.toBeInTheDocument();

		// Every weekday cell of row 1 renders; Sat/Sun never render.
		for (const date of ['2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13']) {
			await expect.element(page.getByTestId(`week-picker.date-${date}`)).toBeInTheDocument();
		}
		await expect.element(page.getByTestId('week-picker.date-2026-02-14')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('week-picker.date-2026-02-15')).not.toBeInTheDocument();
	});

	it('snaps any clicked date to the Monday of its week', async () => {
		let picked: string | null = null;
		const onPick = (date: string) => {
			picked = date;
		};
		render(WeekPicker, { mondays: S1_MONDAYS, selectedDate: null, onPick });

		// A Thursday in row 2 (Sep 10) snaps back to that row's Monday (Sep 7).
		await page.getByTestId('week-picker.date-2026-09-10').click();
		expect(picked).toBe('2026-09-07');

		// A Monday stays put.
		await page.getByTestId('week-picker.date-2026-08-31').click();
		expect(picked).toBe('2026-08-31');
	});

	it('pre-highlights the row and Monday cell of the selected start date', async () => {
		await expect.element(page.getByTestId('week-picker.row-1.label')).toHaveTextContent('Week 1 ✓');
		await expect.element(page.getByTestId('week-picker.row-2.label')).toHaveTextContent('Week 2');
		await expect
			.element(page.getByTestId('week-picker.date-2026-08-31'))
			.toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(page.getByTestId('week-picker.date-2026-09-01'))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('moves the highlight when a different row is picked', async () => {
		let picked: string | null = null;
		const onPick = (date: string) => {
			picked = date;
		};
		render(WeekPicker, {
			mondays: S1_MONDAYS,
			selectedDate: '2026-08-31',
			onPick
		});

		// Click a date in row 2 (Sep 11, Friday) → snaps to Sep 7
		await page.getByTestId('week-picker.date-2026-09-11').click();
		expect(picked).toBe('2026-09-07');
		await expect.element(page.getByTestId('week-picker.row-2.label')).toHaveTextContent('Week 2 ✓');
		await expect.element(page.getByTestId('week-picker.row-1.label')).toHaveTextContent('Week 1');
	});

	it('honours a custom testId prefix', async () => {
		render(WeekPicker, {
			mondays: S1_MONDAYS,
			selectedDate: null,
			onPick: () => {},
			testId: 'wizard.step-1-picker'
		});

		await expect.element(page.getByTestId('wizard.step-1-picker.row-1')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-1-picker.date-2026-08-31'))
			.toBeInTheDocument();
	});
});
