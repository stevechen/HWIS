import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Login Page', () => {
	test('should load and display sign in heading', async ({ page }) => {
		await page.goto('/login');
		// Wait for hydration and auth check
		await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible();
	});

	test('should display Google SSO button', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('button', { hasText: 'Sign in with Google' })).toBeVisible();
	});

	test('should display Google logo in button', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('svg').first()).toBeVisible();
	});

	test('should display domain restriction note', async ({ page }) => {
		await page.goto('/login');
		// Wait for the page to load and check the note is present
		const note = page.getByText('Only for HWIS staffs', { exact: false });
		await expect(note).toBeVisible();
	});
});
