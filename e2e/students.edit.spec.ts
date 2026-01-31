import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
// Mock auth removed - using real storageState files now
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Edit Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForTimeout(1000);
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('editStudent');
		try {
			await cleanupTestData(suffix);
		} catch {
			console.log(`[TEST] Cleanup skipped for editStudent`);
		}
	});

	test('can update student status', async ({ page }) => {
		const suffix = getTestSuffix('editStatus');
		const studentId = `S_${suffix}`;
		const englishName = `Status_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		// Wait for student to appear in list (Convex reactivity)
		await expect(page.getByText(englishName)).toBeVisible({ timeout: 15000 });

		// Search for the student to filter the list
		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await searchInput.fill(englishName);

		// Find and click edit button for this student - look for Pencil icon button
		const studentRow = page.locator('tr').filter({ hasText: englishName });
		const editButton = studentRow
			.locator('button')
			.filter({ has: page.locator('svg') })
			.first();
		await editButton.click();

		// Wait for dialog and change status
		await expect(page.locator('[role="dialog"]').first()).toBeVisible();

		// Select the status dropdown and change it
		const statusSelect = page
			.locator('select')
			.filter({ hasText: /Enrolled|Not Enrolled/ })
			.first();
		await statusSelect.selectOption('Not Enrolled');

		// Click Update button
		await page.locator('button').filter({ hasText: 'Update' }).click();

		// Wait for dialog to close
		await expect(page.locator('[role="dialog"]').first()).not.toBeVisible();

		// Verify status changed
		await searchInput.fill(englishName);
		await page.waitForTimeout(500);

		// Check for the status badge text
		const pageContent = await page.content();
		expect(pageContent).toContain('Not Enrolled');
	});
});
