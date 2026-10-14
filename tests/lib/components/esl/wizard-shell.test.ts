import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

import WizardShellHarness from './wizard-shell.harness.svelte';

const STORAGE_KEY = 'hwis:esl-wizard';

function stored(): string | null {
	return sessionStorage.getItem(STORAGE_KEY);
}

describe('wizard shell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	it('renders the stepper, the current step panel and the Back / Next footer', async () => {
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('wizard.root')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.title')).toHaveTextContent('Semester setup');
		await expect.element(page.getByTestId('wizard.steps')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.progress')).toHaveTextContent('Step 1 of 5');
		await expect.element(page.getByTestId('wizard.step-1')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Back' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('highlights the current step only', async () => {
		await render(WizardShellHarness);

		await expect
			.element(page.getByTestId('wizard.step-1-tab'))
			.toHaveAttribute('aria-current', 'step');
		for (const step of [2, 3, 4, 5]) {
			await expect
				.element(page.getByTestId(`wizard.step-${step}-tab`))
				.not.toHaveAttribute('aria-current', 'step');
		}

		await page.getByRole('button', { name: 'Next' }).click();

		await expect
			.element(page.getByTestId('wizard.step-1-tab'))
			.not.toHaveAttribute('aria-current', 'step');
		await expect
			.element(page.getByTestId('wizard.step-2-tab'))
			.toHaveAttribute('aria-current', 'step');
	});

	it('locks the steps that are not complete yet', async () => {
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('wizard.step-2-tab')).toBeEnabled();
		await expect.element(page.getByTestId('wizard.step-3-tab')).toBeDisabled();
		await expect.element(page.getByTestId('wizard.step-4-tab')).toBeDisabled();
		await expect.element(page.getByTestId('wizard.step-5-tab')).toBeDisabled();

		// A locked tab stays put even when clicked.
		await page.getByTestId('wizard.step-4-tab').click({ force: true });

		await expect.element(page.getByTestId('harness.step')).toHaveTextContent('1');
	});

	it('persists every step change to sessionStorage', async () => {
		await render(WizardShellHarness);

		expect(stored()).toBeNull();

		await page.getByRole('button', { name: 'Next' }).click();

		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});

		await page.getByRole('button', { name: 'Next' }).click();

		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":3');
		});

		await page.getByRole('button', { name: 'Back' }).click();

		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
	});

	it('keeps a manual edit when the admin walks back and forward again', async () => {
		await render(WizardShellHarness);

		await page.getByTestId('harness.set-start').click();

		await expect.element(page.getByTestId('harness.start-date')).toHaveTextContent('2026-09-07');

		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(page.getByTestId('harness.step')).toHaveTextContent('2');

		await page.getByRole('button', { name: 'Back' }).click();

		await expect.element(page.getByTestId('harness.step')).toHaveTextContent('1');
		await expect.element(page.getByTestId('harness.start-date')).toHaveTextContent('2026-09-07');
	});

	it('writes an update straight through to sessionStorage without moving steps', async () => {
		await render(WizardShellHarness);

		await page.getByTestId('harness.set-start').click();

		await vi.waitFor(() => {
			expect(stored()).toContain('2026-09-07');
		});
		await expect.element(page.getByTestId('harness.step')).toHaveTextContent('1');
	});

	it('blocks Next while the current step is incomplete and lets a reached step stay clickable', async () => {
		await render(WizardShellHarness);

		await page.getByTestId('harness.clear-end').click();
		await page.getByRole('button', { name: 'Next' }).click();

		await expect.element(page.getByTestId('harness.step')).toHaveTextContent('2');
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeDisabled();

		// Step 1 still counts as complete, so its tab stays reachable.
		await page.getByTestId('wizard.step-1-tab').click();

		await expect.element(page.getByTestId('harness.step')).toHaveTextContent('1');
	});

	it('resumes the stored step on a fresh mount and says so', async () => {
		const first = await render(WizardShellHarness);
		await page.getByRole('button', { name: 'Next' }).click();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
		await page.getByTestId('harness.set-start').click();
		await vi.waitFor(() => {
			expect(stored()).toContain('2026-09-07');
		});
		first.unmount();

		// A refresh is a fresh mount reading the same sessionStorage.
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('harness.step')).toHaveTextContent('2');
		await expect.element(page.getByTestId('harness.start-date')).toHaveTextContent('2026-09-07');
		await expect.element(page.getByTestId('wizard.resumed')).toBeInTheDocument();
	});

	it('does not claim a resume when nothing was stored', async () => {
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('wizard.resumed')).not.toBeInTheDocument();
	});

	it('dismisses the resume notice', async () => {
		const first = await render(WizardShellHarness);
		await page.getByRole('button', { name: 'Next' }).click();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
		first.unmount();

		await render(WizardShellHarness);
		await page.getByTestId('wizard.resumed-dismiss').click();

		await expect.element(page.getByTestId('wizard.resumed')).not.toBeInTheDocument();
	});

	it('Cancels by dropping the stored state and leaving for the semester list', async () => {
		await render(WizardShellHarness);
		await page.getByRole('button', { name: 'Next' }).click();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});

		await page.getByRole('button', { name: 'Cancel' }).click();

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/esl/admin/semesters');
		});
		expect(stored()).toBeNull();
	});
});
