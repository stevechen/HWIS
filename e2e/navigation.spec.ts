import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('should navigate from home to login page directly', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible();
	});

	test('login page should have proper layout', async ({ page }) => {
		await page.goto('/login');

		// Wait for the login form to appear - check for the Google button instead of specific CSS classes
		await expect(page.locator('button', { hasText: 'Sign in with Google' })).toBeVisible();
	});

	test('should handle page not found gracefully', async ({ page }) => {
		await page.goto('/nonexistent');

		// SvelteKit should show 404 page
		const pageContent = await page.content();
		expect(pageContent).toContain('404');
	});

	test('login page should display Google SSO button', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('button', { hasText: 'Sign in with Google' })).toBeVisible();
	});

	test('login page should display domain restriction note', async ({ page }) => {
		await page.goto('/login');
		const note = page.getByText('Only for HWIS staffs', { exact: false });
		await expect(note).toBeVisible();
	});
});
