import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('shows 404 for unknown routes', async ({ page }) => {
		await page.goto('/nonexistent');
		await page.waitForSelector('body.hydrated');
		const pageContent = await page.content();
		expect(pageContent).toContain('404');
	});
});
