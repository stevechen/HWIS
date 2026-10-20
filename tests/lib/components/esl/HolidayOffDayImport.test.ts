import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import HolidayOffDayImport from '$lib/components/esl/HolidayOffDayImport.svelte';

const mutationMock = vi.fn();
const actionMock = vi.fn();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({ mutation: mutationMock, action: actionMock }))
}));

const PROPS = {
	semesterId: 's1' as never,
	term: 'S1' as const,
	startDate: '2026-08-31'
};

const PREVIEW = {
	years: [{ rocYear: '115', fileName: '115.csv', status: 'ok', days: 4, holidays: 2 }],
	days: [{ date: '2026-09-28', name: "Teacher's Day", needsReview: false }],
	skippedTaken: 1,
	outOfRange: 2,
	plainWeekends: 3,
	weekendHolidays: 1
} as const;

const IMPORT_REPORT = {
	years: [
		{
			rocYear: '115',
			fileName: '115.csv',
			status: 'ok',
			days: 4,
			holidays: 2,
			cache: { inserted: 4, updated: 0, deleted: 0 }
		}
	],
	events: {
		inserted: 1,
		skippedTaken: 1,
		outOfRange: 2,
		plainWeekends: 3,
		weekendHolidays: 1,
		needsReview: []
	}
} as const;

function click(testId: string) {
	(page.getByTestId(testId).element() as HTMLButtonElement).click();
}

describe('HolidayOffDayImport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// This file's only action consumer previews first, then imports:
		// serve by call order (once-queues would leak across tests since
		// clearAllMocks preserves them, but calls reset every test).
		actionMock.mockImplementation(() => {
			const first = actionMock.mock.calls.length <= 1;
			return Promise.resolve(structuredClone(first ? PREVIEW : IMPORT_REPORT));
		});
		mutationMock.mockResolvedValue({
			inserted: 0,
			skippedTaken: 0,
			outOfRange: 0,
			plainWeekends: 0,
			weekendHolidays: 0,
			needsReview: []
		});
	});

	it('offers the semester years checked with preview enabled', async () => {
		await render(HolidayOffDayImport, { ...PROPS });
		await expect.element(page.getByTestId('esl-offday-import.gov-year-115')).toBeChecked();
		await expect.element(page.getByTestId('esl-offday-import.gov-year-116')).toBeChecked();
		await expect.element(page.getByTestId('esl-offday-import.gov-preview')).toBeEnabled();
	});

	it('disables preview when every year is unchecked', async () => {
		await render(HolidayOffDayImport, { ...PROPS });
		for (const rocYear of ['115', '116']) {
			(
				page.getByTestId(`esl-offday-import.gov-year-${rocYear}`).element() as HTMLInputElement
			).click();
		}
		await expect.element(page.getByTestId('esl-offday-import.gov-preview')).toBeDisabled();
	});

	it('previews days then imports them on confirmation', async () => {
		await render(HolidayOffDayImport, { ...PROPS });
		click('esl-offday-import.gov-preview');

		const result = page.getByTestId('esl-offday-import.gov-preview-result');
		await expect.element(result).toBeInTheDocument();
		await expect.element(result).toMatchTextContent(/2026-09-28.*Teacher's Day/);
		await expect.element(page.getByTestId('esl-offday-import.gov-import')).toBeEnabled();

		click('esl-offday-import.gov-import');
		await expect
			.element(page.getByTestId('esl-offday-import.gov-report'))
			.toMatchTextContent(/1 off day added/);
		expect(actionMock).toHaveBeenCalledTimes(2);
	});

	it('keeps the manual dropzone with submit disabled until a file is picked', async () => {
		await render(HolidayOffDayImport, { ...PROPS });
		await expect.element(page.getByTestId('esl-offday-import.dropzone')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-offday-import.submit')).toBeDisabled();
	});

	it('links to dataset 14718', async () => {
		await render(HolidayOffDayImport, { ...PROPS });
		const link = page.getByTestId('esl-offday-import.dataset-link');
		await expect.element(link).toBeInTheDocument();
		await expect.element(link).toHaveAttribute('href', 'https://data.gov.tw/dataset/14718');
	});
});
