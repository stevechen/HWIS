import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockMutation = vi.fn().mockResolvedValue({});

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [
			{ board: 'houses', enabled: true, theme: 'default', updatedAt: 0 },
			{ board: 'classes', enabled: false, theme: 'christmas', updatedAt: 0 }
		],
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn().mockResolvedValue({})
	}))
}));

import LeaderboardsPage from '$src/routes/admin/leaderboards/+page.svelte';

describe('Admin Leaderboards Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(LeaderboardsPage);
		await expect
			.element(page.getByRole('heading', { name: 'Leaderboard Management' }))
			.toBeInTheDocument();
	});

	it('shows back to admin link', async () => {
		render(LeaderboardsPage);
		await expect.element(page.getByRole('link', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('renders both board cards with status badges', async () => {
		render(LeaderboardsPage);
		await expect.element(page.getByTestId('admin-leaderboards.card-houses')).toBeInTheDocument();
		await expect.element(page.getByTestId('admin-leaderboards.card-classes')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('admin-leaderboards.status-houses'))
			.toHaveTextContent('Enabled');
		await expect
			.element(page.getByTestId('admin-leaderboards.status-classes'))
			.toHaveTextContent('Disabled');
	});

	it('renders theme selectors and open buttons', async () => {
		render(LeaderboardsPage);
		await expect.element(page.getByTestId('admin-leaderboards.theme-houses')).toBeInTheDocument();
		await expect.element(page.getByTestId('admin-leaderboards.theme-classes')).toBeInTheDocument();
		await expect.element(page.getByTestId('admin-leaderboards.open-houses')).toBeInTheDocument();
		await expect.element(page.getByTestId('admin-leaderboards.open-classes')).toBeInTheDocument();
	});

	it('renders preview placeholders', async () => {
		render(LeaderboardsPage);
		await expect.element(page.getByTestId('admin-leaderboards.preview-houses')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('admin-leaderboards.preview-classes'))
			.toBeInTheDocument();
	});
});
