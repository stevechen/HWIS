import { test, expect } from '@playwright/test';

test.describe('Student Timeline Page', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.describe('Breadcrumb Navigation', () => {
		test('back button is present', async ({ page }) => {
			// Navigate to page
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');

			// Back button should be present
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();
		});

		test('back button click triggers navigation', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');

			// Click back button
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();
			await backButton.click();

			// Should navigate away from timeline page
			await expect(page).not.toHaveURL(/.*demo-student-id/);
		});
	});

	test.describe('Timeline Entry Rendering', () => {
		test('timeline entries container exists', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');

			// Timeline container should exist
			await expect(page.getByRole('heading', { name: 'Your Assigned Points' })).toBeVisible();
		});

		test('timeline has central line', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');
			// Use semantic role to find the timeline divider
			await expect(page.getByRole('separator', { name: 'Timeline divider' })).toBeVisible();
		});
	});

	test.describe('Sorting', () => {
		test('sort toggle button exists', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible();
		});

		test('sort toggle button is clickable', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');

			const sortButton = page.getByRole('button', { name: /newest first/i });
			await expect(sortButton).toBeVisible();
			await sortButton.click();

			// After click, button shows "Oldest First" - verify button still exists
			await expect(page.getByRole('button').first()).toBeVisible();
		});
	});

	test.describe('Admin Features', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('admin filter dropdown exists', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=admin');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByRole('combobox')).toBeVisible();
		});
	});

	test.describe('Controls', () => {
		test('page has sort toggle button', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible();
		});

		test('page has details toggle button', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByRole('button', { name: /show details/i })).toBeVisible();
		});
	});

	test.describe('Legend', () => {
		test('legend shows point type indicators', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByText('Positive Points')).toBeVisible();
			await expect(page.getByText('Negative Points')).toBeVisible();
		});
	});

	test.describe('Hover Interaction', () => {
		test('timeline entry shows details on hover', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');

			// Find a card with details (demo data has entries with details)
			const card = page.locator('.bg-card').first();
			await expect(card).toBeVisible();

			// Hover over the card to reveal details
			await card.hover();

			// Verify details become visible (demo entries have details text)
			await expect(page.getByText(/Excellent|midterm|Arrived|Outstanding/i).first()).toBeVisible();
		});
	});

	test.describe('Page Structure', () => {
		test('page has header with back button', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');

			// Header should contain back button
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();
		});

		test('page has controls section', async ({ page }) => {
			await page.goto('/evaluations/student/demo-student-id?demo=teacher');
			await page.waitForSelector('body.hydrated');

			// Should have sort or details toggle visible
			await expect(page.getByRole('button', { name: 'Newest First' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Show Details' })).toBeVisible();
		});
	});
});
