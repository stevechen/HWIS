import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: {
			houses: {
				Heracles: [],
				Wukong: [],
				Ixbalam: [],
				Setna: []
			},
			orphaned: []
		},
		isLoading: false,
		isStale: false,
		error: undefined
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

import HousesPage from '$src/routes/admin/houses/+page.svelte';

describe('Houses Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Structure', () => {
		it('renders four house regions', async () => {
			render(HousesPage);

			await expect
				.element(page.getByRole('region', { name: 'Heracles House' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('region', { name: 'Wukong House' })).toBeInTheDocument();
			await expect.element(page.getByRole('region', { name: 'Ixbalam House' })).toBeInTheDocument();
			await expect.element(page.getByRole('region', { name: 'Setna House' })).toBeInTheDocument();
		});

		it('renders house names in headers', async () => {
			render(HousesPage);

			await expect.element(page.getByText('Heracles')).toBeInTheDocument();
			await expect.element(page.getByText('Wukong')).toBeInTheDocument();
			await expect.element(page.getByText('Ixbalam')).toBeInTheDocument();
			await expect.element(page.getByText('Setna')).toBeInTheDocument();
		});

		it('renders unassigned students section', async () => {
			render(HousesPage);

			await expect
				.element(page.getByRole('region', { name: 'Unassigned Students' }))
				.toBeInTheDocument();
		});

		it('renders instructions text', async () => {
			render(HousesPage);

			await expect
				.element(page.getByText(/Drag and drop students between houses/))
				.toBeInTheDocument();
		});
	});

	describe('Loading State', () => {
		it('renders loading message when data is loading', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: null,
				isLoading: true,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await expect.element(page.getByText('Loading houses...')).toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('renders error message when query fails', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: null,
				isLoading: false,
				isStale: false,
				error: new Error('Failed to load')
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await expect.element(page.getByText('Error loading houses')).toBeInTheDocument();
		});
	});
});
