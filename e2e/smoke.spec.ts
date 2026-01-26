import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Smoke Tests @smoke', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('smoke');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test('Teacher creates evaluation - full UI flow', async ({ page }) => {
		const suffix = getTestSuffix('smokeEval');
		const studentId = `SE_${suffix}`;
		const englishName = `SmokeEval_${suffix}`;
		const chineseName = '冒煙測試';

		await createStudent({
			studentId,
			englishName,
			chineseName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');

		await expect(page.getByRole('heading', { name: 'New Evaluation' })).toBeVisible();
		await expect(page.getByText('1. Select Students')).toBeVisible();

		const filterInput = page.getByPlaceholder('Filter by name or ID...');
		await filterInput.fill(englishName);

		const studentRow = page.getByRole('button', { name: new RegExp(suffix) });
		await expect(studentRow).toBeVisible();

		await studentRow.click();
		await expect(page.getByText('1 student(s) selected')).toBeVisible();

		const categorySelect = page.getByRole('combobox', { name: /Select category/i });
		await expect(categorySelect).toBeVisible();
	});

	test('Admin adds student - dialog UI flow', async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();

		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Add New Student' })).toBeVisible();

		const suffix = getTestSuffix('smokeAdd');
		await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill(`S_${suffix}`);
		await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill(`Test_${suffix}`);
		await page.getByRole('dialog').getByPlaceholder('e.g., 張三').fill('測試');
		await page.getByRole('dialog').locator('select[aria-label="Grade"]').selectOption('10');

		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('Admin creates category - form UI flow', async ({ page }) => {
		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');

		await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();

		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		const suffix = getTestSuffix('smokeCat');
		await page.getByRole('dialog').getByPlaceholder('Category name').fill(`TestCategory_${suffix}`);
		await page.getByRole('dialog').getByRole('button', { name: 'Add sub-category' }).click();

		await page.getByRole('dialog').getByPlaceholder('Sub-category name').fill('Test Sub');

		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('Student list displays correctly', async ({ page }) => {
		const suffix = getTestSuffix('smokeList');
		const studentId = `SL_${suffix}`;
		const englishName = `SmokeList_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '列表測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		await expect(page.getByPlaceholder('Search by name or student ID...')).toBeVisible();

		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await searchInput.fill(englishName);

		await expect(page.getByRole('button', { name: new RegExp(englishName) })).toBeVisible();
	});

	test('Permission redirect works correctly', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForSelector('body.hydrated');

		expect(page.url()).not.toContain('/admin/users');
	});
});

test.describe('Student Table UI Tests @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('smokeFilter');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test('filters students by search term', async ({ page }) => {
		const suffix = getTestSuffix('smokeSearch');
		const studentId = `SS_${suffix}`;
		const englishName = `SmokeSearch_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '搜尋測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await searchInput.fill(englishName);

		await expect(page.getByRole('button', { name: new RegExp(englishName) })).toBeVisible();
	});

	test('filters students by grade', async ({ page }) => {
		const suffix = getTestSuffix('smokeGrade');
		const studentId = `SG_${suffix}`;
		const englishName = `SmokeGrade_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '年級測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		const gradeFilter = page.locator('select[aria-label="Filter by grade"]');
		await gradeFilter.selectOption('10');

		await expect(page.getByRole('button', { name: new RegExp(englishName) })).toBeVisible();
	});

	test('shows empty state when no students match filters', async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await searchInput.fill('NonExistentStudent12345ABC');

		await expect(page.getByText('No students found')).toBeVisible();
	});
});
