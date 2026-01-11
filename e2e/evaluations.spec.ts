import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const hasTeacherAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/teacher.json'));

test.describe('Evaluations (authenticated as teacher)', () => {
	test.beforeAll(() => {
		if (!hasTeacherAuth) {
			test.skip(true, 'Test authentication not set up. Run: npm run test:e2e:setup');
		}
	});

	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/evaluations/new');
		await page.waitForLoadState('networkidle');
	});

	test('should display new evaluation page', async ({ page }) => {
		await expect(page.locator('h1', { hasText: 'New Evaluation' })).toBeVisible({ timeout: 15000 });
	});

	test('should show loading state while students load', async ({ page }) => {
		await page.goto('/evaluations/new');
		await page.waitForSelector('text=Alice Smith', { timeout: 10000 });
	});

	test('should display categories from database', async ({ page }) => {
		await expect(page.locator('text=Select Category')).toBeVisible({ timeout: 10000 });
		const selectTrigger = page.locator('button:has-text("Category")');
		await selectTrigger.click();
		await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5000 });
	});

	test('should display students list', async ({ page }) => {
		await expect(page.locator('text=Select Students').first()).toBeVisible({ timeout: 10000 });
	});

	test('should allow selecting a student', async ({ page }) => {
		const firstCheckbox = page.locator('input[type="checkbox"]').first();
		await firstCheckbox.check();
		await expect(firstCheckbox).toBeChecked();
	});

	test('should show selected student count', async ({ page }) => {
		await page.locator('input[type="checkbox"]').first().check();
		await expect(page.locator('text=1 student(s) selected')).toBeVisible({ timeout: 5000 });
	});

	test('should show error when submitting without student selection', async ({ page }) => {
		await page.locator('button:has-text("Submit Evaluation")').click();
		await expect(page.locator('text=Please select at least one student')).toBeVisible({
			timeout: 5000
		});
	});

	test('should show error when submitting without category', async ({ page }) => {
		await page.locator('input[type="checkbox"]').first().check();
		await page.locator('button:has-text("Submit Evaluation")').click();
		await expect(page.locator('text=Please select a category')).toBeVisible({ timeout: 5000 });
	});

	test('should create evaluation successfully', async ({ page }) => {
		await page.locator('input[type="checkbox"]').first().check();

		const selectTrigger = page.locator('button:has-text("Category")');
		await selectTrigger.click();
		await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5000 });
		await page.locator('[role="option"]').first().click();

		await page.locator('button:has-text("Submit Evaluation")').click();

		await page.waitForURL(/\/($|evaluations)/, { timeout: 10000 });
	});
});

test.describe('Evaluations list (authenticated)', () => {
	test.beforeAll(() => {
		if (!hasTeacherAuth) {
			test.skip(true, 'Test authentication not set up. Run: bun run test:e2e:setup');
		}
	});

	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test('should display evaluation history page', async ({ page }) => {
		await page.goto('/evaluations');
		await page.waitForLoadState('networkidle');
		await expect(page.getByText('Evaluations').first()).toBeVisible({ timeout: 15000 });
	});
});
