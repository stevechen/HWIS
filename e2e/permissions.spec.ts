import { test, expect } from '@playwright/test';
import { useRole } from './convex-client';

test.describe('Permission Tests @smoke', () => {
	test('unauthenticated user is redirected to login for admin route', async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForURL(/\/login/);
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
	});

	test.describe('Teacher user redirect from admin routes', () => {
		test.use({ storageState: 'e2e/.auth/teacher.json' });

		test.beforeEach(async () => {
			useRole('teacher');
		});

		const adminRoutes = [
			'/admin/categories',
			'/admin/evaluations',
			'/admin/users',
			'/admin/audit',
			'/admin/classes',
			'/admin/houses',
			'/admin/weekly-reports'
		];

		for (const route of adminRoutes) {
			test(`teacher is redirected from ${route} to evaluations`, async ({ page }) => {
				await page.goto(route);
				await page.waitForSelector('body.hydrated');
				await expect(page).toHaveURL(/\/evaluations/);
			});
		}
	});
});
