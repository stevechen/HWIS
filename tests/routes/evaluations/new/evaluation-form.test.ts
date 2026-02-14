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

import EvaluationFormPage from '$src/routes/evaluations/new/+page.svelte';

describe('Evaluation Form', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows search input for filtering students', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByPlaceholder('Filter by name or ID...')).toBeInTheDocument();
	});

	it('renders submit button', async () => {
		render(EvaluationFormPage);
		await expect
			.element(page.getByRole('button', { name: 'Submit Evaluation' }))
			.toBeInTheDocument();
	});

	it('shows student count indicator', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByText('0 student(s) selected')).toBeInTheDocument();
	});
});
