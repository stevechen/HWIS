import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createMockEvaluationSet } from '../../fixtures/evaluations';

// Mock convex-svelte
const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: createMockEvaluationSet(),
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: mockQuery
	}))
}));

// Import after mocks
import TeacherEvaluationsPage from '$src/routes/evaluations/+page.svelte';

describe('Teacher Evaluations Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Static Structure', () => {
		it('renders New button', async () => {
			render(TeacherEvaluationsPage);
			// Use exact: true to avoid matching "Newest First" button
			await expect
				.element(page.getByRole('button', { name: 'New', exact: true }))
				.toBeInTheDocument();
		});

		it('renders student filter input', async () => {
			render(TeacherEvaluationsPage);
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by student' }))
				.toBeInTheDocument();
		});

		it('renders evaluations timeline', async () => {
			render(TeacherEvaluationsPage);
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});

	describe('Filter Functionality', () => {
		it('student filter input accepts text', async () => {
			render(TeacherEvaluationsPage);
			const studentFilter = page.getByRole('textbox', { name: 'Filter by student' });
			await studentFilter.fill('Alice');
			await expect.element(studentFilter).toHaveValue('Alice');
		});
	});

	describe('Card Navigation', () => {
		it('cards link to student pages', async () => {
			render(TeacherEvaluationsPage);
			// Cards should be links - check that at least one link exists
			const link = page.getByRole('link').first();
			await expect.element(link).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('New button has accessible name', async () => {
			render(TeacherEvaluationsPage);
			// Use exact: true to avoid matching "Newest First" button
			await expect
				.element(page.getByRole('button', { name: 'New', exact: true }))
				.toBeInTheDocument();
		});

		it('filter input has accessible label', async () => {
			render(TeacherEvaluationsPage);
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by student' }))
				.toBeInTheDocument();
		});

		it('timeline region has aria-label', async () => {
			render(TeacherEvaluationsPage);
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});

		it('cards are keyboard focusable', async () => {
			render(TeacherEvaluationsPage);
			const card = page.getByRole('button', { name: /Evaluation/ }).first();
			await expect.element(card).toHaveAttribute('tabindex', '0');
		});
	});
});
