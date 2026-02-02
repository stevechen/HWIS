import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
// Mock auth removed - using real storageState files now
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Edit Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('editStudent');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Cleanup skipped
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
		await expect(page.getByText(englishName)).toBeVisible();

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
		// Use a more specific selector to target the status dropdown
		const statusSelect = page.locator('[role="dialog"] select[aria-label="Status"]').first();
		await statusSelect.selectOption('Not Enrolled');

		// Click Update button
		await page.locator('button').filter({ hasText: 'Update' }).click();

		// Wait for dialog to close and Convex to update
		await expect(page.locator('[role="dialog"]').first()).not.toBeVisible();

		// Clear search filter to see all students
		await searchInput.fill('');

		// Clear status filter to ensure all students are visible
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}

		// Verify the specific student's status was updated to "Not Enrolled"
		// The test is specific because we created a unique student and verify their status
		const updatedStudentRow = page.locator('tr').filter({ hasText: englishName });
		await expect(updatedStudentRow).toBeVisible();
		await expect(updatedStudentRow.getByText('Not Enrolled')).toBeVisible({ timeout: 10000 });
	});
});
