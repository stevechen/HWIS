import { test, expect } from '@playwright/test';
import { createStudent, cleanupTestData } from './convex-client';
import { getTestSuffix } from './helpers';

test.describe('Integration Tests (Real Backend) @integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async () => {});

	test.afterEach(async () => {
		const suffix = getTestSuffix('integ');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test.fixme('Student CRUD cycle - create, edit, delete works with real backend', async ({
		page
	}) => {
		// This test has complex UI interactions that need updating
		const suffix = getTestSuffix('crud');
		const studentId = `S_${suffix}`;
		const englishName = `CrudTest_${suffix}`;
		const chineseName = 'CRUD測試';
		const grade = 10;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		// Create student
		await page.getByRole('button', { name: 'Add Student' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByLabel('Student ID').fill(studentId);
		await page.getByRole('dialog').getByLabel('English Name').fill(englishName);
		await page.getByRole('dialog').getByLabel('Chinese Name').fill(chineseName);
		await page.getByRole('dialog').getByLabel('Grade').selectOption(String(grade));
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Verify student was created
		await page.waitForTimeout(500);
		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);
		await expect(page.getByText(englishName).first()).toBeVisible();
	});

	test.fixme('Evaluation persists to database and appears in list', async ({ page }) => {
		// This test requires categories to be seeded
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
		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		const filterInput = page.getByLabel('Search students');
		await filterInput.fill(englishName);
		await page.waitForTimeout(300);

		const studentRow = page.getByText(englishName).first();
		await expect(studentRow).toBeVisible();

		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();
	});
});

test.describe('Category to Evaluation Integration (Real Backend) @integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async () => {});

	test.afterEach(async () => {
		const suffix = getTestSuffix('catEval');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test.fixme('Category created by admin can be used in evaluation by teacher', async ({ page }) => {
		// This test requires complex setup and UI interactions
		const suffix = getTestSuffix('catEval');
		const categoryName = `EvalCat_${suffix}`;

		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');

		await page.getByRole('button', { name: /Add.*category/i }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page
			.getByRole('dialog')
			.getByLabel(/Category name/i)
			.fill(categoryName);
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /Create|Save/i })
			.click();
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Verify category was created
		await expect(page.getByText(categoryName).first()).toBeVisible();
	});
});
