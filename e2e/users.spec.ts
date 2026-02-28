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

	test('super option is hidden for admin users', async ({ page }) => {
		// Click on second dropdown which should be enabled (not the super user's)
		const roleDropdown = page.getByRole('button', { name: /select role for/i }).nth(1);
		await expect(roleDropdown).toBeVisible();

		// Click to open the dropdown
		await roleDropdown.click();

		// Verify "Super User" option is NOT visible for admin users
		await expect(page.getByRole('option', { name: 'Super User' })).not.toBeVisible();
	});
});

test.describe('Users Page - Super User @users', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

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

	test('super option is visible for super users', async ({ page }) => {
		// Find a dropdown for a non-super user (we need to find one that's not disabled)
		// Look for any enabled role dropdown
		const roleDropdowns = page.getByRole('button', { name: /select role for/i });

		// Find an enabled dropdown (not the super user's own dropdown which may be disabled)
		const count = await roleDropdowns.count();
		let targetDropdown = null;

		for (let i = 0; i < count; i++) {
			const dropdown = roleDropdowns.nth(i);
			const isDisabled = await dropdown.isDisabled();
			if (!isDisabled) {
				targetDropdown = dropdown;
				break;
			}
		}

		// If no enabled dropdown found, skip the test (no users to manage)
		if (!targetDropdown) {
			test.skip();
			return;
		}

		// Click to open the dropdown
		await targetDropdown.click();

		// Verify "Super User" option IS visible for super users
		await expect(page.getByRole('option', { name: 'Super User' })).toBeVisible();
	});
});
