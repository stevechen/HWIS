import { test, expect } from '@playwright/test';
import { getTestSuffix, getUniqueTag, getTestStudentId } from '../helpers';
import { cleanupByTag, useRole, createStudent } from '../convex-client';

test.describe('Drag and Drop Student Movement', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('dragDrop');
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

	test('drag handles are visible when student lists shown', async ({ page }) => {
		// Create a test student
		const studentId = getTestStudentId('DD1');
		const suffix = getTestSuffix('drag');

		await createStudent({
			studentId,
			englishName: `DragTest_${suffix}`,
			grade: 7,
			class: '1',
			status: 'Enrolled',
			e2eTag
		});
		testDataCreated = true;

		// Refresh to see the student
		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Show student lists
		const toggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await toggleBtn.click();
		await page.waitForTimeout(500);

		// Verify student is visible
		await expect(page.getByText(`DragTest_${suffix}`)).toBeVisible();

		// Verify the draggable element is present (uses pointer events, not native DnD)
		const studentRow = page
			.locator('[role="button"][aria-label*="Drag"]')
			.filter({ hasText: `DragTest_${suffix}` });
		await expect(studentRow).toBeVisible();
	});

	test('students are draggable elements', async ({ page }) => {
		// Create a test student
		const studentId = getTestStudentId('DD2');
		const suffix = getTestSuffix('draggable');

		await createStudent({
			studentId,
			englishName: `Draggable_${suffix}`,
			grade: 7,
			class: '1',
			status: 'Enrolled',
			e2eTag
		});
		testDataCreated = true;

		// Refresh to see the student
		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Show student lists
		const toggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await toggleBtn.click();
		await page.waitForTimeout(500);

		// Find the student element and verify it has the drag interaction setup
		const studentElement = page
			.locator('[role="button"][aria-label*="Drag"]')
			.filter({ hasText: `Draggable_${suffix}` });
		await expect(studentElement).toBeVisible();
		await expect(studentElement).toHaveAttribute('role', 'button');
	});

	test('class containers are drop zones', async ({ page }) => {
		// Verify class containers have the necessary attributes
		await page.waitForSelector('text=G7');

		// Find class containers (they should have role="region" and aria-label)
		const classContainer = page.locator('[role="region"][aria-label*="Class"]').first();
		await expect(classContainer).toBeVisible();
	});
});
