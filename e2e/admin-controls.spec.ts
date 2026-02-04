import { test, expect } from '@playwright/test';
import { createStudent, cleanupTestData } from './convex-client';
import { getTestSuffix } from './students.shared';

test.describe('Admin Controls Visibility @admin', () => {
	let testE2eTag: string | null = null;

	test.afterEach(async () => {
		try {
			if (testE2eTag) {
				await cleanupTestData(testE2eTag);
			}
		} catch {
			// Cleanup skipped
		}
	});

	test.describe('Admin User', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');
		});

		test('sees Add Student button', async ({ page }) => {
			await expect(page.getByRole('button', { name: 'Add new student' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Import students from file' })).toBeVisible();
		});

		test('sees action buttons (edit, delete) for students', async ({ page }) => {
			const suffix = getTestSuffix('adminActions');
			testE2eTag = `e2e-test_${suffix}`;

			await createStudent({
				studentId: `SA_${suffix}`,
				englishName: `AdminTest_${suffix}`,
				chineseName: '管理測試',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			// Wait for the student to appear
			await expect(page.getByRole('row', { name: `SA_${suffix}` })).toBeVisible();

			// Admin should see edit pencil button
			await expect(page.getByRole('button', { name: `Edit AdminTest_${suffix}` })).toBeVisible();

			// Admin should see delete trash button
			await expect(page.getByRole('button', { name: `Delete AdminTest_${suffix}` })).toBeVisible();

			// Admin should see disable/warning button
			await expect(
				page.getByRole('button', { name: `Set AdminTest_${suffix} to not enrolled` })
			).toBeVisible();
		});
	});

	test.describe('Teacher User', () => {
		test.use({ storageState: 'e2e/.auth/teacher.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');
		});

		test('does not see Add Student button', async ({ page }) => {
			await expect(page.getByRole('button', { name: 'Add new student' })).not.toBeVisible();
		});

		test('does not see Import button', async ({ page }) => {
			await expect(
				page.getByRole('button', { name: 'Import students from file' })
			).not.toBeVisible();
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
});
