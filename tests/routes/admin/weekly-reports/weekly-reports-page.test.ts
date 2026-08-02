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
		data: { user: { name: 'Test Admin', role: 'admin' } }
	}))
}));

import WeeklyReportsPage from '$src/routes/admin/weekly-reports/+page.svelte';

describe('Weekly Reports Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Structure', () => {
		it('renders main region with aria-label', async () => {
			render(WeeklyReportsPage);
			await expect.element(page.getByRole('main', { name: 'Weekly Reports' })).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('renders empty state when no reports', async () => {
			render(WeeklyReportsPage);
			await expect.element(page.getByText('No weekly reports available yet.')).toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('renders error state when the reports query fails', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValueOnce({
				data: null,
				isLoading: false,
				error: new Error('Failed to load')
			} as unknown as ReturnType<typeof useQuery>);

			render(WeeklyReportsPage);
			await expect.element(page.getByText(/Error loading reports/)).toBeInTheDocument();
		});
	});
});
