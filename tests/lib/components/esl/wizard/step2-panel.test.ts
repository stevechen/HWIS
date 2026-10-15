import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Step2Panel from '$lib/components/esl/wizard/Step2Panel.svelte';
import type { WizardState } from '$lib/components/esl/wizard/wizard-state';

// Mock the Convex client for holiday import
const actionMock = vi.fn();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({ action: actionMock }))
}));

const PREVIEW_RESULT = {
	years: [{ rocYear: '115', fileName: '115.csv', status: 'ok', days: 4, holidays: 2 }],
	days: [
		{ date: '2026-09-28', name: "Teacher's Day", needsReview: false },
		{ date: '2026-10-10', name: 'National Day', needsReview: false }
	],
	skippedTaken: 0,
	outOfRange: 0,
	plainWeekends: 0,
	weekendHolidays: 0
} as const;

const IMPORT_REPORT = {
	years: [
		{
			rocYear: '115',
			fileName: '115.csv',
			status: 'ok',
			days: 4,
			holidays: 2,
			cache: { inserted: 2, updated: 0, deleted: 0 }
		}
	],
	events: {
		inserted: 2,
		skippedTaken: 0,
		outOfRange: 0,
		plainWeekends: 0,
		weekendHolidays: 0,
		needsReview: []
	}
} as const;

