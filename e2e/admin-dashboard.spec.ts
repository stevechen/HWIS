import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard @admin', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin');
		await page.waitForSelector('body.hydrated');
	});

	test('displays admin dashboard', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
	});

	test('has back button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
	});

	test('displays system data card', async ({ page }) => {
		await expect(page.getByText('System Data')).toBeVisible();
		await expect(page.getByText('Seed Initial Data')).toBeVisible();
	});

	test('displays students card', async ({ page }) => {
		await expect(page.getByText('Student Management')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Manage Students' })).toBeVisible();
	});

	test('displays categories card', async ({ page }) => {
		await expect(page.getByText('Categories')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Manage Categories' })).toBeVisible();
	});

	test('displays users card', async ({ page }) => {
		await expect(page.getByText('User Accounts')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Manage Users' })).toBeVisible();
	});

	test('displays evaluations card', async ({ page }) => {
		await expect(page.getByText('Evaluation History')).toBeVisible();
	});

	test('displays audit log card', async ({ page }) => {
		await expect(page.getByText('Audit Log')).toBeVisible();
		await expect(page.getByRole('link', { name: 'View Audit Log' })).toBeVisible();
	});

	test('displays backup card', async ({ page }) => {
		await expect(page.getByText('Backup')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Manage Backups' })).toBeVisible();
	});

	test('displays academic year card', async ({ page }) => {
		await expect(page.getByText('Archive & Reset')).toBeVisible();
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
