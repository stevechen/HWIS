import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.fn();
const beforeNavigateMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args),
	beforeNavigate: (...args: unknown[]) => beforeNavigateMock(...args)
}));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({ action: vi.fn(), mutation: vi.fn(), query: vi.fn() }))
}));

import WizardPage from '$src/routes/esl/admin/semesters/new/wizard/+page.svelte';

const STORAGE_KEY = 'hwis:esl-wizard';

function stored(): string | null {
	return sessionStorage.getItem(STORAGE_KEY);
}

/** The S1 gate — pick the room letter when the panel offers it. */
async function chooseRoomLimitIfPresent(): Promise<void> {
	const select = page.getByTestId('wizard.step-1-room-limit');
	try {
		// S1 only: the room-settings block disappears on S2 setup.
		await expect.element(select).toBeVisible();
		await select.selectOptions('E');
	} catch {
		// S2 setup has no room-limit section.
	}
}

describe('ESL semester wizard route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	it('renders the wizard shell on the route with the step 1 panel', async () => {
		await render(WizardPage);

		await expect.element(page.getByTestId('wizard.root')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.progress')).toMatchTextContent('Step 1 of 5');
		await expect.element(page.getByTestId('wizard.step-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-1-panel')).toBeInTheDocument();
	});

	it('hands the seeded state down to the step 1 panel', async () => {
		await render(WizardPage);

		// The shell seeds the suggestion; the panel shows what it was handed.
		// The route runs at wall-clock date, so only the shapes are pinned.
		const suggestion = page.getByTestId('wizard.step-1-suggestion');
		await expect.element(suggestion).toMatchTextContent(/Suggested: (S1|S2) \d{4}-\d{4}/);
		await expect
			.element(page.getByTestId('wizard.step-1-start-date'))
			.toMatchTextContent(/Start Date: \d{4}-\d{2}-\d{2}/);
		await expect.element(page.getByTestId('wizard.step-1-picker.row-1')).toBeInTheDocument();
	});

	it('advances to the step 2 slot and persists the step', async () => {
		await render(WizardPage);

		await chooseRoomLimitIfPresent();
		await page.getByRole('button', { name: 'Next' }).click();

		await expect.element(page.getByTestId('wizard.step-1-placeholder')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2')).toBeInTheDocument();
		// Step2Panel renders with testId "wizard.step-2" (the panel wrapper)
		// Check for content specific to Step2Panel
		await expect.element(page.getByTestId('wizard.step-2-end-picker')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
	});

	it('walks the stepper to any completed step', async () => {
		await render(WizardPage);

		await page.getByTestId('wizard.step-2-tab').click();

		await expect
			.element(page.getByTestId('wizard.step-2-tab'))
			.toHaveAttribute('aria-current', 'step');
		// Step2Panel renders with testId "wizard.step-2"
		await expect.element(page.getByTestId('wizard.step-2')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});

		await page.getByTestId('wizard.step-1-tab').click();

		await expect.element(page.getByTestId('wizard.step-1-panel')).toBeInTheDocument();
	});

	it('keeps the steps behind their prerequisites locked', async () => {
		await render(WizardPage);

		await expect.element(page.getByTestId('wizard.step-3-tab')).toBeDisabled();
		await expect.element(page.getByTestId('wizard.step-4-tab')).toBeDisabled();
		await expect.element(page.getByTestId('wizard.step-5-tab')).toBeDisabled();
	});

	it('resumes the stored step after a refresh', async () => {
		const first = await render(WizardPage);
		await chooseRoomLimitIfPresent();
		await page.getByRole('button', { name: 'Next' }).click();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
		await first.unmount();

		await render(WizardPage);

		await expect.element(page.getByTestId('wizard.step-2')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.resumed')).toBeInTheDocument();
	});

	it('cancels by discarding the stored state and leaving the wizard', async () => {
		await render(WizardPage);
		await chooseRoomLimitIfPresent();
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
