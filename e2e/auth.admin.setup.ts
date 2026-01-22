import { test as setup } from '@playwright/test';

setup('create admin auth', async ({ page }) => {
	await page.goto('/login');
	await page.waitForURL('**/admin/**', { timeout: 30000 });

	// Save storage state for admin
	await page.context().storageState({
		path: 'e2e/.auth/admin.json'
	});

	console.log('Admin auth saved to e2e/.auth/admin.json');
});
