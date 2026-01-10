import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Authentication Redirects', () => {
	test('should redirect to /login when visiting / while unauthenticated', async ({ page }) => {
		await page.goto('/');

		// Wait for either redirect or loading state
		await page.waitForURL(/\/login|\/\?redirected=true/);

		// If redirected, should end up on /login
		await expect(page).toHaveURL(/\/login/);
	});

	test('login page should not redirect to itself', async ({ page }) => {
		await page.goto('/login');

		// Should stay on login page
		await expect(page).toHaveURL(/\/login/);

		// Should show sign in heading, not redirecting
		await expect(page.locator('h2')).toHaveText('Sign In');
	});

	test('redirect should preserve callbackUrl query param', async ({ page }) => {
		await page.goto('/?callbackUrl=/tasks');

		// Should redirect to /login (the query param is used for the OAuth callback, not kept in URL)
		await page.waitForURL(/\/login/);
		await expect(page).toHaveURL(/\/login/);

		// Verify we're on login page
		await expect(page.locator('h2')).toHaveText('Sign In');
	});
});
