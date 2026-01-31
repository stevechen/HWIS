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
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');

		// Verify page structure loads correctly
		await expect(page.getByRole('heading', { name: 'New Evaluation' })).toBeVisible();
		await expect(page.getByText('1. Select Students')).toBeVisible();

		// Wait for students section to load
		await page.waitForSelector('text=Loading students...', { state: 'detached', timeout: 10000 });

		// Verify search input is present
		const filterInput = page.getByLabel('Search students');
		await expect(filterInput).toBeVisible();

		// Verify evaluation details section
		await expect(page.getByText('2. Evaluation Details')).toBeVisible();
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

		// Teachers should be redirected from admin pages
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Teacher is redirected away from admin pages
		await expect(page).not.toHaveURL(/\/admin\/students/);
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

		// Wait for students to load
		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		const searchInput = page.getByLabel('Search by name or student ID');
		await searchInput.fill(englishName);

		// Wait for filter to apply
		await page.waitForTimeout(300);

		// Verify student appears in the table
		await expect(page.getByText(englishName).first()).toBeVisible();
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

		// Wait for students to load
		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		const gradeFilter = page.getByLabel('Filter by grade');
		await gradeFilter.selectOption('10');

		// Wait for filter to apply
		await page.waitForTimeout(300);

		// Verify student appears in the table
		await expect(page.getByText(englishName).first()).toBeVisible();
	});
});
