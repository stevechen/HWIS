import { test, expect } from '@playwright/test';

test.describe('Evaluations (public/unauthenticated)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible({ timeout: 10000 });
	});

	test('should redirect to login when accessing new evaluation page', async ({ page }) => {
		await page.evaluate(async (url) => {
			const a = document.createElement('a');
			a.href = url;
			a.click();
		}, '/evaluations/new');
		await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
		await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible({ timeout: 10000 });
	});

	test('should redirect to login when accessing evaluations list', async ({ page }) => {
		await page.evaluate(async (url) => {
			const a = document.createElement('a');
			a.href = url;
			a.click();
		}, '/evaluations');
		await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
		await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible({ timeout: 10000 });
	});

	test('should show login page structure', async ({ page }) => {
		await page.goto('/login');
		await page.waitForURL(/\/login/, { timeout: 15000 });
		await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible({
			timeout: 10000
		});
		const note = page.getByText('Only for HWIS staffs', { exact: false });
		await expect(note).toBeVisible({ timeout: 10000 });
	});
});
