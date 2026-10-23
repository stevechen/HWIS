import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => args
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

import WizardStep1Harness from './wizard-step-1.harness.svelte';

describe('wizard step 1 — semester & start date', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('suggests S1 for Jul–Sep and says why', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		const suggestion = page.getByTestId('wizard.step-1-suggestion');
		await expect.element(suggestion).toMatchTextContent('S1');
		await expect.element(suggestion).toMatchTextContent('2026-2027');
		await expect.element(suggestion).toMatchTextContent('Jul–Sep');
	});

	it('suggests S2 of the current school year for Jan–Feb', async () => {
		await render(WizardStep1Harness, { today: '2026-02-05' });

		const suggestion = page.getByTestId('wizard.step-1-suggestion');
		await expect.element(suggestion).toMatchTextContent('S2');
		await expect.element(suggestion).toMatchTextContent('2025-2026');
		await expect.element(suggestion).toMatchTextContent('Jan–Feb');
	});

	it('suggests S2 of the current school year for Mar–Jun', async () => {
		await render(WizardStep1Harness, { today: '2026-04-10' });

		const suggestion = page.getByTestId('wizard.step-1-suggestion');
		await expect.element(suggestion).toMatchTextContent('S2');
		await expect.element(suggestion).toMatchTextContent('2025-2026');
		await expect.element(suggestion).toMatchTextContent('Mar–Jun');
	});

	it('suggests S1 of next year for Oct–Dec', async () => {
		await render(WizardStep1Harness, { today: '2026-11-20' });

		const suggestion = page.getByTestId('wizard.step-1-suggestion');
		await expect.element(suggestion).toMatchTextContent('S1');
		await expect.element(suggestion).toMatchTextContent('2027-2028');
		await expect.element(suggestion).toMatchTextContent('Oct–Dec');
	});

	it('seeds the S1 start date and pre-highlights its week', async () => {
		// Aug 30 2026 is a Sunday, so the default rolls to Monday Aug 31.
		await render(WizardStep1Harness, { today: '2026-08-15' });

		await expect
			.element(page.getByTestId('wizard.step-1-picker.row-1.label'))
			.toMatchTextContent('Week 1 ✓');
		await expect
			.element(page.getByTestId('wizard.step-1-picker.row-2.label'))
			.toMatchTextContent('Week 2');
		await expect
			.element(page.getByTestId('wizard.step-1-start-date'))
			.toMatchTextContent('2026-08-31');
	});

	it('renders 2 weekly rows for S1', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		await expect.element(page.getByTestId('wizard.step-1-picker.row-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-1-picker.row-2')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-1-picker.row-3')).not.toBeInTheDocument();
	});

	it('switching to S2 re-seeds the school year, start date and 3 picker rows', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		await page.getByTestId('wizard.step-1-term-S2').click();

		// S2 of the school year whose spring contains this fall → 2026-2027,
		// starting Thursday Feb 11 2027 (a weekday, so no Monday roll).
		await expect
			.element(page.getByTestId('wizard.step-1-school-year'))
			.toMatchTextContent('2026-2027');
		await expect
			.element(page.getByTestId('wizard.step-1-start-date'))
			.toMatchTextContent('2027-02-11');
		await expect.element(page.getByTestId('wizard.step-1-picker.row-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-1-picker.row-2')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-1-picker.row-3')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-1-picker.row-4')).not.toBeInTheDocument();
		// The default start week (week of Feb 11) is pre-highlighted.
		await expect
			.element(page.getByTestId('wizard.step-1-picker.row-1.label'))
			.toMatchTextContent('Week 1 ✓');
	});

	it('switching back to S1 restores the fall window', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		await page.getByTestId('wizard.step-1-term-S2').click();
		await page.getByTestId('wizard.step-1-term-S1').click();

		await expect
			.element(page.getByTestId('wizard.step-1-school-year'))
			.toMatchTextContent('2026-2027');
		await expect
			.element(page.getByTestId('wizard.step-1-start-date'))
			.toMatchTextContent('2026-08-31');
		await expect.element(page.getByTestId('wizard.step-1-picker.row-3')).not.toBeInTheDocument();
	});

	it('clicking any date snaps the start date to that week’s Monday', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		// Thursday of row 2 → Monday Sep 7; the highlight follows.
		await page.getByTestId('wizard.step-1-picker.date-2026-09-10').click();

		await expect
			.element(page.getByTestId('wizard.step-1-start-date'))
			.toMatchTextContent('2026-09-07');
		await expect
			.element(page.getByTestId('wizard.step-1-picker.row-2.label'))
			.toMatchTextContent('Week 2 ✓');
		await expect
			.element(page.getByTestId('wizard.step-1-picker.row-1.label'))
			.toMatchTextContent('Week 1');
	});

	it('shows a Recalculate hint once the start date is manually moved, and restores the default', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		await expect.element(page.getByTestId('wizard.step-1-recalculate')).not.toBeInTheDocument();

		// Click a date in week 2 (Sep 10 → Monday Sep 7) to create an override
		await page.getByTestId('wizard.step-1-picker.date-2026-09-10').click();
		await expect.element(page.getByTestId('wizard.step-1-recalculate')).toBeInTheDocument();

		await page.getByTestId('wizard.step-1-recalculate-button').click();
		await expect
			.element(page.getByTestId('wizard.step-1-start-date'))
			.toMatchTextContent('2026-08-31');
		await expect.element(page.getByTestId('wizard.step-1-recalculate')).not.toBeInTheDocument();
	});

	it('confirms into step 2 and keeps the picked start date', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		// Click a date in week 2 (Sep 10 → Monday Sep 7)
		await page.getByTestId('wizard.step-1-picker.date-2026-09-10').click();
		// S1 setup gates Confirm on the room-limit choice.
		await page.getByTestId('wizard.step-1-room-limit').selectOptions('E');
		await expect
			.element(page.getByTestId('wizard.step-1-room-limit'))
			.toHaveValue('E');
		await page.getByTestId('wizard.step-1-confirm').click();

		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('2');
		await expect
			.element(page.getByTestId('wizard.step-1-start-date'))
			.toMatchTextContent('2026-09-07');
	});

	it('keeps Confirm enabled while a start date is set and disables it when cleared', async () => {
		await render(WizardStep1Harness, { today: '2026-08-15' });

		await expect.element(page.getByTestId('wizard.step-1-confirm')).toBeEnabled();

		await page.getByTestId('harness.clear-start').click();

		await expect.element(page.getByTestId('wizard.step-1-confirm')).toBeDisabled();
	});
});
