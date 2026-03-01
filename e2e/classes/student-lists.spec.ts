import { test, expect } from '@playwright/test';
import { getTestSuffix, getUniqueTag } from '../helpers';
import { cleanupByTag, useRole, createStudent } from '../convex-client';

test.describe('Student List Visibility', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('studentLists');
	let testDataCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/classes');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testDataCreated) {
			await cleanupByTag('students', e2eTag);
		}
	});

	test('can toggle global student list visibility', async ({ page }) => {
		// Find the students toggle button by aria-label
		const toggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await expect(toggleBtn).toBeVisible();

		// Get initial text
		const initialText = await toggleBtn.textContent();

		// Click to toggle
		await toggleBtn.click();

		// Wait a moment for state change
		await page.waitForTimeout(200);

		// Text should have changed
		const newText = await toggleBtn.textContent();
		expect(newText).not.toBe(initialText);
	});

	test('student names displayed in list when visible', async ({ page }) => {
		// Create a test student
		const suffix = getTestSuffix('list');
		await createStudent({
			studentId: '7001001',
			englishName: `ListTest_${suffix}`,
			grade: 7,
			class: '1',
			e2eTag
		});
		testDataCreated = true;

		// Refresh to see the student
		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Show student lists
		const toggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await toggleBtn.click();

		// Wait for student lists to render
		await page.waitForTimeout(500);

		// Verify student name is displayed
		await expect(page.getByText(`ListTest_${suffix}`)).toBeVisible();
	});
});
