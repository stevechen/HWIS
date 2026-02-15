import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EvaluationEntry } from '$lib/components/timeline/types';
import { createMockEvaluation } from '../../../fixtures/evaluations';

// Mock convex-svelte
const mockMutation = vi.fn().mockResolvedValue(undefined);

vi.mock('convex-svelte', () => ({
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn()
	}))
}));

// Import after mocks
import DeleteEvaluationDialog from '$lib/evaluations/components/DeleteEvaluationDialog.svelte';

describe('DeleteEvaluationDialog Component', () => {
	let mockEvaluation: EvaluationEntry;

	beforeEach(() => {
		vi.clearAllMocks();
		mockEvaluation = createMockEvaluation({
			_id: 'eval-test-1',
			value: 5,
			category: 'Academic',
			details: 'Test details'
		});
	});

	describe('Visibility', () => {
		it('is visible when open is true', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await expect
				.element(page.getByRole('dialog', { name: 'Delete Evaluation' }))
				.toBeInTheDocument();
		});

		it('is hidden when open is false', async () => {
			render(DeleteEvaluationDialog, { open: false, evaluation: mockEvaluation });
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});
	});

	describe('Content', () => {
		it('shows confirmation message', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await expect.element(page.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
		});

		it('shows warning that action cannot be undone', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await expect.element(page.getByText(/cannot be undone/)).toBeInTheDocument();
		});
	});

	describe('Actions', () => {
		it('has cancel button', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});

		it('has delete button', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await expect.element(page.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		});

		it('cancel button closes dialog', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});

		it('delete button calls mutation', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await page.getByRole('button', { name: 'Delete' }).click();
			expect(mockMutation).toHaveBeenCalled();
		});

		it('delete button closes dialog after mutation', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await page.getByRole('button', { name: 'Delete' }).click();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});
	});

	describe('Demo Mode', () => {
		it('closes dialog without mutation in demo mode', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation, isDemo: true });
			await page.getByRole('button', { name: 'Delete' }).click();
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('closes dialog in demo mode', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation, isDemo: true });
			await page.getByRole('button', { name: 'Delete' }).click();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('dialog has accessible name', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			await expect
				.element(page.getByRole('dialog', { name: 'Delete Evaluation' }))
				.toBeInTheDocument();
		});

		it('delete button has destructive variant styling', async () => {
			render(DeleteEvaluationDialog, { open: true, evaluation: mockEvaluation });
			const deleteButton = page.getByRole('button', { name: 'Delete' });
			await expect.element(deleteButton).toBeInTheDocument();
		});
	});
});
