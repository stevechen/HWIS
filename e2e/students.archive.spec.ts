import { test, expect } from '@playwright/test';

test.describe('Archive & Reset Page - Static Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:5173/admin/academic');
		await page.waitForSelector('body.hydrated');
	});

	test('page loads and shows correct heading', async ({ page }) => {
		const url = page.url();
		expect(url).toContain('/admin/academic');

		await expect(page.getByRole('heading', { name: /Year-End Reset/i })).toBeVisible();
	});

	test('shows advance academic year section', async ({ page }) => {
		// Check if we're on the right page
		await expect(page.getByRole('heading', { name: /Year-End Reset/i })).toBeVisible();

		await expect(page.getByText(/Advance Academic Year/i)).toBeVisible();
	});

	test('shows advance year button', async ({ page }) => {
		const advanceButton = page.getByRole('button', { name: /Advance/i });
		await expect(advanceButton.first()).toBeVisible();
	});
});
