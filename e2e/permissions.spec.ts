import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test.describe('Permission Tests', () => {
	test.describe('Unauthenticated Access', () => {
		test('redirects to /login for /admin/* routes', async ({ page }) => {
			await page.goto('/admin/students', { waitUntil: 'domcontentloaded' });
			await page.waitForURL(/\/login/, { timeout: 10000 });
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('redirects to /login for root path', async ({ page }) => {
			await page.goto('/', { waitUntil: 'domcontentloaded' });
			await page.waitForURL(/\/login/, { timeout: 10000 });
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('redirects to /login for /evaluations routes', async ({ page }) => {
			await page.goto('/evaluations', { waitUntil: 'domcontentloaded' });
			await page.waitForURL(/\/login/, { timeout: 10000 });
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('redirects to /login for /evaluations/new', async ({ page }) => {
			await page.goto('/evaluations/new', { waitUntil: 'domcontentloaded' });
			await page.waitForURL(/\/login/, { timeout: 10000 });
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
		});

		test('displays login page structure', async ({ page }) => {
			await page.goto('/login', { waitUntil: 'domcontentloaded' });
			await page.waitForSelector('body.hydrated');
			await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
			await expect(page.locator('button', { hasText: 'Sign in with Google' })).toBeVisible();
		});
	});
});
