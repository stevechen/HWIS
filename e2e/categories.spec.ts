import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createCategory,
	createStudentWithEvaluations,
	cleanupByTag,
	setE2eTag,
	useRole
} from './convex-client';
import { AdminCategoriesPage, AdminEvaluationsPage } from './pages';

test.describe('Categories Management @categories', () => {
	test('redirects non-admin users from /admin/categories', async ({ page }) => {
		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/|\/login/);
	});
});

test.describe('Categories - Update Name', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('editCat');
	const categoryName = `Category_${suffix}`;
	const updatedName = `Updated_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testCategory = false;
	let categoriesPage: AdminCategoriesPage;

	test.beforeEach(async ({ page }) => {
		categoriesPage = new AdminCategoriesPage(page);
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag, casAlignment: ['Creativity'] });
		testCategory = true;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can update category name', async () => {
		await categoriesPage.expectCategoryVisible(categoryName);
		await categoriesPage.editCategory(categoryName, { name: updatedName });
		await categoriesPage.expectCategoryVisible(updatedName);
		await setE2eTag('categories', updatedName, e2eTag);
	});
});

test.describe('Categories - Name Change Reflects in Evaluations @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let englishName: string;
	let categoryName: string;
	let updatedName: string;
	let e2eTag: string;
	let studentId: string;
	let testCategory = false;
	let testStudent = false;
	let categoriesPage: AdminCategoriesPage;
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		categoriesPage = new AdminCategoriesPage(page);
		evalsPage = new AdminEvaluationsPage(page);
		suffix = getTestSuffix('nameReflect');
		englishName = `English_${suffix}`;
		categoryName = `Category_${suffix}`;
		updatedName = `UpdatedCat_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		studentId = `S_${suffix}`;
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag, casAlignment: ['Creativity'] });
		testCategory = true;
		await createStudentWithEvaluations({
			studentId,
			englishName,
			chineseName: 'test student',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testStudent = true;
	});

	test.afterEach(async () => {
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
		await cleanupByTag('evaluations', e2eTag);
	});

	test('changing category name reflects in evaluation displays', async () => {
		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();

		// Verify initial category name appears in evaluation
		const evalCard = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${englishName}"`)
		});
		await expect(evalCard.locator(`text="${categoryName}"`)).toBeVisible();

		await categoriesPage.goto();
		await categoriesPage.editCategory(categoryName, { name: updatedName });

		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();

		// Verify updated category name appears in evaluation
		const updatedEvalCard = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${englishName}"`)
		});
		await expect(updatedEvalCard.locator(`text="${updatedName}"`)).toBeVisible();
	});
});

test.describe('Categories - Delete Cascade Removes Evaluations @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let englishName: string;
	let categoryName: string;
	let e2eTag: string;
	let studentId: string;
	let categoriesPage: AdminCategoriesPage;
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		categoriesPage = new AdminCategoriesPage(page);
		evalsPage = new AdminEvaluationsPage(page);
		suffix = getTestSuffix('delCascEval');
		englishName = `English_${suffix}`;
		categoryName = `Category_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		studentId = `S_${suffix}`;
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag, casAlignment: ['Creativity'] });
		await createStudentWithEvaluations({
			studentId,
			englishName,
			chineseName: 'test student',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
	});

	test.afterEach(async () => {
		await cleanupByTag('categories', e2eTag);
		await cleanupByTag('students', e2eTag);
		await cleanupByTag('evaluations', e2eTag);
	});

	test('deleting category cascade removes related evaluations', async () => {
		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();

		// Verify initial category name appears in evaluation
		const evalCard = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${englishName}"`)
		});
		await expect(evalCard.locator(`text="${categoryName}"`)).toBeVisible();

		await categoriesPage.goto();
		await categoriesPage.deleteCategory(categoryName);

		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();

		// Verify evaluation is gone (cascade deleted)
		await expect(evalCard).not.toBeVisible();
	});
});
