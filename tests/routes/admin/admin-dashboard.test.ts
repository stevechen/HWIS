import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => {
	return {
		useQuery: vi.fn(() => ({
			data: { role: 'admin' },
			isLoading: false,
			error: null
		})),
		useConvexClient: vi.fn(() => ({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		}))
	};
});

import AdminDashboard from '$src/routes/admin/+page.svelte';

describe('Admin Dashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders core navigation links', async () => {
		render(AdminDashboard);
		await expect
			.element(page.getByRole('link', { name: 'Student Management' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Categories' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'User Accounts' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'All Evaluations' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Weekly Reports' })).toBeInTheDocument();
	});

	it('shows settings links after expanding settings section', async () => {
		render(AdminDashboard);
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect.element(page.getByRole('link', { name: 'Backup' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Archive & Reset' })).toBeInTheDocument();
	});
});
