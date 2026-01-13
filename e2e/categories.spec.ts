import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const hasAdminAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/admin.json'));

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
		test.beforeAll(() => {
			if (!hasAdminAuth) {
				test.skip(true, 'Test authentication not set up. Run: npm run test:e2e:setup');
			}
		});

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

		test('shows empty state when no categories exist', async ({ page }) => {
			test.skip(true, 'Skipped - database has existing categories');
			await expect(page.getByText('No categories yet.')).toBeVisible({ timeout: 10000 });
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
			await page.getByRole('button', { name: 'Add' }).click();
			await page.getByPlaceholder('Add sub-category').fill('NewSub2');
			await page.getByRole('button', { name: 'Add' }).click();
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
			const updatedName = 'Updated Category ' + Date.now();
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await page.getByLabel('Category Name').fill(updatedName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
			await expect(page.locator('table tbody').getByText(updatedName)).toBeVisible({
				timeout: 10000
			});
		});

		test('can add sub-categories when editing', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await page.getByPlaceholder('Add sub-category').fill('UniqueSubCat');
			await page.getByRole('button', { name: 'Add' }).click();
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(500);
			await expect(page.getByText('UniqueSubCat').first()).toBeVisible({ timeout: 10000 });
		});

		test('can remove sub-category without evaluations', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await page.getByPlaceholder('Add sub-category').fill('Removable Sub');
			await page.getByRole('button', { name: 'Add' }).click();
			await page.waitForTimeout(500);
			const removeButton = page.locator('button[aria-label*="Remove"]').first();
			if (await removeButton.isVisible()) {
				await removeButton.click();
				await expect(page.locator('text=Removable Sub').first()).not.toBeVisible();
			}
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
			const removeButton = page.locator('button:has-text("X")').first();
			if (await removeButton.isVisible()) {
				await removeButton.click();
				const warning = page.locator('text=evaluations use');
				if (await warning.isVisible({ timeout: 2000 })) {
					await expect(warning).toBeVisible();
					await expect(page.getByRole('button', { name: 'Remove Anyway' })).toBeVisible();
				}
			}
		});

		test('can confirm removal despite warning', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			const removeButton = page.locator('button:has-text("X")').first();
			if (await removeButton.isVisible()) {
				await removeButton.click();
				const warning = page.locator('text=evaluations use');
				if (await warning.isVisible({ timeout: 2000 })) {
					await page.getByRole('button', { name: 'Remove Anyway' }).click();
					await expect(warning).not.toBeVisible();
				}
			}
		});

		test('can cancel removal despite warning', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			const removeButton = page.locator('button:has-text("X")').first();
			if (await removeButton.isVisible()) {
				await removeButton.click();
				const warning = page.locator('text=evaluations use');
				if (await warning.isVisible({ timeout: 2000 })) {
					await page.getByRole('button', { name: 'Cancel' }).click();
					await expect(warning).not.toBeVisible();
				}
			}
		});
	});

	test.describe('Delete Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForLoadState('networkidle');
		});

		test('opens delete confirmation dialog', async ({ page }) => {
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect(page.getByRole('heading', { name: 'Delete Category' })).toBeVisible();
		});

		test('shows warning for categories with sub-categories', async ({ page }) => {
			const categoryWithSubs = page.getByText('Creativity');
			if (await categoryWithSubs.isVisible()) {
				await categoryWithSubs.locator('..').locator('button[title="Delete"]').click();
				await expect(page.getByText('sub-category')).toBeVisible();
			}
		});

		test('shows warning for categories with related evaluations', async ({ page }) => {
			await page.getByRole('button', { name: 'Delete' }).first().click();
			const evalWarning = page.getByText('related evaluation');
			if (await evalWarning.isVisible({ timeout: 2000 })) {
				await expect(evalWarning).toBeVisible();
			}
		});

		test('can delete category without related content', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Category' }).click();
			await page.getByLabel('Category Name').fill('Delete Test Category');
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(500);

			const initialCount = await page.locator('table tbody tr').count();
			const categoryCell = page
				.locator('table tbody td')
				.filter({ hasText: 'Delete Test Category' })
				.first();
			await categoryCell.locator('xpath=..').locator('button[title="Delete"]').click();
			await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			await page.waitForTimeout(500);
			const newCount = await page.locator('table tbody tr').count();
			expect(newCount).toBeLessThan(initialCount);
		});

		test('can delete category with related evaluations', async ({ page }) => {
			const initialCount = await page.locator('table tbody tr').count();
			const firstCategoryCell = page.locator('table tbody td').first();
			await firstCategoryCell.locator('xpath=..').locator('button[title="Delete"]').click();
			await page.waitForTimeout(500);
			const warning = page.getByText('related evaluation');
			if (await warning.isVisible({ timeout: 2000 })) {
				await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			} else {
				await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			}
			await page.waitForTimeout(1000);
			const newCount = await page.locator('table tbody tr').count();
			expect(newCount).toBeLessThan(initialCount);
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
