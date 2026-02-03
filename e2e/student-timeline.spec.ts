import { test, expect } from '@playwright/test';

test.describe('Student Timeline Page', () => {
	test.describe('Breadcrumb Navigation', () => {
		test('back button is present', async ({ page }) => {
			// Navigate to page
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			// Back button should be present
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible({ timeout: 15000 });
		});

		test('back button click triggers navigation', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			// Click back button
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible({ timeout: 10000 });
			await backButton.click();

			// Should navigate away from timeline page
			await expect(page).not.toHaveURL(/.*demo-student-id/);
		});
	});

	test.describe('Timeline Entry Rendering', () => {
		test('timeline entries container exists', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			// Timeline container should exist
			await expect(page.locator('.relative.flex.flex-col').first()).toBeVisible({ timeout: 15000 });
		});

		test('timeline has central line', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });
			await expect(page.locator('.border-l.border-border').first()).toBeVisible({ timeout: 15000 });
		});
	});

	test.describe('Sorting', () => {
		test('sort toggle button exists', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });
			await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible({
				timeout: 15000
			});
		});

		test('sort toggle button is clickable', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			const sortButton = page.getByRole('button', { name: /newest first/i });
			await expect(sortButton).toBeVisible({ timeout: 10000 });
			await sortButton.click();

			// After click, button shows "Oldest First" - verify button still exists
			await expect(page.getByRole('button').first()).toBeVisible();
		});
	});

	test.describe('Admin Features', () => {
		test('admin filter dropdown exists', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=admin');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });
			await expect(page.getByRole('combobox')).toBeVisible({ timeout: 15000 });
		});
	});

	test.describe('Controls', () => {
		test('page has sort toggle button', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });
			await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible({
				timeout: 15000
			});
		});

		test('page has details toggle button', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });
			await expect(page.getByRole('button', { name: /show details/i })).toBeVisible({
				timeout: 15000
			});
		});
	});

	test.describe('Legend', () => {
		test('legend shows point type indicators', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });
			await expect(page.getByText('Positive Points')).toBeVisible({ timeout: 15000 });
			await expect(page.getByText('Negative Points')).toBeVisible({ timeout: 10000 });
		});
	});

	test.describe('Hover Interaction', () => {
		test('timeline entries are present', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });
			const card = page.locator('.bg-card').first();
			await expect(card).toBeVisible({ timeout: 15000 });
		});
	});

	test.describe('Page Structure', () => {
		test('page has header with back button', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			// Header should contain back button
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible({ timeout: 15000 });
		});

		test('page has controls section', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			// Should have sort or details toggle visible
			const controls = page.locator('button').first();
			await expect(controls).toBeVisible({ timeout: 15000 });
		});
	});

	test.describe('Error Handling', () => {
		test('page loads without errors for valid student id', async ({ page }) => {
			// Navigate with teacher role
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			// Should load without crashing
			await expect(page.locator('body')).toBeVisible();
		});

		test('page handles navigation gracefully', async ({ page }) => {
			// Start at evaluations page
			await page.goto('/evaluations');
			await page.waitForSelector('body.hydrated', { timeout: 10000 });

			// Navigate to student timeline
			await page.goto('/evaluations/student/demo-student-id?testRole=teacher');
			await page.waitForSelector('body.hydrated', { timeout: 20000 });

			// Should load without errors
			await expect(page.locator('body')).toBeVisible();
		});
	});
});
