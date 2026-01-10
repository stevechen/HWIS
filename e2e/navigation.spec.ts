import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('should navigate from home to login page directly', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('h2')).toHaveText('Sign In');
	});

	test('login page should have proper layout', async ({ page }) => {
		await page.goto('/login');

		// Check centering container
		const container = page.locator('.flex.h-screen.flex-col.items-center.justify-center');
		await expect(container).toBeVisible();

		// Check form card
		const formCard = page.locator(
			'.flex.w-full.max-w-md.flex-col.gap-4.rounded-lg.bg-white.p-6.shadow-md'
		);
		await expect(formCard).toBeVisible();
	});

	test('should handle page not found gracefully', async ({ page }) => {
		await page.goto('/nonexistent');

		// SvelteKit should show 404 page
		const pageContent = await page.content();
		expect(pageContent).toContain('404' || 'Page' || 'not found' || 'Error');
	});
});
