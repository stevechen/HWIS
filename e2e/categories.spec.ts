import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createCategory,
	createStudentWithEvaluations,
	cleanupByTag,
	setE2eTag,
	useRole
} from './convex-client';

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
		await expect(page.getByRole('dialog', { name: 'Edit category' })).toBeVisible();
		await page.getByRole('textbox', { name: 'Category Name' }).fill(updatedName);

		// Select at least one CAS alignment checkbox (required field)
		await page.getByRole('checkbox', { name: 'Service' }).check();

		await page.getByRole('button', { name: 'Update' }).click();

		await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
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

	test.beforeEach(async () => {
		suffix = getTestSuffix('nameReflect');
		englishName = `English_${suffix}`;
		categoryName = `Category_${suffix}`;
		updatedName = `UpdatedCat_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		studentId = `S_${suffix}`;
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
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

	test('changing category name reflects in evaluation displays', async ({ page }) => {
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName}` }).getByText(categoryName)
		).toBeVisible();

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('table', { name: 'Categories' })).toBeVisible();

		const row = page.getByRole('row', { name: categoryName });
		await row.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('textbox', { name: 'Category Name' }).fill(updatedName);

		// Select at least one CAS alignment checkbox (required field)
		await page.getByRole('checkbox', { name: 'Service' }).check();

		await page.getByRole('button', { name: 'Update' }).click();
		await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();

		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName}` }).getByText(updatedName)
		).toBeVisible();
	});
});

test.describe('Categories - Delete Cascade Removes Evaluations @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let englishName: string;
	let categoryName: string;
	let e2eTag: string;
	let studentId: string;

	test.beforeEach(async () => {
		suffix = getTestSuffix('delCascEval');
		englishName = `English_${suffix}`;
		categoryName = `Category_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		studentId = `S_${suffix}`;
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag });
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

	test('deleting category cascade removes related evaluations', async ({ page }) => {
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName}` }).getByText(categoryName)
		).toBeVisible();

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('table', { name: 'Categories' })).toBeVisible();

		const row = page.getByRole('row', { name: categoryName });
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog')).not.toBeVisible();

		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName}` }).getByText(categoryName)
		).not.toBeVisible();
	});
});
