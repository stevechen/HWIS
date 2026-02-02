import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Student List @students', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		// await page.waitForSelector('body.hydrated');
	});

	test.describe('Access Control', () => {
		test('redirects non-admin users from /admin/students', async ({ page }) => {
			// Use 'commit' to handle immediate redirect without waiting for full load
			await page.goto('/admin/students', { waitUntil: 'commit' });
			await expect(page).toHaveURL(/\/|\/login/, { timeout: 5000 });
		});
	});

	test.describe('Admin Access', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			const suffix = getTestSuffix('listAccess');
			try {
				await cleanupTestData(suffix);
			} catch {
				// Cleanup skipped
			}
		});

		test('displays list of created students', async ({ page }) => {
			const suffix = getTestSuffix('listTest');
			const studentId = `S_${suffix}`;

			await createStudent({
				studentId,
				englishName: `Student1_${suffix}`,
				chineseName: '學生1',
				grade: 10,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			await expect(page.getByText(`Student1_${suffix}`)).toBeVisible();
		});

		test('can filter students by grade', async ({ page }) => {
			const suffix = getTestSuffix('filterGrade');
			const grade9Student = `Grade9_${suffix}`;
			const grade10Student = `Grade10_${suffix}`;

			await createStudent({
				studentId: `S9_${suffix}`,
				englishName: grade9Student,
				chineseName: '九年級',
				grade: 9,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			await createStudent({
				studentId: `S10_${suffix}`,
				englishName: grade10Student,
				chineseName: '十年級',
				grade: 10,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			const gradeSelect = page.locator('select[aria-label="Filter by grade"]');
			await gradeSelect.selectOption('9');

			await expect(page.getByText(grade9Student)).toBeVisible({ timeout: 8000 });
			await expect(page.getByText(grade10Student)).not.toBeVisible();
		});

		test('can filter students by status', async ({ page }) => {
			const suffix = getTestSuffix('filterStatus');
			const enrolledStudent = `Enrolled_${suffix}`;
			const notEnrolledStudent = `NotEnr_${suffix}`;

			await createStudent({
				studentId: `SE_${suffix}`,
				englishName: enrolledStudent,
				chineseName: '在讀',
				grade: 10,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			await createStudent({
				studentId: `SNE_${suffix}`,
				englishName: notEnrolledStudent,
				chineseName: '不在讀',
				grade: 10,
				status: 'Not Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			const statusSelect = page.locator('select[aria-label="Filter by status"]');
			await statusSelect.selectOption('Enrolled');

			await expect(page.getByText(enrolledStudent)).toBeVisible({ timeout: 8000 });
			await expect(page.getByText(notEnrolledStudent)).not.toBeVisible();
		});

		test('can search students by name', async ({ page }) => {
			const suffix = getTestSuffix('searchName');
			const targetStudent = `TargetName_${suffix}`;
			const otherStudent = `OtherName_${suffix}`;

			await createStudent({
				studentId: `ST_${suffix}`,
				englishName: targetStudent,
				chineseName: '目標學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			await createStudent({
				studentId: `SO_${suffix}`,
				englishName: otherStudent,
				chineseName: '其他學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			await page.getByPlaceholder('Search by name or student ID...').fill(targetStudent);

			await expect(page.getByText(targetStudent)).toBeVisible({ timeout: 5000 });
			await expect(page.getByText(otherStudent)).not.toBeVisible();
		});

		test('can search students by student ID', async ({ page }) => {
			const suffix = getTestSuffix('searchId');
			const targetId = `STID_${suffix}`;
			const otherId = `SOID_${suffix}`;

			await createStudent({
				studentId: targetId,
				englishName: `StudentA_${suffix}`,
				chineseName: '學生A',
				grade: 10,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			await createStudent({
				studentId: otherId,
				englishName: `StudentB_${suffix}`,
				chineseName: '學生B',
				grade: 10,
				status: 'Enrolled',
				e2eTag: `e2e-test_${suffix}`
			});

			await page.getByPlaceholder('Search by name or student ID...').fill(targetId);

			await expect(page.getByText(`StudentA_${suffix}`)).toBeVisible({ timeout: 6000 });
			await expect(page.getByText(`StudentB_${suffix}`)).not.toBeVisible();
		});

		test('shows empty state when no students match filters', async ({ page }) => {
			await expect(page.locator('table tbody tr').first()).toBeVisible();

			await page
				.getByPlaceholder('Search by name or student ID...')
				.fill('NonExistentStudentXYZ123');

			await expect(page.getByText('No students match your filters')).toBeVisible();
		});
	});
});
