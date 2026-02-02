import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Permission Tests', () => {
	test.describe('Unauthenticated Access', () => {
		test('redirects to /login for /admin/* routes', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');
			await page.waitForURL(/\/login/);
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('redirects to /login for root path', async ({ page }) => {
			await page.goto('/');
			await page.waitForSelector('body.hydrated');
			await page.waitForURL(/\/login/);
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('redirects to /login for /evaluations routes', async ({ page }) => {
			await page.goto('/evaluations');
			await page.waitForSelector('body.hydrated');
			await page.waitForURL(/\/login/);
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('redirects to /login for /evaluations/new', async ({ page }) => {
			await page.goto('/evaluations/new');
			await page.waitForSelector('body.hydrated');
			await page.waitForURL(/\/login/);
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('displays login page structure', async ({ page }) => {
			await page.goto('/login');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
			await expect(page.locator('button', { hasText: 'Sign in with Google' })).toBeVisible();
		});
	});
});
