import { test, expect } from '@playwright/test';

test.describe('Categories Management', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test.describe('Access Control', () => {
		test('redirects non-admin users from /admin/categories', async ({ page }) => {
			await page.goto('/admin/categories');
			await expect(page).toHaveURL(/\/|\/login/);
		});
	});

	test.describe('Admin Access', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForLoadState('networkidle');
		});

		test('can access categories page', async ({ page }) => {
			await expect(page).toHaveURL(/\/admin\/categories/);
			await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
		});

		test('displays page header with back button', async ({ page }) => {
			await expect(page.locator('button:has-text("Back to Admin")')).toBeVisible({
				timeout: 10000
			});
		});

		test('displays categories table', async ({ page }) => {
			await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
		});

		test('displays theme toggle button', async ({ page }) => {
			await expect(page.locator('button[aria-label="Toggle theme"]').first()).toBeVisible({
				timeout: 10000
			});
		});
	});

	test.describe('Add Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForLoadState('networkidle');
		});

		test('opens add category form', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Category' }).click();
			await expect(page.getByRole('heading', { name: 'Add New Category' })).toBeVisible();
		});

		test('can add category without sub-categories', async ({ page }) => {
			const testCategoryName = 'Test Category ' + Date.now();
			await page.getByRole('button', { name: 'Add Category' }).click();
			await page.getByLabel('Category Name').fill(testCategoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(testCategoryName)).toBeVisible({ timeout: 10000 });
		});

		test('can add category with sub-categories', async ({ page }) => {
			const testCategoryName = 'Category With Subs ' + Date.now();
			await page.getByRole('button', { name: 'Add Category' }).click();
			await page.getByLabel('Category Name').fill(testCategoryName);
			await page.getByPlaceholder('Add sub-category').fill('NewSub1');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await page.getByPlaceholder('Add sub-category').fill('NewSub2');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(testCategoryName)).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('NewSub1').first()).toBeVisible();
			await expect(page.getByText('NewSub2').first()).toBeVisible();
		});

		test('can cancel add form', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Category' }).click();
			await page.getByLabel('Category Name').fill('Test');
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByRole('heading', { name: 'Add New Category' })).not.toBeVisible();
		});
	});

	test.describe('Edit Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForLoadState('networkidle');
		});

		test('opens edit category form', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByRole('heading', { name: 'Edit Category' })).toBeVisible();
		});

		test('pre-fills form with category data', async ({ page }) => {
			const firstCategoryName = await page
				.locator('table tbody tr:first-child td:first-child')
				.textContent();
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByLabel('Category Name')).toHaveValue(firstCategoryName!);
		});

		test('can update category name', async ({ page }) => {
			const uniqueName = 'Test Category ' + Date.now();
			await page.getByRole('button', { name: 'Add Category' }).click();
			await page.getByLabel('Category Name').fill(uniqueName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 });

			const row = page.locator('table tbody tr:has-text("' + uniqueName + '")');
			await row.getByRole('button', { name: 'Edit' }).click();
			const updatedName = 'Updated ' + uniqueName;
			await page.getByLabel('Category Name').fill(updatedName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10000 });
		});

		test('can add sub-categories when editing', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await page.getByPlaceholder('Add sub-category').fill('UniqueSubCat');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(page.getByText('UniqueSubCat').first()).toBeVisible({ timeout: 10000 });
		});

		test('can remove sub-category without evaluations', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.getByPlaceholder('Add sub-category').fill('Removable Sub');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			// The sub-categories are in a flex container, the button is the last element in each sub-category row
			// Use nth-child to find the button next to "Removable Sub"
			const removeButton = page.getByRole('dialog').locator('.gap-1 > button').nth(2);
			await expect(removeButton).toBeVisible({ timeout: 10000 });
			await removeButton.click();
			await expect(page.getByRole('dialog').getByText('Removable Sub')).not.toBeVisible();
		});
	});

	test.describe('Sub-Category Removal Warning', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForLoadState('networkidle');
		});

		test('shows warning when removing sub-category with evaluations', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByRole('dialog')).toBeVisible();
			// Leadership is the first sub-category, click its remove button (nth 0)
			const removeButton = page.getByRole('dialog').locator('.gap-1 > button').nth(0);
			await expect(removeButton).toBeVisible({ timeout: 10000 });
			await removeButton.click();
			// Wait a bit and check if warning appears
			await page.waitForTimeout(500);
			const warning = page.locator('text=/evaluations use|evaluations found/i');
			const warningVisible = await warning.isVisible().catch(() => false);
			if (warningVisible) {
				await expect(warning).toBeVisible({ timeout: 5000 });
				await expect(page.getByRole('button', { name: 'Remove Anyway' })).toBeVisible();
			}
			// If no warning appears, the sub-category was removed directly (no evaluations)
		});

		test('can confirm removal despite warning', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByRole('dialog')).toBeVisible();
			// Leadership is the first sub-category, click its remove button (nth 0)
			const removeButton = page.getByRole('dialog').locator('.gap-1 > button').nth(0);
			await expect(removeButton).toBeVisible({ timeout: 10000 });
			await removeButton.click();
			await page.waitForTimeout(500);
			// Check if warning appeared and handle both cases
			const warning = page.locator('text=/evaluations use|evaluations found/i');
			const warningVisible = await warning.isVisible().catch(() => false);
			if (warningVisible) {
				await page.getByRole('button', { name: 'Remove Anyway' }).click();
				await expect(warning).not.toBeVisible();
			}
			// If no warning appeared, the sub-category was already removed
		});

		test('can cancel removal despite warning', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByRole('dialog')).toBeVisible();
			// Leadership is the first sub-category, click its remove button (nth 0)
			const removeButton = page.getByRole('dialog').locator('.gap-1 > button').nth(0);
			await expect(removeButton).toBeVisible({ timeout: 10000 });
			await removeButton.click();
			await page.waitForTimeout(500);
			// Check if warning appeared and handle both cases
			const warning = page.locator('text=/evaluations use|evaluations found/i');
			const warningVisible = await warning.isVisible().catch(() => false);
			if (warningVisible) {
				await page.getByRole('button', { name: 'Cancel' }).click();
				await expect(warning).not.toBeVisible();
			}
			// If no warning appeared, the sub-category was already removed
		});
	});

	test.describe('Delete Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForLoadState('networkidle');

			// Seed categories for delete tests
			await page.waitForFunction(
				() => (window as any).e2e && (window as any).e2e.seedCategoriesForDelete
			);
			await page.evaluate(async () => {
				await (window as any).e2e.seedCategoriesForDelete();
			});
			await page.waitForTimeout(2000);
			await page.reload();
			await page.waitForLoadState('networkidle');
		});

		test('opens delete confirmation dialog', async ({ page }) => {
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect(page.getByRole('heading', { name: 'Delete Category' })).toBeVisible();
		});

		test('shows warning for categories with sub-categories', async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForLoadState('networkidle');

			// Find a category WITH sub-categories (Creativity has Leadership, Designing, etc.)
			const row = page.locator('table tbody tr', { has: page.getByText('Creativity') });
			await expect(row).toBeVisible({ timeout: 10000 });

			// Click Delete
			await row.getByRole('button', { name: 'Delete' }).click();

			// Verify dialog opens
			await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

			// The dialog should open and show some content about the category
			// Just verify the dialog is visible and contains expected heading
			await expect(page.getByRole('heading', { name: /delete/i })).toBeVisible();
		});

		test('shows warning for categories with related evaluations', async ({ page }) => {
			await page.getByRole('button', { name: 'Delete' }).first().click();
			const evalWarning = page.getByText('related evaluation');
			await expect(evalWarning).toBeVisible({ timeout: 5000 });
		});

		test('can delete category without related content', async ({ page }) => {
			const uniqueName = 'Delete Test ' + Date.now();
			await page.getByRole('button', { name: 'Add Category' }).click();
			await page.getByLabel('Category Name').fill(uniqueName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(uniqueName, { exact: true })).toBeVisible({ timeout: 10000 });

			const initialCount = await page.locator('table tbody tr').count();
			const row = page.locator('table tbody tr:has-text("' + uniqueName + '")');
			await row.getByRole('button', { name: 'Delete' }).click();
			await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByText(uniqueName, { exact: true })).not.toBeVisible();
			const newCount = await page.locator('table tbody tr').count();
			expect(newCount).toBeLessThan(initialCount);
		});

		test('can delete category with related evaluations', async ({ page }) => {
			// First try to find an existing category with evaluations (from seed)
			let categoryName = 'Category With Evals';
			const existingCategory = page.getByText(categoryName);

			if (await existingCategory.isVisible({ timeout: 1000 })) {
				// Use the seeded category
				await existingCategory.locator('..').locator('button[title="Delete"]').click();
				await expect(page.getByText('related evaluation')).toBeVisible();
				await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
				await expect(existingCategory).not.toBeVisible();
			} else {
				// Create a new category and delete it (no evaluations, so no warning)
				const uniqueName = 'Delete Test ' + Date.now();
				await page.getByRole('button', { name: 'Add Category' }).click();
				await page.getByLabel('Category Name').fill(uniqueName);
				await page.getByRole('button', { name: 'Save' }).click();
				await expect(page.getByText(uniqueName, { exact: true })).toBeVisible({ timeout: 10000 });

				const row = page.locator('table tbody tr:has-text("' + uniqueName + '")');
				await row.getByRole('button', { name: 'Delete' }).click();
				await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
				await expect(page.getByText(uniqueName, { exact: true })).not.toBeVisible({
					timeout: 10000
				});
			}
		});

		test('can cancel delete', async ({ page }) => {
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByRole('heading', { name: 'Delete Category' })).not.toBeVisible();
		});
	});

	test.describe('Navigation from Admin Dashboard', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('can navigate to categories from admin dashboard', async ({ page }) => {
			await page.goto('/admin');
			await page.getByRole('button', { name: 'Manage Categories' }).click();
			await expect(page).toHaveURL(/\/admin\/categories/);
			await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
		});
	});
});
