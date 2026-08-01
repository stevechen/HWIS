import { test, expect } from './fixtures';
import { useRole } from './convex-client';

test.describe('Academic Page @academic @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/academic');
		await page.waitForSelector('body.hydrated');
	});

	test('page renders with title and description', async ({ page }) => {
		await expect(page.getByText('Advance Academic Year').first()).toBeVisible();
		await expect(page.getByText('Promote all enrolled students')).toBeVisible();
	});

	test('displays warning about destructive actions', async ({ page }) => {
		await page.getByRole('button', { name: 'Advance Year & Clear Data' }).click();
		await expect(page.getByText('This action cannot be undone!')).toBeVisible();
	});

	test('advance year button opens confirmation dialog', async ({ page }) => {
		await page.getByRole('button', { name: 'Advance Year & Clear Data' }).click();
		await expect(
			page.getByRole('heading', { name: 'Advance Academic Year', level: 2 })
		).toBeVisible();
	});

	test('confirmation dialog lists what will happen', async ({ page }) => {
		await page.getByRole('button', { name: 'Advance Year & Clear Data' }).click();
		await expect(page.getByText('Create a backup of all data')).toBeVisible();
		await expect(page.getByText('Clear ALL evaluations', { exact: true })).toBeVisible();
		await expect(page.getByText('Delete ALL grade 12 students')).toBeVisible();
		await expect(page.getByText('Delete ALL Not Enrolled students')).toBeVisible();
		await expect(page.getByText('Advance enrolled students')).toBeVisible();
	});

	test('cancel button closes confirmation dialog without advancing', async ({ page }) => {
		await page.getByRole('button', { name: 'Advance Year & Clear Data' }).click();
		await expect(
			page.getByRole('heading', { name: 'Advance Academic Year', level: 2 })
		).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(
			page.getByRole('heading', { name: 'Advance Academic Year', level: 2 })
		).not.toBeVisible();
	});
});
