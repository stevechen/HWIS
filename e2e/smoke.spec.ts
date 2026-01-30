import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Smoke Tests @smoke', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async () => {});

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

	test.beforeEach(async () => {});

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
});
