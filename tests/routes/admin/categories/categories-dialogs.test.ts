import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

// Mock categories data
const mockCategories = [
	{
		_id: 'cat-001',
		name: 'Leadership'
	},
	{
		_id: 'cat-002',
		name: 'Academic'
	}
];

// Track mutation calls for verification
const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue(5); // Default evaluation count

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockCategories,
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: mockQuery
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin' } }
	}))
}));

import CategoriesPage from '$src/routes/admin/categories/+page.svelte';

describe('Categories Page - Delete Dialogs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockQuery.mockResolvedValue(5); // Reset to 5 evaluations
	});

	describe('Category Delete Dialog', () => {
		it('opens delete confirmation dialog', async () => {
			render(CategoriesPage);
			await expect.element(page.getByText('Leadership')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect
				.element(page.getByRole('heading', { name: 'Delete Category' }))
				.toBeInTheDocument();
		});

		it('shows warning when category has evaluations', async () => {
			render(CategoriesPage);
			await expect.element(page.getByText('Leadership')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Delete' }).first().click();

			// Should show evaluation count warning
			await expect.element(page.getByText(/This category has evaluations/)).toBeInTheDocument();
			await expect.element(page.getByText(/5 evaluation/)).toBeInTheDocument();
		});

		it('has cancel button in delete dialog', async () => {
			render(CategoriesPage);
			await expect.element(page.getByText('Leadership')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});

		it('has confirm delete button in dialog', async () => {
			render(CategoriesPage);
			await expect.element(page.getByText('Leadership')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Delete' }).first().click();
			// The confirm button should have "Delete" text (exact match to distinguish from the row button)
			await expect
				.element(page.getByRole('dialog').getByRole('button', { name: 'Delete' }))
				.toBeInTheDocument();
		});
	});

	describe('Edit Dialog', () => {
		it('opens edit category dialog', async () => {
			render(CategoriesPage);
			await expect.element(page.getByText('Leadership')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect
				.element(page.getByRole('heading', { name: 'Edit Category' }))
				.toBeInTheDocument();
		});

		it('pre-fills form with category data', async () => {
			render(CategoriesPage);
			await expect.element(page.getByText('Leadership')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Edit' }).first().click();

			await expect
				.element(page.getByRole('textbox', { name: 'Category Name' }))
				.toHaveValue('Leadership');
		});
	});
});

describe('Categories Page - Add Form', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('opens add category form', async () => {
		render(CategoriesPage);
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Add New Category' }))
			.toBeInTheDocument();
	});

	it('has category name input in add form', async () => {
		render(CategoriesPage);
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect.element(page.getByRole('textbox', { name: 'Category Name' })).toBeInTheDocument();
	});

	it('has cancel button in add form', async () => {
		render(CategoriesPage);
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});
});

describe('Categories Page - Rename Toast', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockQuery.mockResolvedValue(5); // 5 evaluations affected
		mockMutation.mockResolvedValue(undefined);
	});

	it('shows toast notification when renaming category with evaluations', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Leadership')).toBeInTheDocument();

		// Open edit dialog
		await page.getByRole('button', { name: 'Edit' }).first().click();

		// Change the category name
		const nameInput = page.getByRole('textbox', { name: 'Category Name' });
		await nameInput.fill('Updated Leadership');

		// Submit the form
		await page.getByRole('button', { name: 'Update' }).click();

		// Toast should appear
		await expect.element(page.getByRole('alert')).toBeInTheDocument();
	});

	it('shows evaluation count in rename toast', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Leadership')).toBeInTheDocument();

		// Open edit dialog
		await page.getByRole('button', { name: 'Edit' }).first().click();

		// Change the category name
		const nameInput = page.getByRole('textbox', { name: 'Category Name' });
		await nameInput.fill('Updated Leadership');

		// Submit the form
		await page.getByRole('button', { name: 'Update' }).click();

		// Toast should show evaluation count
		await expect
			.element(page.getByText(/5 evaluation.*now display the new name/))
			.toBeInTheDocument();
	});

	it('does not show toast when category has no evaluations', async () => {
		mockQuery.mockResolvedValue(0); // No evaluations

		render(CategoriesPage);
		await expect.element(page.getByText('Leadership')).toBeInTheDocument();

		// Open edit dialog
		await page.getByRole('button', { name: 'Edit' }).first().click();

		// Change the category name
		const nameInput = page.getByRole('textbox', { name: 'Category Name' });
		await nameInput.fill('Updated Leadership');

		// Submit the form
		await page.getByRole('button', { name: 'Update' }).click();

		// Toast should NOT appear (wait a bit to ensure it doesn't appear)
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});
});
