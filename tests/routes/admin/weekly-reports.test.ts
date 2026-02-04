import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin' } }
	}))
}));

import WeeklyReportsPage from '$src/routes/admin/weekly-reports/+page.svelte';

describe('Weekly Reports Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(WeeklyReportsPage);
		await expect.element(page.getByRole('heading', { name: 'Weekly Reports' })).toBeInTheDocument();
	});

	it('shows back to admin button', async () => {
		render(WeeklyReportsPage);
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('shows reports list table', async () => {
		render(WeeklyReportsPage);
		const main = page.getByRole('main', { name: 'Weekly Reports' });
		await expect.element(main.getByRole('table')).toBeInTheDocument();
	});

	it('displays all reports in reverse chronological order', async () => {
		render(WeeklyReportsPage);
		const table = page.getByRole('table');
		const rows = table.getByRole('row');
		// Row 1 should be Week 3 (most recent), row 2 should be Week 2, row 3 should be Week 1
		await expect.element(rows.nth(1).getByText('Week 3')).toBeInTheDocument();
		await expect.element(rows.nth(2).getByText('Week 2')).toBeInTheDocument();
		await expect.element(rows.nth(3).getByText('Week 1')).toBeInTheDocument();
		// Verify the order by checking that Week 3 is in row 1, Week 2 in row 2, Week 1 in row 3
		await expect.element(rows.nth(1).getByText('Week 3')).toBeInTheDocument();
		await expect.element(rows.nth(2).getByText('Week 2')).toBeInTheDocument();
		await expect.element(rows.nth(3).getByText('Week 1')).toBeInTheDocument();
	});

	it('shows formatted date ranges for each report', async () => {
		render(WeeklyReportsPage);
		const table = page.getByRole('table');
		await expect.element(table.getByText('Jan 13 - Jan 17, 2025')).toBeInTheDocument();
		await expect.element(table.getByText('Jan 06 - Jan 10, 2025')).toBeInTheDocument();
		await expect.element(table.getByText('Dec 30 - Jan 03, 2025')).toBeInTheDocument();
	});

	it('shows student count in reports list', async () => {
		render(WeeklyReportsPage);
		const table = page.getByRole('table');
		const rows = table.getByRole('row');
		const firstRow = rows.nth(1);
		await expect.element(firstRow.getByRole('cell').nth(2)).toHaveTextContent('3');
		const secondRow = rows.nth(2);
		await expect.element(secondRow.getByRole('cell').nth(2)).toHaveTextContent('5');
		const thirdRow = rows.nth(3);
		await expect.element(thirdRow.getByRole('cell').nth(2)).toHaveTextContent('4');
	});

	it('shows empty state when no reports available', async () => {
		render(WeeklyReportsPage);
		await expect.element(page.getByText('No weekly reports available yet.')).toBeInTheDocument();
	});

	it('opens report dialog when clicking a report row', async () => {
		render(WeeklyReportsPage);
		const table = page.getByRole('table');
		const firstRow = table.getByRole('row').nth(1);
		await firstRow.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: 'Week 3 Report' })).toBeInTheDocument();
	});

	it('closes dialog when clicking a close button', async () => {
		render(WeeklyReportsPage);
		const table = page.getByRole('table');
		const firstRow = table.getByRole('row').nth(1);
		await firstRow.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();

		// Test X button (second button in dialog header)
		const dialog = page.getByRole('dialog');
		const xButton = dialog.getByRole('button').nth(1);
		await xButton.click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('closes dialog when clicking the backdrop', async () => {
		render(WeeklyReportsPage);
		const table = page.getByRole('table');
		const firstRow = table.getByRole('row').nth(1);
		await firstRow.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		// Click on the body outside the dialog content to trigger backdrop close
		await page.getByText('Weekly Reports').click({ position: { x: 5, y: 5 } });
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});
