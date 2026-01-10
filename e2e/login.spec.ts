import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Login Page', () => {
	test('should load and display sign in heading', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('h2')).toHaveText('Sign In');
	});

	test('should display Google SSO button', async ({ page }) => {
		await page.goto('/login');
		const googleButton = page.locator('button', { hasText: 'Sign in with Google' });
		await expect(googleButton).toBeVisible();
	});

	test('should display Google logo in button', async ({ page }) => {
		await page.goto('/login');
		const googleSvg = page.locator('svg').first();
		await expect(googleSvg).toBeVisible();
	});

	test('should not show sign out button on login page', async ({ page }) => {
		await page.goto('/login');
		const signOutButton = page.locator('button', { hasText: 'Sign out' });
		await expect(signOutButton).not.toBeVisible();
	});
});
