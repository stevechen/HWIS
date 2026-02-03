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
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('body.hydrated');
	});

	test('redirects to evaluations when authenticated as teacher', async ({ page }) => {
		await page.waitForURL(/\/evaluations/, { timeout: 10000 });
		await expect(page).toHaveURL(/\/evaluations/);
	});
});

test.describe('Authenticated Admin', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('body.hydrated');
	});

	test('redirects to admin when authenticated as admin', async ({ page }) => {
		await page.waitForURL(/\/admin/, { timeout: 10000 });
		await expect(page).toHaveURL(/\/admin/);
	});
});
