import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Permission Tests @smoke', () => {
	test('unauthenticated user is redirected to login for admin route', async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForURL(/\/login/);
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
	});
});
