import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

// Mock categories data
const mockCategories = [
	{
		_id: 'cat-001',
		name: 'Leadership',
		subCategories: ['Teamwork', 'Initiative']
	},
	{
		_id: 'cat-002',
		name: 'Academic',
		subCategories: ['Homework', 'Exams']
	}
];

// Track mutation calls for verification
const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue(5); // Default evaluation count

vi.mock('convex-svelte', () => ({
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
	useQuery: vi.fn((_api: any) => {
		return { data: mockCategories, isLoading: false, error: null };
	}),
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

		it('shows subcategories in edit dialog', async () => {
			render(CategoriesPage);
			await expect.element(page.getByText('Leadership')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Edit' }).first().click();

			// Should show existing subcategories within the dialog
			const dialog = page.getByRole('dialog');
			await expect.element(dialog.getByText('Teamwork')).toBeInTheDocument();
			await expect.element(dialog.getByText('Initiative')).toBeInTheDocument();
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

describe('Categories Page - SubCategory Delete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockQuery.mockResolvedValue(3); // 3 evaluations in subcategory
	});

	it('shows confirmation dialog when removing subcategory with evaluations', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Leadership')).toBeInTheDocument();

		// Open edit dialog
		await page.getByRole('button', { name: 'Edit' }).first().click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();

		// Click remove on first subcategory (the × button with aria-label)
		const removeButton = page.getByRole('button', { name: /Remove Teamwork/ });
		await removeButton.click();

		// Should show warning dialog with correct aria-label
		const confirmDialog = page.getByRole('dialog', { name: 'Confirm remove sub-category' });
		await expect.element(confirmDialog).toBeInTheDocument();
	});

	it('shows evaluation count in subcategory delete warning', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Leadership')).toBeInTheDocument();

		// Open edit dialog
		await page.getByRole('button', { name: 'Edit' }).first().click();

		// Click remove on first subcategory
		const removeButton = page.getByRole('button', { name: /Remove Teamwork/ });
		await removeButton.click();

		// Should show the count in the warning
		await expect.element(page.getByText(/3 evaluation/)).toBeInTheDocument();
	});

	it('has cancel button in subcategory delete dialog', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Leadership')).toBeInTheDocument();

		// Open edit dialog
		await page.getByRole('button', { name: 'Edit' }).first().click();

		// Click remove on first subcategory
		const removeButton = page.getByRole('button', { name: /Remove Teamwork/ });
		await removeButton.click();

		// Should have cancel button in the confirm dialog
		const confirmDialog = page.getByRole('dialog', { name: 'Confirm remove sub-category' });
		await expect.element(confirmDialog.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('has confirm button in subcategory delete dialog', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Leadership')).toBeInTheDocument();

		// Open edit dialog
		await page.getByRole('button', { name: 'Edit' }).first().click();

		// Click remove on first subcategory
		const removeButton = page.getByRole('button', { name: /Remove Teamwork/ });
		await removeButton.click();

		// Should have Remove button for confirmation
		const confirmDialog = page.getByRole('dialog', { name: 'Confirm remove sub-category' });
		await expect.element(confirmDialog.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
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
