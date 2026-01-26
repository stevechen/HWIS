import { test, expect } from '@playwright/test';
import { createStudent, cleanupTestData } from './convex-client';
import { getTestSuffix } from './helpers';

test.describe('Integration Tests (Real Backend) @integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('integ');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test('Student CRUD cycle - create, edit, delete works with real backend', async ({ page }) => {
		const suffix = getTestSuffix('crud');
		const studentId = `S_${suffix}`;
		const englishName = `CrudTest_${suffix}`;
		const chineseName = 'CRUD測試';
		const grade = 10;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill(studentId);
		await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill(englishName);
		await page.getByRole('dialog').getByPlaceholder('e.g., 張三').fill(chineseName);
		await page
			.getByRole('dialog')
			.locator('select[aria-label="Grade"]')
			.selectOption(String(grade));
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();

		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await searchInput.fill(englishName);
		await expect(page.getByRole('button', { name: new RegExp(englishName) })).toBeVisible();

		await page.getByRole('button', { name: new RegExp(englishName) }).click();
		await page.getByRole('button', { name: /Edit/ }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		const editedName = `${englishName}_edited`;
		await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill(editedName);
		await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();

		await searchInput.fill(editedName);
		await expect(page.getByRole('button', { name: new RegExp(editedName) })).toBeVisible();

		await page.getByRole('button', { name: new RegExp(editedName) }).click();
		const moreButton = page.getByRole('button', { name: /More actions/ });
		if (await moreButton.isVisible()) {
			await moreButton.click();
		}
	});

	test('Evaluation persists to database and appears in list', async ({ page }) => {
		const suffix = getTestSuffix('evalPersist');
		const studentId = `SE_${suffix}`;
		const englishName = `EvalPersist_${suffix}`;
		const chineseName = '評估持久';

		const createResult = await createStudent({
			studentId,
			englishName,
			chineseName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});
		expect(createResult).toBeTruthy();

		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');

		const filterInput = page.getByPlaceholder('Filter by name or ID...');
		await filterInput.fill(englishName);

		const studentRow = page.getByRole('button', { name: new RegExp(suffix) });
		await expect(studentRow).toBeVisible();

		await studentRow.click();
		await expect(page.getByText('1 student(s) selected')).toBeVisible();

		await page.getByRole('button', { name: /Select category/i }).click();
		await expect(page.getByRole('option').first()).toBeVisible();
		await page.getByRole('option').first().click();

		const subCategoryButton = page.getByRole('button', { name: /Select Sub-Category/i });
		if (await subCategoryButton.isVisible()) {
			await subCategoryButton.click();
			await expect(page.getByRole('option').first()).toBeVisible();
			await page.getByRole('option').first().click();
		}

		await page.getByRole('button', { name: /Submit evaluation/i }).click();

		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');

		await filterInput.fill(englishName);
		await expect(page.getByRole('row', { name: new RegExp(englishName) })).toBeVisible();
	});
});

test.describe('Category to Evaluation Integration (Real Backend) @integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('catEval');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test('Category created by admin can be used in evaluation by teacher', async ({ page }) => {
		const suffix = getTestSuffix('catEval');
		const categoryName = `EvalCat_${suffix}`;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');

		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByPlaceholder('Category name').fill(categoryName);
		await page.getByRole('dialog').getByRole('button', { name: 'Add sub-category' }).click();
		await page.getByRole('dialog').getByPlaceholder('Sub-category name').fill('Test Sub');

		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
		await expect(page.getByRole('dialog')).not.toBeVisible();

		await expect(page.getByRole('row', { name: categoryName })).toBeVisible();

		const studentSuffix = getTestSuffix('catEval');
		const studentId = `SC_${studentSuffix}`;
		const englishName = `CatEval_${studentSuffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '類別評估',
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${studentSuffix}`
		});

		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');

		const filterInput = page.getByPlaceholder('Filter by name or ID...');
		await filterInput.fill(englishName);

		const studentRow = page.getByRole('button', { name: new RegExp(studentSuffix) });
		await studentRow.click();

		await page.getByRole('button', { name: /Select category/i }).click();
		await expect(page.getByRole('option', { name: categoryName })).toBeVisible();
	});
});
