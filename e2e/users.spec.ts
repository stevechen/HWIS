import { test, expect } from '@playwright/test';

test.describe('Users Page @users', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForSelector('body.hydrated');
		// Wait for user data to load - wait for actual data rows, not just loading indicator
		await expect(page.getByRole('table', { name: 'users' })).toBeVisible();
		// Wait for at least one data row (not just header row)
		await expect(
			page
				.getByRole('row')
				.filter({ hasNot: page.getByRole('columnheader') })
				.first()
		).toBeVisible({ timeout: 10000 });
	});

	test('can open role dropdown', async ({ page }) => {
		// Skip first dropdown (likely super user which is disabled)
		// Click on second dropdown which should be enabled
		const roleDropdown = page.getByRole('button', { name: /select role for/i }).nth(1);
		await expect(roleDropdown).toBeVisible();

		// Click to open the dropdown
		await roleDropdown.click();

		// Verify dropdown content is visible (Select.Item elements)
		await expect(page.getByRole('option', { name: 'Admin' })).toBeVisible();
		await expect(page.getByRole('option', { name: 'Teacher' })).toBeVisible();
	});
});
