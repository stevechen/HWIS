import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupByTag } from './convex-client';

test.describe('Edit Student - Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('editStatus');
	const studentId = `S_${suffix}`;
	const englishName = `Status_${suffix}`;
	let testStudent = false;

	test.beforeEach(async () => {
		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});
		testStudent = true;
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', `e2e-test_${suffix}`);
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Wait for student to appear in list (Convex reactivity)
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});

	test('can update student status', async ({ page }) => {
		// Search for the student to filter the list
		await page.getByRole('textbox', { name: 'Search students' }).fill(englishName);

		// Edit status through the toggle
		await page.getByRole('button', { name: `Toggle ${studentId} status` }).click();
		await expect(page.getByRole('button', { name: `Toggle ${studentId} status` })).toHaveText(
			'Not Enrolled'
		);

		// Find and click edit button for this student - look for Pencil icon button
		const studentRow = page.getByRole('row', { name: englishName });
		const editButton = studentRow
			.getByRole('button')
			.filter({ has: page.locator('svg') })
			.first();
		await editButton.click();

		// Wait for dialog and change status
		const dialog = page.getByRole('dialog', { name: 'Student Form' });
		await expect(dialog).toBeVisible();

		// Select the status dropdown and change it
		// Use a more specific selector to target the status dropdown
		const statusSelect = dialog.getByLabel('Status');
		await statusSelect.selectOption('Enrolled');

		// Click Update button
		await dialog.getByRole('button', { name: 'Update student' }).click();

		// Wait for dialog to close and Convex to update
		await expect(dialog).not.toBeVisible();

		// Clear search filter to see all students
		await page.getByRole('textbox', { name: 'Search students' }).fill('');

		// Clear status filter to ensure all students are visible
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}

		// Verify the specific student's status was updated to "Enrolled"
		// The test is specific because we created a unique student and verify their status
		const updatedStudentRow = page.getByRole('row', { name: englishName });
		await expect(updatedStudentRow).toBeVisible();
		await expect(updatedStudentRow.getByText('Enrolled')).toBeVisible();
	});
});
