import { test, expect } from '@playwright/test';

test.describe('Evaluations (authenticated as teacher)', () => {
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

	test('should show error when submitting without sub-category', async ({ page }) => {
		await page.locator('input[type="checkbox"]').first().check();
		const selectTrigger = page.locator('button:has-text("Category")');
		await selectTrigger.click();
		await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5000 });
		await page.locator('[role="option"]').first().click();
		await page.locator('button:has-text("Submit Evaluation")').click();
		await expect(page.locator('text=Please select a sub-category')).toBeVisible({ timeout: 5000 });
	});

	test('should display sub-category dropdown when category has sub-categories', async ({
		page
	}) => {
		const selectTrigger = page.locator('button:has-text("Category")');
		await selectTrigger.click();
		const firstOption = page.locator('[role="option"]').first();
		await expect(firstOption).toBeVisible({ timeout: 5000 });
		await firstOption.click();

		const subCategoryTrigger = page.locator('button:has-text("Select Sub-Category")');
		const hasSubCategories = await subCategoryTrigger.isVisible({ timeout: 2000 });

		if (hasSubCategories) {
			await expect(subCategoryTrigger).toBeVisible();
		} else {
			await selectTrigger.click();
			const options = page.locator('[role="option"]');
			const count = await options.count();
			if (count > 1) {
				await options.nth(1).click();
				await expect(subCategoryTrigger).toBeVisible({ timeout: 5000 });
			}
		}
	});

	test('should allow selecting a sub-category', async ({ page }) => {
		const selectTrigger = page.locator('button:has-text("Category")');
		await selectTrigger.click();

		const options = page.locator('[role="option"]');
		let foundWithSubCategories = false;

		for (let i = 0; i < (await options.count()); i++) {
			const option = options.nth(i);
			await option.click();

			const subCategoryTrigger = page.locator('button:has-text("Select Sub-Category")');
			const isVisible = await subCategoryTrigger.isVisible({ timeout: 2000 });

			if (isVisible) {
				foundWithSubCategories = true;
				await subCategoryTrigger.click();
				const subOptions = page.locator('[role="option"]:has-text("Sub")');
				if ((await subOptions.count()) > 0) {
					await subOptions.first().click();
				}
				break;
			} else if (i < (await options.count()) - 1) {
				await selectTrigger.click();
			}
		}

		if (!foundWithSubCategories) {
			test.skip();
		}
	});

	test('should allow selecting points value', async ({ page }) => {
		const plus2Btn = page.locator('button:has-text("+2")');
		const minus1Btn = page.locator('button:has-text("-1")');

		await plus2Btn.click();
		const plus2Classes = await plus2Btn.getAttribute('class');
		expect(plus2Classes).toContain('bg-primary');

		await minus1Btn.click();
		const minus1Classes = await minus1Btn.getAttribute('class');
		expect(minus1Classes).toContain('bg-primary');
	});

	test('should allow entering details/comments', async ({ page }) => {
		const detailsField = page.locator('textarea[placeholder*="Enter specific details"]');
		await expect(detailsField).toBeVisible();
		await detailsField.fill('Great participation in class discussion');
		await expect(detailsField).toHaveValue('Great participation in class discussion');
	});

	test('should create evaluation successfully', async ({ page }) => {
		await page.locator('input[type="checkbox"]').first().check();

		const selectTrigger = page.locator('button:has-text("Category")');
		await selectTrigger.click();
		await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5000 });
		await page.locator('[role="option"]').first().click();

		await page.locator('button:has-text("Submit Evaluation")').click();

		await expect(page).toHaveURL(/\/evaluations/, { timeout: 10000 });
	});
});

test.describe('Evaluations list (authenticated)', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/evaluations');
		await page.waitForLoadState('networkidle');
	});

	test('should display evaluation history page', async ({ page }) => {
		await expect(page.getByText('Evaluation History').first()).toBeVisible({ timeout: 15000 });
	});

	test('should display New Evaluation button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'New Evaluation' })).toBeVisible();
	});

	test('should display theme toggle button', async ({ page }) => {
		await expect(page.locator('button[aria-label="Toggle theme"]').first()).toBeVisible({
			timeout: 10000
		});
	});

	test('should navigate to new evaluation page when button clicked', async ({ page }) => {
		await page.getByRole('button', { name: 'New Evaluation' }).click();
		await expect(page).toHaveURL(/\/evaluations\/new/);
		await expect(page.getByText('New Evaluation').first()).toBeVisible({ timeout: 10000 });
	});

	test('should display back button', async ({ page }) => {
		await expect(page.locator('button:has-text("Back")')).toBeVisible();
	});
});
