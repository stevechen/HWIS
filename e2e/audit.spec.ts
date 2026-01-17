import { test, expect } from '@playwright/test';

test.describe('Audit Log Page (super admin)', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});
		await expect(page.getByText('Audit Log').first()).toBeVisible({ timeout: 15000 });
	});

	test('should display audit log page', async ({ page }) => {
		await expect(page.getByText('Audit Log').first()).toBeVisible({ timeout: 15000 });
	});

	test('should display page header with back button', async ({ page }) => {
		await expect(page.locator('button:has-text("Back to Admin")')).toBeVisible({ timeout: 10000 });
	});

	test('should display filter inputs', async ({ page }) => {
		await expect(page.locator('input[placeholder="Student"]')).toBeVisible();
		await expect(page.locator('input[placeholder="Teacher"]')).toBeVisible();
	});

	test('should display grade filter dropdown', async ({ page }) => {
		await expect(page.locator('button:has-text("Grade")')).toBeVisible({ timeout: 10000 });
	});

	test('should allow selecting a grade filter', async ({ page }) => {
		const gradeButton = page.locator('button:has-text("Grade")');
		await gradeButton.click();
		await expect(page.locator('[role="option"]:has-text("G10")')).toBeVisible({ timeout: 5000 });
	});

	test('should reset column order when reset button is clicked', async ({ page }) => {
		const resetButton = page.locator('button:has-text("Reset Columns")');
		const isVisible = await resetButton.isVisible({ timeout: 5000 });
		if (isVisible) {
			await resetButton.click();
			await expect(resetButton).not.toBeVisible();
		} else {
			test.skip();
		}
	});

	test('should clear filters when clear button is clicked', async ({ page }) => {
		const studentInput = page.locator('input[placeholder="Student"]');
		await studentInput.fill('test');
		const clearButton = page.locator('button:has-text("Clear Filters")');
		await expect(clearButton).toBeVisible({ timeout: 5000 });
		await clearButton.click();
		await expect(studentInput).toHaveValue('');
	});

	test('should display theme toggle button', async ({ page }) => {
		await expect(page.locator('button[aria-label="Toggle theme"]').first()).toBeVisible({
			timeout: 10000
		});
	});

	test('should NOT display ID filter by default (ID is hidden column)', async ({ page }) => {
		const idInput = page.locator('input[placeholder="ID"]');
		await expect(idInput).not.toBeVisible({ timeout: 10000 });
	});

	test('should display Grade filter by default (Grade is visible column)', async ({ page }) => {
		const gradeButton = page.locator('button:has-text("Grade")');
		await expect(gradeButton).toBeVisible({ timeout: 10000 });
	});

	test('should show ID filter when ID column is enabled via dropdown', async ({ page }) => {
		await page.locator('header button:has-text("Columns")').last().click();
		const idCheckbox = page.locator('label:has-text("ID")').locator('input[type="checkbox"]');
		if (!(await idCheckbox.isChecked())) {
			await idCheckbox.click();
		}
		const idInput = page.locator('input[placeholder="ID"]');
		await expect(idInput).toBeVisible({ timeout: 5000 });
	});

	test('should hide ID filter when ID column is disabled via dropdown', async ({ page }) => {
		await page.locator('button:has-text("Columns")').first().click();
		const idCheckbox = page.locator('label:has-text("ID")').locator('input[type="checkbox"]');
		if (await idCheckbox.isChecked()) {
			await idCheckbox.click();
		}
		const idInput = page.locator('input[placeholder="ID"]');
		await expect(idInput).not.toBeVisible({ timeout: 5000 });
	});

	test('should hide Grade filter when Grade column is disabled via dropdown', async ({ page }) => {
		await page.locator('button:has-text("Columns")').first().click();
		const gradeCheckbox = page.locator('label:has-text("Grade")').locator('input[type="checkbox"]');
		if (await gradeCheckbox.isChecked()) {
			await gradeCheckbox.click();
		}
		const gradeButton = page.locator('button:has-text("Grade")');
		await expect(gradeButton).not.toBeVisible({ timeout: 5000 });
	});

	test('should show Grade filter when Grade column is enabled via dropdown', async ({ page }) => {
		await page.locator('button:has-text("Columns")').first().click();
		const gradeCheckbox = page.locator('label:has-text("Grade")').locator('input[type="checkbox"]');
		if (!(await gradeCheckbox.isChecked())) {
			await gradeCheckbox.click();
		}
		const gradeButton = page.locator('button:has-text("Grade")');
		await expect(gradeButton).toBeVisible({ timeout: 5000 });
	});

	test('should NOT show always-on columns (Student, Teacher, Type) in dropdown', async ({
		page
	}) => {
		await page.locator('button:has-text("Columns")').first().click();
		await expect(page.locator('label:has-text("Student")')).not.toBeVisible();
		await expect(page.locator('label:has-text("Teacher")')).not.toBeVisible();
		await expect(page.locator('label:has-text("Type")')).not.toBeVisible();
	});

	test('should show only optional columns in dropdown', async ({ page }) => {
		await page.locator('button:has-text("Columns")').first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]');
		await expect(popoverContent.locator('label:has-text("Time")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("ID")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Grade")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Category")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Subcategory")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Points")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Details")').first()).toBeVisible();
	});

	test('should toggle optional columns and corresponding filters via dropdown', async ({
		page
	}) => {
		await page.goto('/admin/audit');
		await page.waitForLoadState('networkidle');

		// Find the Columns dropdown button
		const columnsButton = page.getByRole('button', { name: /columns/i }).first();
		await expect(columnsButton).toBeVisible({ timeout: 10000 });

		// Click to open dropdown
		await columnsButton.click();

		// Verify dropdown opened
		const popover = page
			.locator('[data-slot="popover-content"], [role="listbox"], .popover-content')
			.first();
		await expect(popover).toBeVisible({ timeout: 5000 });

		// Find Time checkbox in the dropdown
		const timeLabel = popover.locator('label').filter({ has: page.getByText(/time/i) });
		await expect(timeLabel).toBeVisible({ timeout: 5000 });
		const timeCheckbox = timeLabel.locator('input[type="checkbox"]');

		// Get initial state
		const initialChecked = await timeCheckbox.isChecked();

		// Toggle Time checkbox
		await timeLabel.click();

		// Verify state changed
		const afterToggleChecked = await timeCheckbox.isChecked();
		expect(afterToggleChecked).not.toBe(initialChecked);

		// Toggle back
		await timeLabel.click();

		// Verify back to original state
		const finalChecked = await timeCheckbox.isChecked();
		expect(finalChecked).toBe(initialChecked);
	});
});

test.describe('Audit Log Page - Teacher redirect', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/audit');
		await page.waitForLoadState('domcontentloaded');
	});

	test('should redirect non-admin users away from audit page', async ({ page }) => {
		await page.waitForURL((url) => !url.pathname.includes('/admin/audit'), { timeout: 5000 });
		await expect(page).not.toHaveURL(/\/admin\/audit/);
	});
});
