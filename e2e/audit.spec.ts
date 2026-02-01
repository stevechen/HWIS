import { test, expect } from '@playwright/test';
import { cleanupAuditLogs } from './convex-client';

test.describe('Audit Log Page (super admin)', () => {
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
		try {
			await cleanupAuditLogs();
		} catch {
			// Cleanup skipped
		}
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

	test('resets column order when reset button is clicked', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent).toBeVisible();

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
		const studentInput = page.getByPlaceholder('Student');
		await studentInput.fill('test');
		await page.waitForTimeout(100);
		const clearButton = page.getByRole('button', { name: 'Clear all filters' });
		await expect(clearButton).toBeVisible();
		await clearButton.click();
		await expect(studentInput).toHaveValue('');
	});

	test('displays theme toggle button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible();
	});

	test('hides ID filter by default', async ({ page }) => {
		await expect(page.getByPlaceholder('ID')).not.toBeVisible();
	});

	test('displays Grade filter by default', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Grade' })).toBeVisible();
	});

	test('shows ID filter when column is enabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent).toBeVisible();
		const idCheckbox = page.getByRole('checkbox', { name: 'ID' });
		if (!(await idCheckbox.isChecked())) {
			await idCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByPlaceholder('ID')).toBeVisible();
	});

	test('hides ID filter when column is disabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent).toBeVisible();
		const idCheckbox = page.getByRole('checkbox', { name: 'ID' });
		if (await idCheckbox.isChecked()) {
			await idCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByPlaceholder('ID')).not.toBeVisible();
	});

	test('hides Grade filter when column is disabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent).toBeVisible();
		const gradeCheckbox = page.getByRole('checkbox', { name: 'Grade' });
		if (await gradeCheckbox.isChecked()) {
			await gradeCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByRole('button', { name: 'Grade' })).not.toBeVisible();
	});

	test('shows Grade filter when column is enabled', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent).toBeVisible();
		const gradeCheckbox = page.getByRole('checkbox', { name: 'Grade' });
		if (!(await gradeCheckbox.isChecked())) {
			await gradeCheckbox.click();
		}
		await page.keyboard.press('Escape');
		await expect(page.getByRole('button', { name: 'Grade' })).toBeVisible();
	});

	test('hides always-on columns from dropdown', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Student' })).not.toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Teacher' })).not.toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Type' })).not.toBeVisible();
	});

	test('shows optional columns in dropdown', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent.getByRole('checkbox', { name: 'Time' })).toBeVisible();
		await expect(popoverContent.getByRole('checkbox', { name: 'ID' })).toBeVisible();
		await expect(popoverContent.getByRole('checkbox', { name: 'Grade' })).toBeVisible();
		await expect(
			popoverContent.getByRole('checkbox', { name: 'Category', exact: true })
		).toBeVisible();
		await expect(popoverContent.getByRole('checkbox', { name: 'Subcategory' })).toBeVisible();
		await expect(popoverContent.getByRole('checkbox', { name: 'Points' })).toBeVisible();
		await expect(popoverContent.getByRole('checkbox', { name: 'Details' })).toBeVisible();
	});

	test('toggles columns and filters via dropdown', async ({ page }) => {
		await page.getByRole('button', { name: 'Columns' }).first().click();
		const popoverContent = page.locator('[data-slot="popover-content"]').first();
		await expect(popoverContent).toBeVisible();

		const detailsCheckbox = page.getByRole('checkbox', { name: 'Details' });
		if (await detailsCheckbox.isChecked()) {
			await detailsCheckbox.click();
		}

		await page.keyboard.press('Escape');
		await expect(page.locator('th', { hasText: 'Details' })).not.toBeVisible();

		await page.getByRole('button', { name: 'Columns' }).first().click();
		await expect(page.locator('[data-slot="popover-content"]').first()).toBeVisible();
		await page.getByRole('checkbox', { name: 'Details' }).click();
		await page.keyboard.press('Escape');
		await expect(page.locator('th', { hasText: 'Details' })).toBeVisible();
	});
});
