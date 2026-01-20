import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Permission Tests', () => {
	test.describe('Unauthenticated Access', () => {
		test('should redirect to /login when visiting /admin/* while unauthenticated', async ({
			page
		}) => {
			await page.goto('/admin/students');

			await page.waitForURL(/\/login/);
			await expect(page).toHaveURL(/\/login/);

			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('should redirect to /login when visiting /evaluations/* while unauthenticated', async ({
			page
		}) => {
			await page.goto('/evaluations');

			await page.waitForURL(/\/login/);
			await expect(page).toHaveURL(/\/login/);

			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('should redirect to /login when visiting / while unauthenticated', async ({ page }) => {
			await page.goto('/');

			await page.waitForURL(/\/login/);
			await expect(page).toHaveURL(/\/login/);

			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});
	});
});
