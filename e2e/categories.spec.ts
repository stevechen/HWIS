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
	});

	test.describe('Add Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		let testE2eTag: string | null = null;

		test.beforeEach(async ({ page }) => {
			testE2eTag = null;
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			try {
				if (testE2eTag) {
					await cleanupTestData(testE2eTag);
				}
			} catch {
				// Ignore cleanup errors
			}
		});

		test('opens add category form', async ({ page }) => {
			await page.getByRole('button', { name: 'Add new category' }).click();
			await expect(page.getByRole('heading', { name: 'Add New Category' })).toBeVisible();
		});

		test('can add category without sub-categories', async ({ page }) => {
			const suffix = getTestSuffix('addCat');
			const categoryName = `Category_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByRole('textbox', { name: 'Category Name' }).fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();
		});

		test('can add category with sub-categories', async ({ page }) => {
			const suffix = getTestSuffix('addCatSubs');
			const categoryName = `Category_${suffix}`;
			const sub1 = `Sub1_${suffix}`;
			const sub2 = `Sub2_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await expect(page.getByRole('textbox', { name: 'Category Name' })).toBeVisible();
			await page.getByRole('textbox', { name: 'Category Name' }).fill(categoryName);
			await page.getByRole('textbox', { name: 'Sub-categories' }).fill(sub1);
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await page.getByRole('textbox', { name: 'Sub-categories' }).fill(sub2);
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();
			await expect(page.getByRole('cell', { name: `${sub1} ${sub2}` })).toBeVisible();
		});

		test('can cancel add form', async ({ page }) => {
			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByRole('textbox', { name: 'Category Name' }).fill('Test');
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByRole('heading', { name: 'Add New Category' })).not.toBeVisible();
		});
	});

	test.describe('Edit Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		let testE2eTag: string | null = null;

		test.beforeEach(async ({ page }) => {
			testE2eTag = null;
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			try {
				if (testE2eTag) {
					await cleanupTestData(testE2eTag);
				}
			} catch {
				// Ignore cleanup errors
			}
		});

		test('opens edit category form', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByRole('heading', { name: 'Edit Category' })).toBeVisible();
		});

		test('pre-fills form with category data', async ({ page }) => {
			// Create a test category first to ensure we have one to edit
			const suffix = getTestSuffix('prefill');
			const categoryName = `PrefillTest_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			// Add a new category
			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByRole('textbox', { name: 'Category Name' }).fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();

			// Now click edit on this specific category
			const row = page.getByRole('row', { name: new RegExp(categoryName) });
			await row.getByRole('button', { name: 'Edit' }).click();

			// Wait for dialog to be visible
			await expect(page.getByRole('heading', { name: 'Edit Category' })).toBeVisible();

			// Wait for form to be populated
			const nameInput = page.getByRole('textbox', { name: 'Category Name' });
			await expect(nameInput).toBeVisible();

			// Verify the input has the expected value
			await expect(nameInput).toHaveValue(categoryName);
		});

		test('can update category name', async ({ page }) => {
			const suffix = getTestSuffix('editCat');
			const categoryName = `Category_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByRole('textbox', { name: 'Category Name' }).fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();

			const row = page.getByRole('row', { name: new RegExp(categoryName) });
			await row.getByRole('button', { name: 'Edit' }).click();
			const updatedName = `Updated_${suffix}`;
			await page.getByRole('textbox', { name: 'Category Name' }).fill(updatedName);
			await page.getByRole('button', { name: 'Update' }).click();
			await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
		});

		test('can add sub-categories when editing', async ({ page }) => {
			const suffix = getTestSuffix('editSub');
			const categoryName = `Category_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByRole('textbox', { name: 'Category Name' }).fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();

			const row = page.getByRole('row', { name: categoryName });
			await row.getByRole('button', { name: 'Edit' }).click();
			// Wait for dialog to be fully loaded before interacting with form fields
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.getByPlaceholder('Add sub-category').fill(`SubCat_${suffix}`);
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(page.getByText(`SubCat_${suffix}`)).toBeVisible();
		});

		test('can remove sub-category without evaluations', async ({ page }) => {
			const suffix = getTestSuffix('editRem');
			const categoryName = `Category_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await page.getByRole('button', { name: 'Add new category' }).click();
			await page.getByRole('textbox', { name: 'Category Name' }).fill(categoryName);
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();

			const row = page.getByRole('row', { name: categoryName });
			await row.getByRole('button', { name: 'Edit' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.getByRole('textbox', { name: 'Sub-Categories' }).fill('Removable Sub');
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(page.getByText('Removable Sub')).toBeVisible();
			const removeButton = page.getByRole('dialog').getByRole('button', { name: 'Remove' });
			await expect(removeButton).toBeVisible();
			await removeButton.click();
			await expect(page.getByRole('dialog').getByText('Removable Sub')).not.toBeVisible();
		});
	});

	test.describe('Delete Category', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		let testE2eTag: string | null = null;

		test.beforeEach(async ({ page }) => {
			testE2eTag = null;
			await page.goto('/admin/categories');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			try {
				if (testE2eTag) {
					await cleanupTestData(testE2eTag);
				}
			} catch {
				// Ignore cleanup errors
			}
		});

		test('opens delete confirmation dialog for empty category', async ({ page }) => {
			const suffix = getTestSuffix('delEmpty');
			const categoryName = `Category_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createCategory({
				name: categoryName,
				e2eTag: testE2eTag
			});

			const row = page.getByRole('row', { name: new RegExp(categoryName) });
			await expect(row).toBeVisible();

			await row.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await expect(
				page.getByRole('dialog').getByRole('heading', { name: 'Delete Category' })
			).toBeVisible();
		});

		test('shows warning for category with evaluations', async ({ page }) => {
			const suffix = getTestSuffix('delWithEval');
			const categoryName = `Category_${suffix}`;
			const sub1 = `Sub_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createCategoryWithSubs({
				name: categoryName,
				subCategories: [sub1],
				e2eTag: testE2eTag
			});

			const row = page.getByRole('row', { name: new RegExp(categoryName) });
			await expect(row).toBeVisible();

			await createEvalForCategory(categoryName);

			const evalRow = page.getByRole('row', { name: new RegExp(categoryName) });
			await expect(evalRow).toBeVisible();

			await evalRow.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();

			await expect(
				page.getByRole('dialog').getByText(/This category has sub-categories with evaluations/)
			).toBeVisible();
		});

		test('can delete category without related content', async ({ page }) => {
			const suffix = getTestSuffix('delNoRel');
			const categoryName = `Category_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createCategory({
				name: categoryName,
				e2eTag: testE2eTag
			});

			const row = page.getByRole('row', { name: new RegExp(categoryName) });
			await expect(row).toBeVisible();

			await row.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();

			await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

			await expect(page.getByRole('dialog')).not.toBeVisible();

			await expect(page.getByRole('row', { name: new RegExp(categoryName) })).not.toBeVisible();
		});

		test('can delete category with cascade', async ({ page }) => {
			const suffix = getTestSuffix('delCasc');
			const categoryName = `Category_${suffix}`;
			const sub1 = `Sub_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createCategoryWithSubs({
				name: categoryName,
				subCategories: [sub1],
				e2eTag: testE2eTag
			});

			await createEvalForCategory(categoryName);

			const row = page.getByRole('row', { name: new RegExp(categoryName) });
			await expect(row).toBeVisible();

			await row.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();

			await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

			await expect(page.getByRole('dialog')).not.toBeVisible();

			await expect(page.getByRole('row', { name: new RegExp(categoryName) })).not.toBeVisible();
		});
	});
});
