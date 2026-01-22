import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createCategory,
	createCategoryWithSubs,
	createEvalForCategory,
	cleanupTestData
} from './convex-client';

test.describe('Categories Management @categories', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.waitForSelector('body.hydrated');
	});

	test.describe('Access Control', () => {
		test('redirects non-admin users from /admin/categories', async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
			await expect(page).toHaveURL(/\/|\/login/);
		});
	});

	test.describe('Admin Access', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
		});

		test('can access categories page', async ({ page }) => {
			await expect(page).toHaveURL(/\/admin\/categories/);
			await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
		});

		test('displays page header with back button', async ({ page }) => {
			await expect(page.locator('button:has-text("Back to Admin")')).toBeVisible();
		});

		test('displays categories table', async ({ page }) => {
			await expect(page.locator('table')).toBeVisible();
		});

		test('displays theme toggle button', async ({ page }) => {
			await expect(page.locator('button[aria-label="Toggle theme"]').first()).toBeVisible();
		});
	});

	test.describe('Add Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			const suffix = getTestSuffix('addCat');
			await cleanupTestData(suffix);
		});

		test('opens add category form', async ({ page }) => {
			await page.getByRole('button', { name: 'Add new category' }).click();
			await expect(page.getByRole('heading', { name: 'Add New Category' })).toBeVisible();
		});

		test('can add category without sub-categories', async ({ page }) => {
			const suffix = getTestSuffix('addCat');
			const categoryName = `Category_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByLabel('Category Name').fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(categoryName)).toBeVisible();
		});

		test('can add category with sub-categories', async ({ page }) => {
			const suffix = getTestSuffix('addCatSubs');
			const categoryName = `Category_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByLabel('Category Name').fill(categoryName);
			await page.getByPlaceholder('Add sub-category').fill('Sub1');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await page.getByPlaceholder('Add sub-category').fill('Sub2');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(categoryName)).toBeVisible();
			await expect(page.getByText('Sub1').first()).toBeVisible();
			await expect(page.getByText('Sub2').first()).toBeVisible();
		});

		test('can cancel add form', async ({ page }) => {
			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByLabel('Category Name').fill('Test');
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByRole('heading', { name: 'Add New Category' })).not.toBeVisible();
		});
	});

	test.describe('Edit Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			const suffix = getTestSuffix('editCat');
			await cleanupTestData(suffix);
		});

		test('opens edit category form', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByRole('heading', { name: 'Edit Category' })).toBeVisible();
		});

		test.fixme('pre-fills form with category data', async ({ page }) => {
			const firstCategoryName = await page
				.locator('table tbody tr:nth-child(2) td:first-child')
				.textContent();
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByLabel('Category Name')).toHaveValue(firstCategoryName!);
		});

		test('can update category name', async ({ page }) => {
			const suffix = getTestSuffix('editCat');
			const categoryName = `Category_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByLabel('Category Name').fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(categoryName)).toBeVisible();

			const row = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await row.getByRole('button', { name: 'Edit' }).click();
			const updatedName = `Updated_${suffix}`;
			await page.getByLabel('Category Name').fill(updatedName);
			await page.getByRole('button', { name: 'Update' }).click();
			await expect(page.getByText(updatedName)).toBeVisible();
		});

		test('can add sub-categories when editing', async ({ page }) => {
			const suffix = getTestSuffix('editSub');
			const categoryName = `Category_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByLabel('Category Name').fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(categoryName)).toBeVisible();

			const row = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await row.getByRole('button', { name: 'Edit' }).click();
			await page.getByPlaceholder('Add sub-category').fill('UniqueSubCat');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(page.getByText('UniqueSubCat').first()).toBeVisible();
		});

		test('can remove sub-category without evaluations', async ({ page }) => {
			const suffix = getTestSuffix('editRem');
			const categoryName = `Category_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByLabel('Category Name').fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByText(categoryName)).toBeVisible();

			const row = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await row.getByRole('button', { name: 'Edit' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.getByPlaceholder('Add sub-category').fill('Removable Sub');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(page.getByText('Removable Sub').first()).toBeVisible();
			const removeButton = page.getByRole('dialog').locator('button[aria-label^="Remove"]').first();
			await expect(removeButton).toBeVisible();
			await removeButton.click();
			await expect(page.getByRole('dialog').getByText('Removable Sub')).not.toBeVisible();
		});
	});

	test.describe('Delete Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			const suffix = getTestSuffix('delCat');
			await cleanupTestData(suffix);
		});

		test('opens delete confirmation dialog for empty category', async ({ page }) => {
			const suffix = getTestSuffix('delEmpty');
			const categoryName = `Category_${suffix}`;

			await createCategory({
				name: categoryName,
				e2eTag: `e2e-test_${suffix}`
			});

			const row = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await expect(row).toBeVisible();

			await row.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Delete Category' })).toBeVisible();
		});

		test('shows warning for category with evaluations', async ({ page }) => {
			const suffix = getTestSuffix('delWithEval');
			const categoryName = `Category_${suffix}`;

			await createCategoryWithSubs({
				name: categoryName,
				subCategories: ['Sub1'],
				e2eTag: `e2e-test_${suffix}`
			});

			const row = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await expect(row).toBeVisible();

			await createEvalForCategory(categoryName);

			const evalRow = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await expect(evalRow).toBeVisible();

			await evalRow.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();

			await expect(
				page.getByText(/This category has sub-categories with evaluations/)
			).toBeVisible();
		});

		test('can delete category without related content', async ({ page }) => {
			const suffix = getTestSuffix('delNoRel');
			const categoryName = `Category_${suffix}`;

			await createCategory({
				name: categoryName,
				e2eTag: `e2e-test_${suffix}`
			});

			const row = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await expect(row).toBeVisible();

			await row.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();

			await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

			await expect(page.getByRole('dialog')).not.toBeVisible();

			await expect(
				page.locator('table tbody tr:has-text("' + categoryName + '")')
			).not.toBeVisible();
		});

		test('can delete category with cascade', async ({ page }) => {
			const suffix = getTestSuffix('delCasc');
			const categoryName = `Category_${suffix}`;

			await createCategoryWithSubs({
				name: categoryName,
				subCategories: ['Sub1'],
				e2eTag: `e2e-test_${suffix}`
			});

			await createEvalForCategory(categoryName);

			const row = page.locator('table tbody tr:has-text("' + categoryName + '")');
			await expect(row).toBeVisible();

			await row.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();

			await expect(
				page.getByText(/This category has sub-categories with evaluations/)
			).toBeVisible();

			await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

			await expect(page.getByRole('dialog')).not.toBeVisible();

			await expect(
				page.locator('table tbody tr:has-text("' + categoryName + '")')
			).not.toBeVisible();
		});
	});
});
