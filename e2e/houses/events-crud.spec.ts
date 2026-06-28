import { test, expect } from '@playwright/test';
import { getTestSuffix } from '../helpers';
import {
	cleanupByTag,
	cleanupAllHouseEvents,
	createStudent,
	createCategory
} from '../convex-client';

test.describe('House Events Management - E2E @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;

	test.beforeEach(async ({ page }) => {
		suffix = getTestSuffix('events');
		e2eTag = `e2e-events-${suffix}`;

		// Seed some data for context
		await createStudent({
			studentId: `STU_EVT_${suffix}`,
			englishName: `TestStudent_${suffix}`,
			chineseName: '測試生',
			grade: 9,
			status: 'Enrolled',
			e2eTag
		});

		await createCategory({
			name: `TestCat_${suffix}`,
			e2eTag
		});

		await page.goto('/houses');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupAllHouseEvents();
		await cleanupByTag('all', e2eTag);
	});

	test('can create new event with house points', async ({ page }) => {
		await page.goto('/houses');
		await page.waitForSelector('body.hydrated');

		// Click New Event
		await page.getByRole('button', { name: 'New Event' }).click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();

		// Fill form with unique title
		const eventTitle = `Test Event ${suffix}`;
		await page.getByLabel('Event Title').fill(eventTitle);
		await page.getByLabel('Start Date').fill('2024-01-01');
		await page.getByLabel('End Date').fill('2024-01-15');

		// Add house points
		await page.getByLabel('Heracles').fill('10');
		await page.getByLabel('Wukong').fill('5');

		// Submit
		await page.getByRole('button', { name: 'Create Event' }).click();

		// Wait for dialog to close
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Verify event appears
		await expect(page.getByText(eventTitle)).toBeVisible();
	});

	test('can edit existing event', async ({ page }) => {
		await page.goto('/houses');
		await page.waitForSelector('body.hydrated');

		// First create an event
		const originalTitle = `Original Event ${suffix}`;
		const updatedTitle = `Updated Event ${suffix}`;
		await page.getByRole('button', { name: 'New Event' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByLabel('Event Title').fill(originalTitle);
		await page.getByLabel('Start Date').fill('2024-01-01');
		await page.getByLabel('End Date').fill('2024-01-10');
		await page.getByRole('button', { name: 'Create Event' }).click();
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Wait for event to appear
		await expect(page.getByText(originalTitle)).toBeVisible();

		// Now edit it — scope to the event we just created
		await page
			.locator('[data-slot="card"]')
			.filter({ hasText: originalTitle })
			.getByRole('button', { name: 'Edit' })
			.click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByLabel('Event Title').fill(updatedTitle);
		await page.getByRole('button', { name: 'Save Changes' }).click();
		await expect(page.getByRole('dialog', { name: 'Edit Event' })).not.toBeVisible();

		// Verify update - the new title should be visible
		await expect(page.getByText(updatedTitle)).toBeVisible();
	});

	test('can delete event', async ({ page }) => {
		await page.goto('/houses');
		await page.waitForSelector('body.hydrated');

		// Create event
		const deleteTitle = `ToDelete Event ${suffix}`;
		await page.getByRole('button', { name: 'New Event' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByLabel('Event Title').fill(deleteTitle);
		await page.getByLabel('Start Date').fill('2024-01-01');
		await page.getByLabel('End Date').fill('2024-01-10');
		await page.getByRole('button', { name: 'Create Event' }).click();
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Wait for event to appear
		await expect(page.getByText(deleteTitle)).toBeVisible();

		// Delete — scope to the event we just created
		await page
			.locator('[data-slot="card"]')
			.filter({ hasText: deleteTitle })
			.getByRole('button', { name: 'Delete' })
			.click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('button', { name: 'Delete Event' }).click();
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Reload to ensure data is refreshed
		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Verify deleted
		await expect(page.getByText(deleteTitle)).not.toBeVisible();
	});
});
