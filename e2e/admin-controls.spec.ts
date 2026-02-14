import { test, expect } from '@playwright/test';
import { createStudent, cleanupByTag, useRole } from './convex-client';
import { getTestSuffix } from './helpers';

test.describe('Admin Controls Visibility @admin', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let testE2eTag: string;
	let studentId: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		const suffix = getTestSuffix('adminActions');
		studentId = `SA_${suffix}`;
		testE2eTag = `e2e-test_${suffix}`;

		await createStudent({
			studentId: studentId,
			englishName: `AdminTest_${suffix}`,
			chineseName: '管理測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});
		testStudent = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('table', { name: 'Student table' })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', testE2eTag);
	});

	test('sees Add Student button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Add new student' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Import students from file' })).toBeVisible();
	});

	test('sees action buttons (edit, delete) for students', async ({ page }) => {
		await expect(page.getByText('Loading students...')).not.toBeVisible();
		// Filter by student ID to ensure stability
		await page.getByPlaceholder('Search by name or student ID...').fill(studentId);

		// Wait for the student to appear
		await expect(page.getByRole('row', { name: studentId })).toBeVisible();

		// Admin should see edit pencil button
		await expect(page.getByRole('button', { name: `Edit ${studentId}` })).toBeVisible();

		// Admin should see delete trash button
		await expect(page.getByRole('button', { name: `Delete ${studentId}` })).toBeVisible();

		// Admin should see disable/warning button
		await expect(page.getByRole('button', { name: `Toggle ${studentId} status` })).toBeVisible();
	});
});

test.describe('Teacher User', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test('does not see Add Student button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Add new student' })).not.toBeVisible();
	});

	test('does not see Import button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Import students from file' })).not.toBeVisible();
	});

	test('does not see delete actions for students', async ({ page }) => {
		// Even if students are visible, delete actions should be hidden
		const deleteButtons = page.getByRole('button', { name: /delete/i });
		await expect(deleteButtons.first()).not.toBeVisible();
	});

	test('does not see disable/warning actions', async ({ page }) => {
		// Disable buttons should be hidden for teachers
		const disableButtons = page.getByRole('button', { name: /not enrolled/i });
		await expect(disableButtons.first()).not.toBeVisible();
	});
});
