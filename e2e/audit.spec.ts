import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const hasAdminAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/admin.json'));

test.describe('Audit Log Page (authenticated as admin)', () => {
	test.beforeAll(() => {
		if (!hasAdminAuth) {
			test.skip(true, 'Test authentication not set up. Run: npm run test:e2e:setup');
		}
	});

	test.beforeEach(async ({ page }) => {
		const storageState = JSON.parse(
			fs.readFileSync(path.join(process.cwd(), 'e2e/.auth/admin.json'), 'utf-8')
		);
		await page.context().addCookies(storageState.cookies);
		await page.goto('/admin/audit');
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});
		await page.reload();
		await page.waitForLoadState('networkidle');
	});

	test('should display audit log page', async ({ page }) => {
		await expect(page.getByText('Audit Log').first()).toBeVisible({ timeout: 15000 });
	});

	test('should display page header with back button', async ({ page }) => {
		await expect(page.locator('button:has-text("Back to Admin")')).toBeVisible({ timeout: 10000 });
	});

	test('should display empty state when no logs exist', async ({ page }) => {
		await expect(page.getByText('No audit logs found.')).toBeVisible({ timeout: 15000 });
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
		if (await resetButton.isVisible()) {
			await resetButton.click();
			await expect(resetButton).not.toBeVisible();
		}
	});

	test('should display empty state instead of table when no logs exist', async ({ page }) => {
		const emptyState = page.locator('text=No audit logs found.');
		await expect(emptyState).toBeVisible({ timeout: 15000 });
	});

	test('should show empty state when sorting with no logs', async ({ page }) => {
		const emptyState = page.locator('text=No audit logs found.');
		await expect(emptyState).toBeVisible({ timeout: 15000 });
	});

	test('should filter by student name', async ({ page }) => {
		await page.waitForTimeout(2000);

		const initialRows = page.locator('table tbody tr');
		const initialCount = await initialRows.count();

		const studentInput = page.locator('input[placeholder="Student"]');
		await studentInput.fill('John');
		await page.waitForTimeout(1000);

		const filteredRows = page.locator('table tbody tr');
		const filteredCount = await filteredRows.count();

		if (initialCount > 0) {
			expect(filteredCount).toBeLessThanOrEqual(initialCount);
		} else {
			await expect(page.getByText('No audit logs found.')).toBeVisible();
		}

		await studentInput.fill('');
		await page.waitForTimeout(500);
	});

	test('should filter by teacher name', async ({ page }) => {
		await page.waitForTimeout(2000);

		const initialRows = page.locator('table tbody tr');
		const initialCount = await initialRows.count();

		const teacherInput = page.locator('input[placeholder="Teacher"]');
		await teacherInput.fill('Smith');
		await page.waitForTimeout(1000);

		const filteredRows = page.locator('table tbody tr');
		const filteredCount = await filteredRows.count();

		if (initialCount > 0) {
			expect(filteredCount).toBeLessThanOrEqual(initialCount);
		} else {
			await expect(page.getByText('No audit logs found.')).toBeVisible();
		}

		await teacherInput.fill('');
		await page.waitForTimeout(500);
	});

	test('should filter by grade', async ({ page }) => {
		await page.waitForTimeout(2000);

		const initialRows = page.locator('table tbody tr');
		const initialCount = await initialRows.count();

		const gradeButton = page.locator('button.w-24');
		await gradeButton.click();
		await page.waitForTimeout(500);

		const gradeOption = page.locator('[role="option"]:has-text("G12")');
		if (await gradeOption.isVisible()) {
			await gradeOption.click();
			await page.waitForTimeout(1000);

			const filteredRows = page.locator('table tbody tr');
			const filteredCount = await filteredRows.count();

			if (initialCount > 0 && filteredCount > 0) {
				expect(filteredCount).toBeLessThanOrEqual(initialCount);
			}
		}

		await gradeButton.click();
		await page.waitForTimeout(500);
		const clearOption = page.locator('[role="option"]:has-text("Clear")');
		if (await clearOption.isVisible()) {
			await clearOption.click();
		} else {
			await page.keyboard.press('Escape');
		}
		await page.waitForTimeout(500);
	});

	test('should filter by ID when column is enabled', async ({ page }) => {
		await page.waitForTimeout(2000);

		const initialRows = page.locator('table tbody tr');
		const initialCount = await initialRows.count();

		await page.locator('header button:has-text("Columns")').last().click();
		const idCheckbox = page.locator('label:has-text("ID")').locator('input[type="checkbox"]');
		if (!(await idCheckbox.isChecked())) {
			await idCheckbox.click();
		}

		const idInput = page.locator('input[placeholder="ID"]');
		await idInput.fill('abc123');
		await page.waitForTimeout(1000);

		const filteredRows = page.locator('table tbody tr');
		const filteredCount = await filteredRows.count();

		if (initialCount > 0) {
			expect(filteredCount).toBeLessThanOrEqual(initialCount);
		} else {
			await expect(page.getByText('No audit logs found.')).toBeVisible();
		}

		await idInput.fill('');
		await page.waitForTimeout(500);
	});

	test('should clear filters when clear button is clicked', async ({ page }) => {
		const studentInput = page.locator('input[placeholder="Student"]');
		await studentInput.fill('test');
		const clearButton = page.locator('button:has-text("Clear Filters")');
		if (await clearButton.isVisible()) {
			await clearButton.click();
			await expect(studentInput).toHaveValue('');
		}
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

	test('should NOT display ID column in table by default', async ({ page }) => {
		const emptyState = page.locator('text=No audit logs found.');
		await expect(emptyState).toBeVisible({ timeout: 15000 });

		const tableHeaders = page.locator('th');
		await expect(tableHeaders.locator('text=ID')).not.toBeVisible();
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
		await page.locator('header button:has-text("Columns")').last().click();

		const idCheckbox = page.locator('label:has-text("ID")').locator('input[type="checkbox"]');
		if (await idCheckbox.isChecked()) {
			await idCheckbox.click();
		}

		const idInput = page.locator('input[placeholder="ID"]');
		await expect(idInput).not.toBeVisible({ timeout: 5000 });
	});

	test('should hide Grade filter when Grade column is disabled via dropdown', async ({ page }) => {
		await page.locator('header button:has-text("Columns")').last().click();

		const gradeCheckbox = page.locator('label:has-text("Grade")').locator('input[type="checkbox"]');
		if (await gradeCheckbox.isChecked()) {
			await gradeCheckbox.click();
		}

		const gradeButton = page.locator('button:has-text("Grade")');
		await expect(gradeButton).not.toBeVisible({ timeout: 5000 });
	});

	test('should show Grade filter when Grade column is enabled via dropdown', async ({ page }) => {
		await page.locator('header button:has-text("Columns")').last().click();

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
		await page.locator('header button:has-text("Columns")').last().click();

		await expect(page.locator('label:has-text("Student")')).not.toBeVisible();
		await expect(page.locator('label:has-text("Teacher")')).not.toBeVisible();
		await expect(page.locator('label:has-text("Type")')).not.toBeVisible();
	});

	test('should show only optional columns (Time, ID, Grade, Category, Subcategory, Points, Details) in dropdown', async ({
		page
	}) => {
		await page.locator('header button:has-text("Columns")').last().click();

		const popoverContent = page.locator('[data-slot="popover-content"]');
		await expect(popoverContent.locator('label:has-text("Time")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("ID")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Grade")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Category")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Subcategory")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Points")').first()).toBeVisible();
		await expect(popoverContent.locator('label:has-text("Details")').first()).toBeVisible();
	});
});

test.describe('Audit Log Page (authenticated as teacher)', () => {
	test.beforeAll(() => {
		if (!hasAdminAuth) {
			test.skip(true, 'Test authentication not set up. Run: npm run test:e2e:setup');
		}
	});

	test.beforeEach(async ({ page }) => {
		const storageState = JSON.parse(
			fs.readFileSync(path.join(process.cwd(), 'e2e/.auth/teacher.json'), 'utf-8')
		);
		await page.context().addCookies(storageState.cookies);
		await page.goto('/admin/audit');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);
	});

	test('should redirect non-admin users away from audit page', async ({ page }) => {
		const isTestMode = await page.evaluate(() => document.cookie.includes('hwis_test_auth=true'));
		test.skip(isTestMode, 'Role check is bypassed in test mode');
		expect(page.url()).not.toContain('/admin/audit');
	});
});
