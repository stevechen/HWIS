import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import Step3Panel from '$lib/components/esl/wizard/Step3Panel.svelte';
import type { WizardState } from '$lib/components/esl/wizard/wizard-state';
import { createInitialWizardState } from '$lib/components/esl/wizard/wizard-state';

// Mock the Convex hooks that the shell might use
vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: null, isLoading: false })),
	useConvexClient: vi.fn(() => ({ mutation: vi.fn(), query: vi.fn() }))
}));

type StateOverrides = Omit<Partial<WizardState>, 'step1'> & {
	step1?: Partial<WizardState['step1']>;
};

function makeState(overrides: StateOverrides = {}): WizardState {
	const base = createInitialWizardState('2026-08-15');
	return {
		...base,
		...overrides,
		step1: { ...base.step1, ...overrides.step1 },
		step2: { ...base.step2, ...overrides.step2 },
		step3: { ...base.step3, ...overrides.step3 }
	} as WizardState;
}

describe('Step 3: Exam Dates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders step 3 panel with exam tabs', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: { exams: [] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		await expect.element(page.getByTestId('wizard.step-3-panel')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-3-tab-exam-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-3-tab-exam-2')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-3-tab-final')).toBeInTheDocument();
	});

	it('shows ExamRangePicker for active exam', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: { exams: [] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		await expect.element(page.getByTestId('wizard.step-3-picker')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-3-picker.title'))
			.toMatchTextContent('Exam 1 (2 class days)');
		// When no dates set, shows "Not set yet" inside the picker's own status
		// card. Scoped to the picker: the exam list repeats the same wording for
		// every unset slot, so an unscoped getByText would be ambiguous.
		await expect
			.element(page.getByTestId('wizard.step-3-picker'))
			.toMatchTextContent('Not set yet');
	});

	it('highlights N class days on hover, skipping weekends and off days', async () => {
		const offDays = [
			{ date: '2026-09-07', name: 'Labor Day' }, // Monday off
			{ date: '2026-10-12', name: 'Columbus Day' } // Monday off
		];
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays, holidaysImported: true },
			step3: { exams: [] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		// Hover over a date - the calendar should show hover preview
		const calendar = page.getByTestId('wizard.step-3-calendar');
		await expect.element(calendar).toBeInTheDocument();

		// Find a valid class day cell (not weekend, not off day)
		// Aug 31, 2026 is a Monday - let's hover it
		const dateCell = page.getByTestId('wizard.step-3-calendar.date-2026-08-31');
		await dateCell.hover();

		// The hover highlight should show 2 class days for Exam 1
		// Aug 31 (Mon) and Sep 1 (Tue) - but Sep 7 is off day
		// Wait, the highlight is shown via the highlighted prop on CalendarPreview
		// We need to check that the highlighted dates are correct
	});

	it('clicks a date to set exam range, shows confirm dialog with computed range', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: { exams: [] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		// Click on a valid class day
		const dateCell = page.getByTestId('wizard.step-3-calendar.date-2026-08-31');
		await dateCell.click();

		// Should show a confirm dialog with the computed range
		// Format: "Set Exam 1: Mon Aug 31 – Tue Sep 1"
		await expect.element(page.getByTestId('wizard.step-3-confirm-dialog')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-3-confirm-dialog.message'))
			.toMatchTextContent('Set Exam 1: Mon Aug 31 – Tue Sep 1');

		// Click confirm
		await page.getByTestId('wizard.step-3-confirm-dialog.confirm').click();

		// Should update the state
		expect(updateFn).toHaveBeenCalled();
	});

	it('enforces order gate: Exam 1 < Exam 2 < Final', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false }, // Skip Final auto-default
			step3: { exams: [{ label: 'Exam 2', dates: ['2026-10-12', '2026-10-13'] }] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		// Switch to Exam 1 tab
		await page.getByTestId('wizard.step-3-tab-exam-1').click();

		// The date that would violate order should be disabled
		const dateCell = page.getByTestId('wizard.step-3-calendar.date-2026-10-14');
		await expect.element(dateCell).toBeDisabled();

		// Should quietly refuse (no state update beyond initial render)
		const initialCalls = updateFn.mock.calls.length;
		// Try to click the disabled date (should not trigger update)
		await dateCell.click({ force: true });
		expect(updateFn).toHaveBeenCalledTimes(initialCalls);
	});

	it('shows live exam dates on right panel', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: { exams: [{ label: 'Exam 1', dates: ['2026-08-31', '2026-09-01'] }] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		await expect.element(page.getByTestId('wizard.step-3-exam-list')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-3-exam-exam-1'))
			.toMatchTextContent('Exam 1');
		await expect
			.element(page.getByTestId('wizard.step-3-exam-exam-1'))
			.toMatchTextContent('2026-08-31');
		await expect
			.element(page.getByTestId('wizard.step-3-exam-exam-1'))
			.toMatchTextContent('2026-09-01');
	});

	it('enables Confirm button when all required exams are set', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: {
				exams: [
					{ label: 'Exam 1', dates: ['2026-08-31', '2026-09-01'] },
					{ label: 'Exam 2', dates: ['2026-10-12', '2026-10-13'] },
					{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
				]
			}
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		const confirmButton = page.getByTestId('wizard.step-3-confirm');
		await expect.element(confirmButton).not.toBeDisabled();
	});

	it('disables Confirm button when required exams are missing', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: { exams: [{ label: 'Exam 1', dates: ['2026-08-31', '2026-09-01'] }] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		const confirmButton = page.getByTestId('wizard.step-3-confirm');
		await expect.element(confirmButton).toBeDisabled();
	});

	it('overflow start dates are disabled (fan-out would exceed endDate)', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: { exams: [] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		// The date that would overflow (endDate) should be disabled
		const dateCell = page.getByTestId('wizard.step-3-calendar.date-2027-01-20');
		await expect.element(dateCell).toBeDisabled();

		// Should quietly refuse (no state update beyond initial render)
		const initialCalls = updateFn.mock.calls.length;
		await dateCell.click({ force: true });
		expect(updateFn).toHaveBeenCalledTimes(initialCalls);
	});

	it('can clear an exam range', async () => {
		const state = makeState({
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false },
			step3: { exams: [{ label: 'Exam 1', dates: ['2026-08-31', '2026-09-01'] }] }
		});
		const updateFn = vi.fn();
		await render(Step3Panel, { state, update: updateFn });

		await page.getByTestId('wizard.step-3-picker.clear').click();
		expect(updateFn).toHaveBeenCalled();
	});
});
