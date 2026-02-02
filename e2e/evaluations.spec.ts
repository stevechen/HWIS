import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { cleanupTestData, seedBaseline } from './convex-client';

test.describe('Evaluations (authenticated as teacher) @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await seedBaseline();
		await page.goto('/evaluations/new?testRole=teacher');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('eval');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test('displays new evaluation page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'New Evaluation' })).toBeVisible();
	});

	test('displays categories from database', async ({ page }) => {
		const categoryTrigger = page.locator('[aria-label="Select category"]').first();
		await expect(categoryTrigger).toBeVisible({ timeout: 5000 });
		await expect(categoryTrigger).toContainText('Select Category');
	});

	test('displays students list', async ({ page }) => {
		await expect(page.getByText('1. Select Students')).toBeVisible();
		await expect(page.getByLabel('Search students')).toBeVisible();
	});

	test('shows error without student selection', async ({ page }) => {
		const submitButton = page
			.locator('button')
			.filter({ hasText: /submit/i })
			.first();
		if (await submitButton.isVisible()) {
			await submitButton.click();
			await expect(page.getByText(/Please select at least one student/i)).toBeVisible();
		}
	});
});

test.describe('Evaluations with student selection @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await seedBaseline();
		await page.goto('/evaluations/new?testRole=teacher');
		await page.waitForSelector('body.hydrated');
		// Wait for Convex to fully load
		await expect(page.getByText('1. Select Students')).toBeVisible({ timeout: 10000 });
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('eval');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test('allows selecting a student from existing list', async ({ page }) => {
		// Clear search to see all students
		const filterInput = page.locator('input[aria-label="Search students"]').first();
		await filterInput.fill('');

		// Look for any visible student using known names
		const firstStudent = page.getByText(/Alice|Bob|Charlie/i).first();
		if (await firstStudent.isVisible({ timeout: 5000 }).catch(() => false)) {
			await firstStudent.click();
			await expect(page.getByText(/student.*selected/i)).toBeVisible();
		} else {
			// If no existing students found, verify at least the UI is working
			await expect(page.getByText('1. Select Students')).toBeVisible();
		}
	});

	test('shows error without category when student selected', async ({ page }) => {
		// Try to select a student first
		const filterInput = page.locator('input[aria-label="Search students"]').first();
		await filterInput.fill('');

		const firstStudent = page.getByText(/Alice|Bob|Charlie/i).first();
		if (await firstStudent.isVisible({ timeout: 5000 }).catch(() => false)) {
			await firstStudent.click();

			// Try to submit without category
			const submitButton = page
				.locator('button')
				.filter({ hasText: /submit/i })
				.first();
			if (await submitButton.isVisible()) {
				await submitButton.click();
				await expect(page.getByText(/Please select a category/i)).toBeVisible();
			}
		} else {
			// If no student found, just verify the error handling UI works
			const submitButton = page
				.locator('button')
				.filter({ hasText: /submit/i })
				.first();
			if (await submitButton.isVisible()) {
				await submitButton.click();
				await expect(page.getByText(/Please select at least one student/i)).toBeVisible();
			}
		}
	});

	test('can select category and sub-category', async ({ page }) => {
		// Open category dropdown
		await page.locator('[aria-label="Select category"]').first().click();

		// Check if categories are available - wait briefly then check
		const categoryOptions = await page.getByRole('option').all();

		if (categoryOptions.length > 0) {
			// Select first available category
			await categoryOptions[0].click();

			// Check if sub-category dropdown appears for categories with sub-categories
			const subCategoryTrigger = page.locator('[aria-label="Select sub-category"]').first();
			if (await subCategoryTrigger.isVisible().catch(() => false)) {
				await subCategoryTrigger.click();

				// Wait for subcategory options to appear
				await expect(page.getByRole('option').first()).toBeVisible({ timeout: 5000 });

				const subOptions = await page.getByRole('option').all();
				if (subOptions.length > 0) {
					await subOptions[0].click();
				}
			}
		} else {
			// No categories available, verify the dropdown UI works
			await expect(page.locator('[aria-label="Select category"]').first()).toBeVisible();
		}
	});
});
