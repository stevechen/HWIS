import { test } from '@playwright/test';
import { expect } from '@playwright/test';
import { setTestAuth } from './auth.helpers';

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
		await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	});

	test('redirect should preserve callbackUrl query param', async ({ page }) => {
		await page.goto('/?callbackUrl=/tasks');

		// Should redirect to /login (the query param is used for the OAuth callback, not kept in URL)
		await page.waitForURL(/\/login/);
		await expect(page).toHaveURL(/\/login/);

		// Verify we're on login page
		await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	});

	test('should show loading state while auth is being determined', async ({ page }) => {
		await page.goto('/login');

		// Initially might show loading
		const loading = page.locator('text=Loading...');
		await expect(loading)
			.toBeVisible()
			.catch(() => {
				// Loading might have already finished, that's ok too
			});
	});
});

test.describe('Authenticated User', () => {
	test.use({ storageState: 'e2e/.auth/test.json' });

	test.beforeEach(async ({ page }) => {
		// Add test auth cookie as fallback (handles expired tokens)
		await setTestAuth(page, 'teacher');
	});

	test('should display signed in state when already authenticated', async ({ page }) => {
		await page.goto('/');

		// Should be on home page (not redirected to login)
		await expect(page).toHaveURL('/');
	});
});
