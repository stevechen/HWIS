import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard @admin', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin');
		await page.waitForSelector('body.hydrated');
	});

	test('can navigate to students page', async ({ page }) => {
		await page.getByRole('link', { name: 'Manage Students' }).click();
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/admin\/students/);
	});

	test('can navigate to categories page', async ({ page }) => {
		await page.getByRole('link', { name: 'Manage Categories' }).click();
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/admin\/categories/);
	});

	test('can navigate to users page', async ({ page }) => {
		await page.getByRole('link', { name: 'Manage Users' }).click();
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/admin\/users/);
	});

	test('can navigate to backup page', async ({ page }) => {
		await page.getByRole('link', { name: 'Manage Backups' }).click();
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/admin\/backup/);
	});

	test('can navigate to audit page', async ({ page }) => {
		await page.getByRole('link', { name: 'View Audit Log' }).click();
		await page.waitForSelector('body.hydrated');
		await expect(page).toHaveURL(/\/admin\/audit/);
	});
});
