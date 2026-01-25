import { test, expect } from '@playwright/test';

test.describe('Backup Page @backup', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/backup');
		await page.waitForSelector('body.hydrated');
	});

	test('displays backup management page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Backup/i })).toBeVisible();
	});

	test('has back button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Back' }).first()).toBeVisible();
	});

	test('displays force backup section', async ({ page }) => {
		await expect(page.getByText('Force Backup', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Force Backup Now' })).toBeVisible();
	});

	test('displays backup history section', async ({ page }) => {
		await expect(page.getByText('Backup History', { exact: true })).toBeVisible();
	});

	test('displays danger zone section', async ({ page }) => {
		await expect(page.getByText('Danger Zone', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Clear All Data' })).toBeVisible();
	});
});

test.describe('Audit Page @audit', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/audit');
		await page.waitForSelector('body.hydrated');
	});

	test('displays audit log page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Audit Log/i })).toBeVisible();
	});

	test('has back button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Back' }).first()).toBeVisible();
	});

	test('displays filter inputs', async ({ page }) => {
		await expect(page.getByLabel('Filter by student name')).toBeVisible();
		await expect(page.getByLabel('Filter by teacher name')).toBeVisible();
	});
});

test.describe('Academic Page @academic', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/academic');
		await page.waitForSelector('body.hydrated');
	});

	test('displays year-end reset page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Year-End Reset/i })).toBeVisible();
	});

	test('has back button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Back' }).first()).toBeVisible();
	});

	test('displays advance academic year section', async ({ page }) => {
		await expect(page.getByText('Advance Academic Year', { exact: true })).toBeVisible();
		await expect(page.getByText('Promote all enrolled students')).toBeVisible();
	});

	test('displays process information', async ({ page }) => {
		await expect(page.getByText('Advance Year & Clear Data')).toBeVisible();
	});
});
