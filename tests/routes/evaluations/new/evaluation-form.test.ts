import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockCategories = [
	{
		_id: 'c001',
		name: 'Academic',
		subCategories: ['Homework', 'Test']
	}
];

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn((_api: unknown) => {
		const apiStr = JSON.stringify(_api);
		if (apiStr.includes('categories.list')) {
			return { data: mockCategories, loading: false, error: null };
		}
		return { data: [], loading: false, error: null };
	}),
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

	it('renders page title as heading', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByRole('heading', { name: 'New Evaluation' })).toBeInTheDocument();
	});

	it('shows back button', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByRole('button', { name: 'Back' })).toBeInTheDocument();
	});

	it('shows search input for filtering students', async () => {
		render(EvaluationFormPage);
		await expect
			.element(page.getByRole('textbox', { name: 'Search students' }))
			.toBeInTheDocument();
	});

	it('shows points selection buttons', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByRole('button', { name: 'Award 1 points' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Award 2 points' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Deduct 1 points' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Deduct 2 points' })).toBeInTheDocument();
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

	it('shows theme toggle button', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
	});
});
