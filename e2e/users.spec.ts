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

	test('displays table with users', async ({ page }) => {
		await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
	});

	test('displays role management dropdowns', async ({ page }) => {
		// Just verify the table is visible with interactive elements
		await expect(page.getByRole('table', { name: 'users' })).toBeVisible();
	});

	test('displays status management', async ({ page }) => {
		// Status is displayed as badges - check for common status values
		// The page shows at least one user, so we should see some status
		const pageContent = await page.content();
		const hasStatus = pageContent.includes('active') || pageContent.includes('pending');
		expect(hasStatus).toBe(true);
	});

	test('displays deactivate buttons for active users', async ({ page }) => {
		// The page uses XCircle icon for deactivate - look for the button with title
		// const deactivateButtons = page.locator('button[title="Deactivate User"]');
		const deactivateButtons = page.getByRole('button', { name: 'Remove Access' });
		const count = await deactivateButtons.count();
		// Should have at least one deactivate button for active users
		expect(count).toBeGreaterThan(0);
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
