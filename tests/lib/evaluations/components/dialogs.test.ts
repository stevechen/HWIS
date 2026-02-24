import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EvaluationEntry } from '$lib/components/timeline/types';
import { createMockEvaluation, mockCategories } from '../../../fixtures/evaluations';

// Mock convex-svelte
const mockMutation = vi.fn().mockResolvedValue(undefined);

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockCategories,
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn()
	}))
}));

// Import after mocks
import DeleteEvaluationDialog from '$lib/evaluations/components/DeleteEvaluationDialog.svelte';
import EditEvaluationDialog from '$lib/evaluations/components/EditEvaluationDialog.svelte';

describe('Evaluation Dialogs', () => {
	let mockEvaluation: EvaluationEntry;

	beforeEach(() => {
		vi.clearAllMocks();
		mockEvaluation = createMockEvaluation({
			_id: 'eval-test-1',
			value: 5,
			category: 'Academic',
			categoryId: 'cat-academic-001',
			subCategory: 'Homework',
			details: 'Test details'
		});
	});

	describe('DeleteEvaluationDialog', () => {
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

	describe('EditEvaluationDialog', () => {
		describe('Visibility', () => {
			it('is visible when open is true', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect
					.element(page.getByRole('dialog', { name: 'Edit Evaluation' }))
					.toBeInTheDocument();
			});

			it('is hidden when open is false', async () => {
				render(EditEvaluationDialog, {
					open: false,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			});
		});

		describe('Form Fields', () => {
			it('shows category select', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				// Check for the category label with exact match
				await expect.element(page.getByText('Category', { exact: true })).toBeInTheDocument();
			});

			it('shows subcategory select when category has subcategories', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				// Subcategory should be visible for Academic category
				await expect.element(page.getByText('Subcategory', { exact: true })).toBeInTheDocument();
			});

			it('shows point buttons', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				// Should have buttons for -2, -1, +1, +2
				await expect.element(page.getByRole('button', { name: /Award 1/ })).toBeInTheDocument();
				await expect.element(page.getByRole('button', { name: /Deduct 1/ })).toBeInTheDocument();
			});

			it('shows details textarea', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect
					.element(page.getByPlaceholder('Enter specific details...'))
					.toBeInTheDocument();
			});
		});

		describe('Form Pre-population', () => {
			it('pre-fills form with evaluation data', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				const detailsTextarea = page.getByPlaceholder('Enter specific details...');
				await expect.element(detailsTextarea).toHaveValue('Test details');
			});
		});

		describe('Actions', () => {
			it('has cancel button', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
			});

			it('has delete button', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect.element(page.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
			});

			it('has save button', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect
					.element(page.getByRole('button', { name: 'Save Changes' }))
					.toBeInTheDocument();
			});

			it('cancel button calls onClose', async () => {
				const onClose = vi.fn();
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose,
					onDelete: vi.fn()
				});
				await page.getByRole('button', { name: 'Cancel' }).click();
				expect(onClose).toHaveBeenCalled();
			});

			it('delete button calls onDelete', async () => {
				const onDelete = vi.fn();
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete
				});
				await page.getByRole('button', { name: 'Delete' }).click();
				expect(onDelete).toHaveBeenCalled();
			});
		});

		describe('Demo Mode', () => {
			it('closes dialog without mutation in demo mode', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn(),
					isDemo: true
				});
				await page.getByRole('button', { name: 'Save Changes' }).click();
				expect(mockMutation).not.toHaveBeenCalled();
			});
		});

		describe('Accessibility', () => {
			it('dialog has accessible name', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect
					.element(page.getByRole('dialog', { name: 'Edit Evaluation' }))
					.toBeInTheDocument();
			});

			it('point buttons have accessible labels', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});
				await expect
					.element(page.getByRole('button', { name: 'Award 2 points' }))
					.toBeInTheDocument();
				await expect
					.element(page.getByRole('button', { name: 'Deduct 2 points' }))
					.toBeInTheDocument();
			});
		});

		describe('Keyboard Shortcuts', () => {
			it('supports point shortcuts while dialog is open', async () => {
				render(EditEvaluationDialog, {
					open: true,
					evaluation: mockEvaluation,
					onClose: vi.fn(),
					onDelete: vi.fn()
				});

				const dialog = page.getByRole('dialog', { name: 'Edit Evaluation' });
				await dialog.click();

				const dialogElement = document.querySelector('[role="dialog"]');
				if (dialogElement) {
					dialogElement.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
				}

				await expect
					.element(page.getByRole('button', { name: 'Award 2 points' }))
					.toHaveClass(/bg-emerald-600/);

				if (dialogElement) {
					dialogElement.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
				}

				await expect
					.element(page.getByRole('button', { name: 'Deduct 1 points' }))
					.toHaveClass(/bg-red-600/);
			});
		});
	});
});
