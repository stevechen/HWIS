import { test, expect } from '@playwright/test';
import { cleanupAuditLogs, seedAuditLogs } from './convex-client';

test.describe('Audit Log Page (super admin) @audit', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/audit');
		await page.waitForSelector('body.hydrated');

		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});

		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
	});

	test.afterEach(async () => {
		await cleanupAuditLogs();
	});

	test('displays audit log page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
	});

	test('displays page header with back button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Back to Admin' })).toBeVisible();
	});

	test('displays filter inputs', async ({ page }) => {
		await expect(page.getByPlaceholder('Student')).toBeVisible();
		await expect(page.getByPlaceholder('Teacher')).toBeVisible();
	});

	test('displays grade filter dropdown', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Grade' })).toBeVisible();
	});

	test('allows selecting a grade filter', async ({ page }) => {
		const gradeButton = page.getByRole('button', { name: 'Grade' });
		await gradeButton.click();
		await expect(page.getByRole('option', { name: 'G10' })).toBeVisible();
	});
});

test.describe('Audit Log - Column Management', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/audit');
		await page.waitForSelector('body.hydrated');

		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});

		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupAuditLogs();
	});

	test('resets column order when reset button is clicked', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns control' }).click();
		const menu = page.getByRole('menu', { name: 'Available columns' });
		await expect(menu).toBeVisible();

		const idCheckbox = page.getByRole('checkbox', { name: 'ID' });
		if (!(await idCheckbox.isChecked())) {
			await idCheckbox.click();
		}

		await page.keyboard.press('Escape');

		const resetButton = page.getByRole('button', { name: 'Reset Columns' });
		await expect(resetButton).toBeVisible();

		await resetButton.click();
		await expect(resetButton).not.toBeVisible();
	});

	test('clears filters when clear button is clicked', async ({ page }) => {
		const studentInput = page.getByRole('textbox', { name: 'Filter by student name' });
		await studentInput.fill('test');
		// Wait for input to be filled
		await expect(studentInput).toHaveValue('test');
		const clearButton = page.getByRole('button', { name: 'Clear all filters' });
		await expect(clearButton).toBeVisible();
		await clearButton.click();
		await expect(studentInput).toHaveValue('');
	});

	test('displays Grade filter by default', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Grade' })).toBeVisible();
	});
});

test.describe('Audit Log - Column Toggle', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/audit');
		await page.waitForSelector('body.hydrated');

		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});

		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupAuditLogs();
	});

	test('shows ID filter when column is enabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns control' }).click();
		await expect(page.getByRole('menu', { name: 'Available columns' })).toBeVisible();
		const idCheckbox = page.getByRole('checkbox', { name: 'ID' });
		if (!(await idCheckbox.isChecked())) {
			await idCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByPlaceholder('ID')).toBeVisible();
	});

	test('hides ID filter when column is disabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns control' }).click();
		await expect(page.getByRole('menu', { name: 'Available columns' })).toBeVisible();
		const idCheckbox = page.getByRole('checkbox', { name: 'ID' });
		if (await idCheckbox.isChecked()) {
			await idCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByPlaceholder('ID')).not.toBeVisible();
	});

	test('hides Grade filter when column is disabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns control' }).click();
		await expect(page.getByRole('menu', { name: 'Available columns' })).toBeVisible();
		const gradeCheckbox = page.getByRole('checkbox', { name: 'Grade' });
		if (await gradeCheckbox.isChecked()) {
			await gradeCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByRole('button', { name: 'Grade' })).not.toBeVisible();
	});

	test('shows Grade filter when column is enabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns control' }).click();
		await expect(page.getByRole('menu', { name: 'Available columns' })).toBeVisible();
		const gradeCheckbox = page.getByRole('checkbox', { name: 'Grade' });
		if (!(await gradeCheckbox.isChecked())) {
			await gradeCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByRole('button', { name: 'Grade' })).toBeVisible();
	});

	test('hides always-on columns from dropdown', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns control' }).click();
		await expect(page.getByRole('menu', { name: 'Available columns' })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Student' })).not.toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Teacher' })).not.toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Type' })).not.toBeVisible();
	});

	test('shows optional columns in dropdown', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns control' }).click();
		const menu = page.getByRole('menu', { name: 'Available columns' });
		await expect(menu.getByRole('checkbox', { name: 'Time' })).toBeVisible();
		await expect(menu.getByRole('checkbox', { name: 'ID' })).toBeVisible();
		await expect(menu.getByRole('checkbox', { name: 'Grade' })).toBeVisible();
		await expect(menu.getByRole('checkbox', { name: 'Category', exact: true })).toBeVisible();
		await expect(menu.getByRole('checkbox', { name: 'Subcategory' })).toBeVisible();
		await expect(menu.getByRole('checkbox', { name: 'Points' })).toBeVisible();
		await expect(menu.getByRole('checkbox', { name: 'Details' })).toBeVisible();
	});
});

test.describe('Audit Log - Toggle Columns With Data', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	let testAuthId: string;
	let testAuditLogs = false;

	test.beforeEach(async ({ page }) => {
		// Generate unique ID for this test run
		testAuthId = `e2e-audit-${Math.random().toString(36).substring(7)}`;

		// Seed audit logs with unique authId
		await seedAuditLogs(testAuthId);
		testAuditLogs = true;

		await page.goto('/admin/audit');
		await page.waitForSelector('body.hydrated');

		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});

		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		// Clean up only this test's data
		if (testAuditLogs) await cleanupAuditLogs(testAuthId);
	});

	test('toggles columns and filters via dropdown', async ({ page }) => {
		// Wait for audit logs table to appear
		await expect(page.getByRole('table', { name: 'Audit log table' })).toBeVisible();

		// Filter by our unique test performer to isolate this test's data
		const teacherInput = page.getByRole('textbox', { name: 'Filter by teacher name' });
		await teacherInput.fill(`Test Performer ${testAuthId}`);

		// Wait for actual data rows to be rendered (not just the table structure)
		// The table should have EXACTLY 3 data rows from our seeded audit logs
		await expect(page.locator('tbody tr')).toHaveCount(3);

		await page.getByRole('button', { name: 'Columns control' }).click();
		const menu = page.getByRole('menu', { name: 'Available columns' });
		await expect(menu).toBeVisible();

		const detailsCheckbox = page.getByRole('checkbox', { name: 'Details' });
		if (await detailsCheckbox.isChecked()) await detailsCheckbox.click();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('columnheader', { name: 'Details' })).not.toBeVisible();
		await page.getByRole('button', { name: 'Columns control' }).click();
		await expect(page.getByRole('menu', { name: 'Available columns' })).toBeVisible();
		await page.getByRole('checkbox', { name: 'Details' }).click();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('columnheader', { name: 'Details' })).toBeVisible();
	});
});
