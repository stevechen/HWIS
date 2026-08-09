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

import EvaluationsPage from '$src/routes/evaluations/+page.svelte';

describe('Evaluations List', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows empty state when no evaluations', async () => {
		render(EvaluationsPage);
		await expect.element(page.getByText('No evaluations found')).toBeInTheDocument();
	});

	it('renders error state when the evaluations query fails', async () => {
		const { useQuery } = await import('convex-svelte');
		// The page makes 3 useQuery calls in order: viewer, capabilities, listRecent.
		// Mock viewer and capabilities as success, then listRecent with an error.
		vi.mocked(useQuery)
			.mockReturnValueOnce({
				data: { role: 'admin', status: 'active' },
				isLoading: false,
				error: null
			} as unknown as ReturnType<typeof useQuery>)
			.mockReturnValueOnce({
				data: {
					actor: { kind: 'staff', subject: { role: 'admin', status: 'active' } },
					capabilities: {}
				},
				isLoading: false,
				error: null
			} as unknown as ReturnType<typeof useQuery>)
			.mockReturnValueOnce({
				data: null,
				isLoading: false,
				error: new Error('Failed to load')
			} as unknown as ReturnType<typeof useQuery>);

		render(EvaluationsPage);
		await expect.element(page.getByText(/Error loading evaluations/)).toBeInTheDocument();
	});
});
