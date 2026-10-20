import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import HolidayCsvUpload from '$lib/components/esl/HolidayCsvUpload.svelte';

const mutationMock = vi.fn();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({ mutation: mutationMock }))
}));

const CSV = `西元日期,星期,是否放假,備註
20250101,三,2,元旦
20250102,四,0,
`;

describe('HolidayCsvUpload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mutationMock.mockResolvedValue({
			year: '2025',
			inserted: 2,
			updated: 0,
			deleted: 0,
			days: 2,
			holidays: 1
		});
	});

	it('links to dataset 14718', async () => {
		await render(HolidayCsvUpload, { year: '2025' });
		const link = page.getByTestId('esl-holiday-upload.dataset-link');
		await expect.element(link).toBeInTheDocument();
		await expect.element(link).toHaveAttribute('href', 'https://data.gov.tw/dataset/14718');
	});

	it('shows the expected format hint', async () => {
		await render(HolidayCsvUpload, { year: '2025' });
		const hint = page.getByTestId('esl-holiday-upload.format-hint');
		await expect.element(hint).toMatchTextContent(/西元日期,星期,是否放假,備註/);
		await expect.element(hint).toMatchTextContent(/YYYYMMDD/);
		await expect.element(hint).toMatchTextContent(/是否放假=2/);
	});

	it('prefills the year and keeps submit disabled until a file is picked', async () => {
		await render(HolidayCsvUpload, { year: '2025' });
		await expect.element(page.getByTestId('esl-holiday-upload.year')).toHaveValue('2025');
		await expect.element(page.getByTestId('esl-holiday-upload.file')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-holiday-upload.submit')).toBeDisabled();
	});

	it('uploads the picked file and reports inserted/updated/deleted', async () => {
		await render(HolidayCsvUpload, { year: '2025' });
		const input = page.getByTestId('esl-holiday-upload.file').element() as HTMLInputElement;
		const picked = new File([CSV], 'calendar.csv', { type: 'text/csv' });
		const transfer = new DataTransfer();
		transfer.items.add(picked);
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));

		await expect.element(page.getByTestId('esl-holiday-upload.submit')).toBeEnabled();
		// Direct DOM click: a sibling file's import failure can leave a Vite
		// error overlay over the page (pre-existing #203 breakage) that
		// swallows hit-tested clicks; .click() reaches the handler regardless
		// so this file stays green on its own merits.
		(page.getByTestId('esl-holiday-upload.submit').element() as HTMLButtonElement).click();

		await expect
			.element(page.getByTestId('esl-holiday-upload.success'))
			.toMatchTextContent(/2025.*2 rows.*1 off.*2 inserted.*0 updated.*0 deleted/);
		expect(mutationMock).toHaveBeenCalledOnce();
		const args = mutationMock.mock.calls[0]?.[1] as { year: string; csvText: string };
		expect(args.year).toBe('2025');
		expect(args.csvText).toContain('西元日期,星期,是否放假,備註');
		expect(args.csvText).toContain('20250101');
	});
});
