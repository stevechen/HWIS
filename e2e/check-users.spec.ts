import { test as setup, expect } from '@playwright/test';

setup.use({ storageState: 'e2e/.auth/admin.json' });

setup('check test users in database', async ({ page }) => {
	await page.goto('http://localhost:5173/');
	await page.waitForSelector('body.hydrated');

	await page.goto('http://localhost:5173/admin/academic');
	await page.waitForSelector('body.hydrated');

	const url = page.url();

	expect(url).toContain('/admin/academic');
});
