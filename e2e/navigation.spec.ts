import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('navigates directly to login page', async ({ page }) => {
		await page.goto('/login');
		await page.waitForSelector('body.hydrated');
		await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible();
	});

	test('shows 404 for unknown routes', async ({ page }) => {
		await page.goto('/nonexistent');
		await page.waitForSelector('body.hydrated');
		const pageContent = await page.content();
		expect(pageContent).toContain('404');
	});
});

test.describe('Login Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/login');
		await page.waitForSelector('body.hydrated');
	});

	test('displays sign in heading', async ({ page }) => {
		await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible();
	});

	test('displays Google SSO button', async ({ page }) => {
		await expect(page.locator('button', { hasText: 'Sign in with Google' })).toBeVisible();
	});

	test('displays Google logo in button', async ({ page }) => {
		const googleButton = page.locator('button', { hasText: 'Sign in with Google' });
		await expect(googleButton.locator('svg')).toBeVisible();
	});

	test('displays domain restriction note', async ({ page }) => {
		const note = page.getByText(/only.*hwis.*staffs/i);
		await expect(note).toBeVisible();
	});
});
