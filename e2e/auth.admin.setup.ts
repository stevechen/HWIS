import { test as setup } from '@playwright/test';

setup('create admin auth', async ({ page }) => {
	await page.goto('/login');
	await page.waitForSelector('body.hydrated');
	await page.waitForURL('**/admin/**');

	// Save storage state for admin
	await page.context().storageState({
		path: 'e2e/.auth/admin.json'
	});
});
