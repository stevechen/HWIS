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

	it('renders main element with aria-label', async () => {
		render(WeeklyReportsPage);
		await expect.element(page.getByRole('main', { name: 'Weekly Reports' })).toBeInTheDocument();
	});

	it('shows empty state when no reports available', async () => {
		render(WeeklyReportsPage);
		await expect.element(page.getByText('No weekly reports available yet.')).toBeInTheDocument();
	});
});
