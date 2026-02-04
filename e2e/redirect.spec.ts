import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Login Page', () => {
	test('does not redirect to itself', async ({ page }) => {
		await page.goto('/login');
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign out' })).not.toBeVisible();
	});

	test('preserves callbackUrl after redirect', async ({ page }) => {
		await page.goto('/?callbackUrl=/tasks');
		await page.waitForURL(/\/login/);
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign out' })).not.toBeVisible();
	});

	test('shows loading state during auth check', async ({ page }) => {
		await page.goto('/login');
		await page.waitForSelector('body.hydrated');
		const loading = page.getByText('Loading...');
		await expect(loading)
			.toBeVisible()
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
		await page.waitForURL(/\/evaluations/);
		await expect(page).toHaveURL(/\/evaluations/);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	});
});

test.describe('Authenticated Admin', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('body.hydrated');
	});

	test('redirects to admin when authenticated as admin', async ({ page }) => {
		await page.waitForURL(/\/admin/);
		await expect(page).toHaveURL(/\/admin/);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	});
});
