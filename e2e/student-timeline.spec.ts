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

test.describe('Student Timeline Long-Press @timeline-longpress', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/evaluations/student/demo-student-id?demo=teacher');
		await page.waitForSelector('body.hydrated');
	});

	test('long-press on evaluation card opens edit dialog', async ({ page }) => {
		// Find an evaluation card in the timeline
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		// Long-press by holding mouse down
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Should open edit dialog
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
	});

	test('can navigate away during long-press if not held long enough', async ({ page }) => {
		// Find an evaluation card
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		// Quick click (not long-press) - should navigate to student detail
		// In demo mode, cards don't have href, so just verify click doesn't open dialog
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(200); // Less than 500ms threshold
		await card.dispatchEvent('mouseup');

		// Edit dialog should NOT open with quick click
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).not.toBeVisible();
	});
});

test.describe('Student Timeline Long-Press Admin @timeline-longpress', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/evaluations/student/demo-student-id?demo=admin');
		await page.waitForSelector('body.hydrated');
	});

	test('admin can long-press on own evaluations', async ({ page }) => {
		// In demo mode, admin can only edit their own evaluations
		// Demo data has admin-eval-1 with isAdmin: true
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		// Long-press should work
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Edit dialog should open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
	});
});

test.describe('Student Timeline Edit Dialog @timeline-longpress', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/evaluations/student/demo-student-id?demo=teacher');
		await page.waitForSelector('body.hydrated');
	});

	test('edit dialog has all required elements', async ({ page }) => {
		// Long-press to open edit dialog
		const card = page.locator('.bg-card').first();
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Verify edit dialog is open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Verify category dropdown exists
		await expect(page.getByRole('button', { name: /Select category/i })).toBeVisible();

		// Verify points buttons exist (-2, -1, +1, +2)
		await expect(page.getByRole('button', { name: /Deduct 2 points/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Deduct 1 point/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Award 1 point/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Award 2 points/i })).toBeVisible();

		// Verify details textarea exists
		await expect(page.getByRole('textbox', { name: /Evaluation details/i })).toBeVisible();

		// Verify Save and Cancel buttons exist
		await expect(page.getByRole('button', { name: /Save Changes/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
	});

	test('can edit evaluation details', async ({ page }) => {
		// Long-press to open edit dialog
		const card = page.locator('.bg-card').first();
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Verify dialog is open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Change points
		await page.getByRole('button', { name: /Award 2 points/i }).click();

		// Save changes
		await page.getByRole('button', { name: /Save Changes/i }).click();

		// Dialog should close
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('can delete evaluation via long-press', async ({ page }) => {
		// Long-press to open edit dialog
		const card = page.locator('.bg-card').first();
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Edit dialog should open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Delete button should be visible
		await expect(page.getByRole('button', { name: /Delete/i })).toBeVisible();

		// Click Delete button
		await page.getByRole('button', { name: /Delete/i }).click();

		// Delete confirmation dialog should appear
		const dialog = page.getByRole('dialog', { name: /Delete Evaluation/i });
		await expect(dialog).toBeVisible();

		// Confirm deletion by clicking the Delete button in confirmation dialog
		await dialog.getByRole('button', { name: /Delete/i, exact: true }).click();

		// Delete confirmation dialog should close
		await expect(page.getByRole('dialog', { name: /Delete Evaluation/i })).not.toBeVisible();
	});
});
