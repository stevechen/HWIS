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
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		await expect.element(page.getByRole('heading', { name: 'Weekly Reports' })).toBeInTheDocument();
	});

	it('shows back to admin button', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('shows reports list table', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		const main = page.getByRole('main', { name: 'Weekly Reports' });
		await expect.element(main.getByRole('table')).toBeInTheDocument();
	});

	it('displays all reports in reverse chronological order', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		const table = page.getByRole('table');
		await expect.element(table.getByRole('cell', { name: '3' }).first()).toBeInTheDocument();
		await expect.element(table.getByRole('cell', { name: '2' }).first()).toBeInTheDocument();
		await expect.element(table.getByRole('cell', { name: '1' }).first()).toBeInTheDocument();
	});

	it('shows formatted date ranges for each report', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		const table = page.getByRole('table');
		await expect.element(table.getByText('Jan 13 - Jan 17, 2025')).toBeInTheDocument();
		await expect.element(table.getByText('Jan 06 - Jan 10, 2025')).toBeInTheDocument();
		await expect.element(table.getByText('Dec 30 - Jan 03, 2025')).toBeInTheDocument();
	});

	it('shows student count in reports list', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
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
		vi.mock('convex-svelte', () => ({
			useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
			useConvexClient: vi.fn(() => ({
				mutation: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({})
			}))
		}));
		render(WeeklyReportsPage, { props: { data: { demoMode: false } } });
		await expect.element(page.getByText('No weekly reports available yet.')).toBeInTheDocument();
	});

	it('opens report dialog when clicking a report row', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		const table = page.getByRole('table');
		const firstRow = table.getByRole('row').nth(1);
		await firstRow.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: 'Week 3 Report' })).toBeInTheDocument();
	});

	it('closes dialog when clicking the Close button', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		const table = page.getByRole('table');
		const firstRow = table.getByRole('row').nth(1);
		await firstRow.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		const closeButton = page.getByRole('button', { name: 'Close' }).first();
		await closeButton.click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('closes dialog when clicking the X button', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		const table = page.getByRole('table');
		const firstRow = table.getByRole('row').nth(1);
		await firstRow.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		const xButton = page.getByRole('button', { name: 'Close' }).first();
		await xButton.click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('closes dialog when clicking the backdrop', async () => {
		render(WeeklyReportsPage, { props: { data: { demoMode: true } } });
		const table = page.getByRole('table');
		const firstRow = table.getByRole('row').nth(1);
		await firstRow.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		const dialog = page.getByRole('dialog');
		await dialog.click({ position: { x: 10, y: 10 } });
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});