describe('Step2Panel — end date, holiday import, calendar preview, event list', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		actionMock.mockImplementation(() => {
			const first = actionMock.mock.calls.length <= 1;
			return Promise.resolve(structuredClone(first ? PREVIEW_RESULT : IMPORT_REPORT));
		});
	});

	const mockState: WizardState = {
		currentStep: 2,
		semesterId: null,
		step1: { term: 'S1' as const, schoolYear: '2026-2027', startDate: '2026-08-31' },
		step2: {
			endDate: '2027-01-20',
			offDays: [] as { date: string; name: string }[],
			holidaysImported: false,
			lastExamDay: true
		},
		step3: { exams: [] },
		step4: {},
		step5: {}
	};

	function renderStep2(updateMock: (mutate: (draft: WizardState) => void) => void = vi.fn()) {
		return render(Step2Panel, {
			state: mockState,
			step: 2,
			update: updateMock
		});
	}

	it('renders the Step 2 panel wrapper', async () => {
		const update = vi.fn();
		await renderStep2(update);

		await expect.element(page.getByTestId('wizard.step-2-panel')).toBeInTheDocument();
	});

	it('shows end date WeekPicker with correct rows for S1', async () => {
		const update = vi.fn();
		await renderStep2(update);

		await expect.element(page.getByTestId('wizard.step-2-end-picker')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-end-picker.row-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-end-picker.row-2')).toBeInTheDocument();
	});

	it('shows end date WeekPicker with correct rows for S2', async () => {
		const update = vi.fn();
		const state: WizardState = {
			...mockState,
			step1: { term: 'S2' as const, schoolYear: '2025-2026', startDate: '2026-02-11' },
			step2: { endDate: '2026-06-30', offDays: [], holidaysImported: false, lastExamDay: true }
		};
		await render(Step2Panel, { state, step: 2, update });

		await expect.element(page.getByTestId('wizard.step-2-end-picker')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-end-picker.row-1')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-2-end-picker.row-2'))
			.not.toBeInTheDocument();
	});

	it('highlights the default end date cell (Jan 20 for S1)', async () => {
		const update = vi.fn();
		await renderStep2(update);

		// With snapToMonday=false, the exact date cell is highlighted
		const cell = page.getByTestId('wizard.step-2-end-picker.date-2027-01-20');
		await expect.element(cell).toHaveAttribute('aria-pressed', 'true');
	});

	it('clicking a date updates endDate in state', async () => {
		const update = vi.fn();
		await renderStep2(update);

		await page.getByTestId('wizard.step-2-end-picker.date-2027-01-22').click();

		expect(update).toHaveBeenCalled();
		const draft = update.mock.calls[0][0];
		expect(typeof draft).toBe('function');
	});

	it('shows end date summary', async () => {
		const update = vi.fn();
		await renderStep2(update);

		await expect.element(page.getByText('End date:')).toBeInTheDocument();
		await expect.element(page.getByText('2027-01-20')).toBeInTheDocument();
	});

	it('shows error when end date is before start date', async () => {
		const update = vi.fn();
		const state: WizardState = {
			...mockState,
			step2: { endDate: '2026-08-01', offDays: [], holidaysImported: false, lastExamDay: true }
		};
		await render(Step2Panel, { state, step: 2, update });

		await expect.element(page.getByTestId('wizard.step-2-end-error')).toBeInTheDocument();
		await expect.element(page.getByText(/before the start/)).toBeInTheDocument();
	});

	it('shows "This is also the last exam day" checkbox (default on)', async () => {
		const update = vi.fn();
		await renderStep2(update);

		const checkbox = page.getByRole('checkbox', { name: /last exam day/i });
		await expect.element(checkbox).toBeInTheDocument();
		await expect.element(checkbox).toBeChecked();
	});

	it('renders InlineHolidayImport component', async () => {
		const update = vi.fn();
		await renderStep2(update);

		await expect.element(page.getByTestId('wizard.step-2-holiday')).toBeInTheDocument();
	});

	it('renders CalendarPreview (read-only) on the left', async () => {
		const update = vi.fn();
		await renderStep2(update);

		await expect.element(page.getByTestId('wizard.step-2-calendar')).toBeInTheDocument();
	});

	it('shows event list on the right with imported off days', async () => {
		const update = vi.fn();
		const state: WizardState = {
			...mockState,
			step2: {
				endDate: '2027-01-20',
				offDays: [
					{ date: '2026-09-28', name: "Teacher's Day" },
					{ date: '2026-10-10', name: 'National Day' }
				],
				holidaysImported: true,
				lastExamDay: true
			}
		};
		await render(Step2Panel, { state, step: 2, update });

		await expect.element(page.getByTestId('wizard.step-2-event-list')).toBeInTheDocument();
		// Use test IDs to avoid strict mode violation (text also appears in calendar)
		await expect.element(page.getByTestId('wizard.step-2-event-2026-09-28')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-2-event-2026-10-10')).toBeInTheDocument();
	});

	it('event list shows off days in chronological order', async () => {
		const update = vi.fn();
		const state: WizardState = {
			...mockState,
			step2: {
				endDate: '2027-01-20',
				offDays: [
					{ date: '2026-10-10', name: 'National Day' },
					{ date: '2026-09-28', name: "Teacher's Day" }
				],
				holidaysImported: true,
				lastExamDay: true
			}
		};
		await render(Step2Panel, { state, step: 2, update });

		// Should be ordered by date: Teacher's Day first, then National Day
		const teacherDay = page.getByTestId('wizard.step-2-event-2026-09-28');
		const nationalDay = page.getByTestId('wizard.step-2-event-2026-10-10');
		await expect.element(teacherDay).toBeInTheDocument();
		await expect.element(nationalDay).toBeInTheDocument();
		// Check order by getting all event items and verifying their test IDs
		const items = page.getByTestId('wizard.step-2-event-list').getByRole('listitem');
		await expect
			.element(items.first())
			.toHaveAttribute('data-testid', 'wizard.step-2-event-2026-09-28');
		await expect
			.element(items.last())
			.toHaveAttribute('data-testid', 'wizard.step-2-event-2026-10-10');
	});

	it('one-click holiday import: preview then import', async () => {
		const update = vi.fn();
		await renderStep2(update);

		// Click preview
		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();

		// Wait for preview to show
		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview-result'))
			.toBeInTheDocument();

		// Click import
		await page.getByTestId('wizard.step-2-holiday.gov-import').click();

		// Wait for import report
		await expect.element(page.getByTestId('wizard.step-2-holiday.gov-report')).toBeInTheDocument();
		await expect.element(page.getByText('2 off days added')).toBeInTheDocument();
	});

	it('shows loading state during preview', async () => {
		let resolvePreview: (value: typeof PREVIEW_RESULT) => void;
		const previewPromise = new Promise<typeof PREVIEW_RESULT>((resolve) => {
			resolvePreview = resolve;
		});
		actionMock.mockImplementationOnce(() => previewPromise);

		const update = vi.fn();
		await renderStep2(update);

		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();

		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview'))
			.toHaveTextContent('Reading…');

		resolvePreview!(PREVIEW_RESULT);
		await vi.waitFor(() => {
			expect(actionMock.mock.calls.length).toBe(1);
		});
	});

	it('shows loading state during import', async () => {
		let resolvePreview: (value: typeof PREVIEW_RESULT) => void;
		const previewPromise = new Promise<typeof PREVIEW_RESULT>((resolve) => {
			resolvePreview = resolve;
		});
		let resolveImport: (value: typeof IMPORT_REPORT) => void;
		const importPromise = new Promise<typeof IMPORT_REPORT>((resolve) => {
			resolveImport = resolve;
		});

		let callCount = 0;
		actionMock.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return previewPromise;
			return importPromise;
		});

		const update = vi.fn();
		await renderStep2(update);

		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();

		// Wait for preview to complete
		resolvePreview!(PREVIEW_RESULT);
		await vi.waitFor(() => {
			expect(actionMock.mock.calls.length).toBe(1);
		});

		// Now click import
		await page.getByTestId('wizard.step-2-holiday.gov-import').click();

		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-import'))
			.toHaveTextContent('Importing…');

		resolveImport!(IMPORT_REPORT);
		await vi.waitFor(() => {
			expect(actionMock.mock.calls.length).toBe(2);
		});
	});

	it('updates offDays and holidaysImported in state after import', async () => {
		const update = vi.fn();
		await renderStep2(update);

		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();
		await page.getByTestId('wizard.step-2-holiday.gov-import').click();

		await vi.waitFor(() => {
			expect(actionMock.mock.calls.length).toBe(2);
		});

		// The update function should have been called with the new offDays
		expect(update).toHaveBeenCalled();
	});
});
