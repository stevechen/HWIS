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

		const result = await createStudent({
			studentId,
			englishName: `AdminTest_${suffix}`,
			chineseName: '管理測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});

		if (result && typeof result === 'object' && 'error' in result) {
			throw new Error(`Failed to create student: ${result.error}`);
		}
		testStudent = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading students...')).not.toBeVisible();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', testE2eTag);
	});

	test('admin can access student management controls for a student row', async ({ page }) => {
		await page.getByPlaceholder('Search by name or student ID...').fill(studentId);
		await expect(page.getByText(studentId, { exact: true })).toBeVisible({ timeout: 15000 });
		const studentRow = page.getByRole('row').filter({
			has: page.getByText(studentId, { exact: true })
		});
		await expect(studentRow).toBeVisible();
		await expect(page.getByRole('button', { name: `Edit ${studentId}` })).toBeVisible();
		await expect(page.getByRole('button', { name: `Delete ${studentId}` })).toBeVisible();
		await expect(studentRow.getByText('Enrolled')).toBeVisible();
	});
});

test.describe('Teacher User', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test('teacher cannot access admin student controls', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Add new student' })).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Import students from file' })).not.toBeVisible();
		await expect(page.getByRole('button', { name: /delete/i }).first()).not.toBeVisible();
		await expect(page.getByRole('button', { name: /not enrolled/i }).first()).not.toBeVisible();
	});
});
