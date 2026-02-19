import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Authenticated Redirects @smoke', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test('redirects to evaluations when authenticated as teacher', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('body.hydrated');
		await page.waitForURL(/\/evaluations/);
		await expect(page).toHaveURL(/\/evaluations/);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	});
});

test.describe('Authenticated Admin Redirect @smoke', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('redirects to admin when authenticated as admin', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('body.hydrated');
		await page.waitForURL(/\/admin/);
		await expect(page).toHaveURL(/\/admin/);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	});
});
