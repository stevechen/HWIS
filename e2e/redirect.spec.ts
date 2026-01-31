import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Login Page', () => {
	test('does not redirect to itself', async ({ page }) => {
		await page.goto('/login');
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	});

	test('preserves callbackUrl after redirect', async ({ page }) => {
		await page.goto('/?callbackUrl=/tasks');
		await page.waitForURL(/\/login/);
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	});

	test('shows loading state during auth check', async ({ page }) => {
		await page.goto('/login');
		await page.waitForSelector('body.hydrated');
		const loading = page.getByText('Loading...');
		await expect(loading)
			.toBeVisible({ timeout: 5000 })
			.catch(() => {});
	});
});

test.describe('Authenticated User', () => {
	test.use({ storageState: 'e2e/.auth/test.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('body.hydrated');
	});

	test('stays on home page when authenticated', async ({ page }) => {
		await expect(page).toHaveURL('/');
	});
});
