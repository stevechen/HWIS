import { test, expect } from '@playwright/test';

test.describe('Users Page @users', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForSelector('body.hydrated');
	});

	test('displays user accounts page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'User Accounts' })).toBeVisible();
	});

	test('has back button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Back' }).first()).toBeVisible();
	});

	test('displays table with users', async ({ page }) => {
		await expect(page.getByText('Name')).toBeVisible();
		await expect(page.getByText('Email')).toBeVisible();
		await expect(page.getByText('Role')).toBeVisible();
		await expect(page.getByText('Status')).toBeVisible();
	});

	test('displays role management dropdowns', async ({ page }) => {
		await expect(page.getByRole('combobox', { name: /role/i })).toBeVisible();
	});

	test('displays status management', async ({ page }) => {
		await expect(page.getByText('Active')).toBeVisible();
		await expect(page.getByText('Pending')).toBeVisible();
	});

	test('displays approve buttons for pending users', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
	});

	test('displays reject buttons for pending users', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
	});

	test('displays update role buttons', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Update Role' })).toBeVisible();
	});

	test('can change user role', async ({ page }) => {
		const roleSelect = page.getByRole('combobox').first();
		await roleSelect.selectOption('admin');
		await expect(page.getByRole('button', { name: 'Update Role' })).toBeVisible();
	});
});
