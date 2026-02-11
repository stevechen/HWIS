import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createCategory,
	createCategoryWithSubs,
	createEvaluationForStudent,
	createStudent,
	cleanupByTag,
	setE2eTag,
	useRole
} from './convex-client';

// Helper for tests that need data seeded
function createTestCategory(suffix: string) {
	const categoryName = `Category_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	return { categoryName, e2eTag };
}

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
});

test.describe('Categories - Add Form UI - Open Add', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('opens add category form', async ({ page }) => {
		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect(page.getByRole('heading', { name: 'Add New Category' })).toBeVisible();
	});
});

test.describe('Categories - Add Form UI - Cancel', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('can cancel add form', async ({ page }) => {
		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect(page.getByRole('heading', { name: 'Add New Category' })).toBeVisible();
		await page.getByRole('textbox', { name: 'Category Name' }).fill('Test');
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByRole('heading', { name: 'Add New Category' })).not.toBeVisible();
	});
});

test.describe('Categories - Add Form UI - Open Edit', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });
	let testCategory = false;
	const suffix = getTestSuffix('editForm');
	const { categoryName, e2eTag } = createTestCategory(suffix);
	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('opens edit category form', async ({ page }) => {
		await page
			.getByRole('row', { name: categoryName })
			.getByRole('button', { name: 'Edit' })
			.first()
			.click();
		await expect(page.getByRole('heading', { name: 'Edit Category' })).toBeVisible();
	});
});

test.describe('Categories - Add Without Subs', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('addCat');
	const { categoryName, e2eTag } = createTestCategory(suffix);
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can add category without sub-categories', async ({ page }) => {
		// Verify the category appears in the list
		await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();
	});
});

test.describe('Categories - Add With Subs', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('addCatSubs');
	const categoryName = `Category_${suffix}`;
	const sub1 = `Sub1_${suffix}`;
	const sub2 = `Sub2_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategoryWithSubs({ name: categoryName, subCategories: [sub1, sub2], e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can add category with sub-categories', async ({ page }) => {
		// Verify the category with sub-categories appears in the list
		await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();
		await expect(page.getByRole('cell', { name: `${sub1} ${sub2}` })).toBeVisible();
	});
});

test.describe('Categories - Pre-fill Edit', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('prefill');
	const { categoryName, e2eTag } = createTestCategory(suffix);
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('pre-fills form with category data', async ({ page }) => {
		await expect(page.getByRole('row', { name: categoryName })).toBeVisible();

		// Click edit on this specific category
		const row = page.getByRole('row', { name: categoryName });
		await row.getByRole('button', { name: 'Edit' }).click();

		// Wait for dialog to be visible
		await expect(page.getByRole('heading', { name: 'Edit Category' })).toBeVisible();

		// Wait for form to be populated
		const nameInput = page.getByRole('textbox', { name: 'Category Name' });
		await expect(nameInput).toBeVisible();

		// Verify the input has the expected value
		await expect(nameInput).toHaveValue(categoryName);
	});
});

test.describe('Categories - Update Name', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('editCat');
	const categoryName = `Category_${suffix}`;
	const updatedName = `Updated_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can update category name', async ({ page }) => {
		await expect(page.getByRole('row', { name: categoryName })).toBeVisible();

		const row = page.getByRole('row', { name: categoryName });
		await row.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('textbox', { name: 'Category Name' }).fill(updatedName);
		await page.getByRole('button', { name: 'Update' }).click();

		// Wait for the rename to be visible before tagging (timing fix)
		await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();

		// Update tag for the renamed category
		await setE2eTag('categories', updatedName, e2eTag);
	});
});

test.describe('Categories - Add Subs When Editing', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('editSub');
	const { categoryName, e2eTag } = createTestCategory(suffix);
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can add sub-categories when editing', async ({ page }) => {
		await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();

		const row = page.getByRole('row', { name: categoryName });
		await row.getByRole('button', { name: 'Edit' }).click();
		// Wait for dialog to be fully loaded before interacting with form fields
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByPlaceholder('Add sub-category').fill(`SubCat_${suffix}`);
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText(`SubCat_${suffix}`)).toBeVisible();
	});
});

test.describe('Categories - Remove Sub', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('editRem');
	const { categoryName, e2eTag } = createTestCategory(suffix);
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can remove sub-category without evaluations', async ({ page }) => {
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

test.describe('Categories - Delete Dialog Empty', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('delEmpty');
	const { categoryName, e2eTag } = createTestCategory(suffix);
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('opens delete confirmation dialog for empty category', async ({ page }) => {
		const row = page.getByRole('row', { name: categoryName });
		await expect(row).toBeVisible();

		await row.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(
			page.getByRole('dialog').getByRole('heading', { name: 'Delete Category' })
		).toBeVisible();
	});
});

test.describe('Categories - Delete Warning', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let categoryName: string;
	let sub1: string;
	let e2eTag: string;
	let studentId: string;

	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;

	test.beforeEach(async ({ page }) => {
		suffix = getTestSuffix('delWithEval');
		categoryName = `Category_${suffix}`;
		sub1 = `Sub_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		studentId = `S_${suffix}`;
		useRole('admin');
		// Create student first
		await createStudent({ studentId, englishName: `Test_${suffix}`, grade: 10, e2eTag });
		testStudent = true;
		// Create category with subcategories
		await createCategoryWithSubs({ name: categoryName, subCategories: [sub1], e2eTag });
		testCategory = true;
		// Create evaluation for the student with the category
		await createEvaluationForStudent({ studentId, e2eTag });
		testEvaluation = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('shows warning for category with evaluations', async ({ page }) => {
		const row = page.getByRole('row', { name: categoryName });
		await expect(row).toBeVisible();

		await row.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await expect(
			page.getByRole('dialog').getByText(/This category has sub-categories with evaluations/)
		).toBeVisible();
	});
});

test.describe('Categories - Delete Simple', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// let categoryName: string = '';
	// let e2eTag: string;
	let testCategory = false;
	const suffix = getTestSuffix('delNoRel');
	const { categoryName, e2eTag } = createTestCategory(suffix);

	test.beforeEach(async ({ page }) => {
		// suffix = getTestSuffix('delNoRel');
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can delete category without related content', async ({ page }) => {
		const row = page.getByRole('row', { name: categoryName });
		await expect(row).toBeVisible();

		await row.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Category was deleted, reset flag to skip afterEach cleanup
		testCategory = false;
	});
});

test.describe('Categories - Delete Cascade', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let categoryName: string;
	let sub1: string;
	let e2eTag: string;
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		suffix = getTestSuffix('delCasc');
		categoryName = `Category_${suffix}`;
		sub1 = `Sub_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		useRole('admin');
		await createCategoryWithSubs({ name: categoryName, subCategories: [sub1], e2eTag });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can delete category with cascade', async ({ page }) => {
		const row = page.getByRole('row', { name: categoryName });
		await expect(row).toBeVisible();

		await row.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Category was deleted, reset flag to skip afterEach cleanup
		testCategory = false;
	});
});
