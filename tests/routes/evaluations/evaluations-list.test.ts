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

	it('renders page title as heading', async () => {
		render(EvaluationsPage);
		await expect
			.element(page.getByRole('heading', { name: 'Evaluation History' }))
			.toBeInTheDocument();
	});

	it('shows back button', async () => {
		render(EvaluationsPage);
		await expect.element(page.getByRole('button', { name: 'Back' })).toBeInTheDocument();
	});

	it('renders new evaluation button', async () => {
		render(EvaluationsPage);
		await expect.element(page.getByRole('button', { name: 'New Evaluation' })).toBeInTheDocument();
	});

	it('shows empty state when no evaluations', async () => {
		render(EvaluationsPage);
		await expect.element(page.getByText('No evaluations found')).toBeInTheDocument();
	});
});
