import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import InlineHolidayImport from '$lib/components/esl/wizard/InlineHolidayImport.svelte';

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

describe('InlineHolidayImport — one-click holiday import', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		actionMock.mockImplementation(() => {
			const first = actionMock.mock.calls.length <= 1;
			return Promise.resolve(structuredClone(first ? PREVIEW_RESULT : IMPORT_REPORT));
		});
	});

	it('auto-checks ROC years from semesterUploadYears (S1 = 2 years)', async () => {
		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S1',
			startDate: '2026-08-31'
		});

		await expect.element(page.getByTestId('wizard.step-2-holiday.gov-year-115')).toBeChecked();
		await expect.element(page.getByTestId('wizard.step-2-holiday.gov-year-116')).toBeChecked();
	});

	it('auto-checks ROC years from semesterUploadYears (S2 = 1 year)', async () => {
		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S2',
			startDate: '2026-02-11'
		});

		await expect.element(page.getByTestId('wizard.step-2-holiday.gov-year-115')).toBeChecked();
		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-year-116'))
			.not.toBeInTheDocument();
	});

	it('shows preview when preview button is clicked', async () => {
		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S1',
			startDate: '2026-08-31'
		});

		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();

		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview-result'))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview-result'))
			.toHaveTextContent(/2026-09-28/);
		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview-result'))
			.toHaveTextContent("Teacher's Day");
	});

	it('shows loading spinner during preview', async () => {
		let resolvePreview: (value: typeof PREVIEW_RESULT) => void;
		const previewPromise = new Promise<typeof PREVIEW_RESULT>((resolve) => {
			resolvePreview = resolve;
		});
		actionMock.mockImplementationOnce(() => previewPromise);

		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S1',
			startDate: '2026-08-31'
		});

		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();

		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview'))
			.toHaveTextContent('Reading…');

		resolvePreview!(PREVIEW_RESULT);
		await vi.waitFor(() => {
			expect(actionMock.mock.calls.length).toBe(1);
		});
	});

	it('imports holidays after preview and shows report', async () => {
		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S1',
			startDate: '2026-08-31'
		});

		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();
		await expect.element(page.getByTestId('wizard.step-2-holiday.gov-import')).toBeEnabled();

		await page.getByTestId('wizard.step-2-holiday.gov-import').click();

		await expect.element(page.getByTestId('wizard.step-2-holiday.gov-report')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-report'))
			.toHaveTextContent('2 off days added');
	});

	it('shows loading spinner during import', async () => {
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

		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S1',
			startDate: '2026-08-31'
		});

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

	it('disables preview when no years are checked', async () => {
		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S1',
			startDate: '2026-08-31'
		});

		for (const rocYear of ['115', '116']) {
			(
				page.getByTestId(`wizard.step-2-holiday.gov-year-${rocYear}`).element() as HTMLInputElement
			).click();
		}

		await expect.element(page.getByTestId('wizard.step-2-holiday.gov-preview')).toBeDisabled();
	});

	it('clears preview and report when year selection changes', async () => {
		render(InlineHolidayImport, {
			semesterId: 's1' as never,
			term: 'S1',
			startDate: '2026-08-31'
		});

		await page.getByTestId('wizard.step-2-holiday.gov-preview').click();
		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview-result'))
			.toBeInTheDocument();

		(page.getByTestId('wizard.step-2-holiday.gov-year-115').element() as HTMLInputElement).click();

		await expect
			.element(page.getByTestId('wizard.step-2-holiday.gov-preview-result'))
			.not.toBeInTheDocument();
	});
});
