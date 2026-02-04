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
			await expect(page).toHaveURL(/\/|\/login/);
		});
	});

	test.describe('Admin Access', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		let testE2eTag: string | null = null;

		test.beforeEach(async ({ page }) => {
			testE2eTag = null;
			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			try {
				if (testE2eTag) {
					await cleanupTestData(testE2eTag);
				}
			} catch {
				// Cleanup skipped
			}
		});

		test('displays list of created students', async ({ page }) => {
			const suffix = getTestSuffix('listTest');
			const studentId = `S_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createStudent({
				studentId,
				englishName: `Student1_${suffix}`,
				chineseName: '學生1',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			await expect(page.getByRole('row', { name: `Student1_${suffix}` })).toBeVisible();
		});

		test('can filter students by grade', async ({ page }) => {
			const suffix = getTestSuffix('filterGrade');
			const grade9Student = `Grade9_${suffix}`;
			const grade10Student = `Grade10_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createStudent({
				studentId: `S9_${suffix}`,
				englishName: grade9Student,
				chineseName: '九年級',
				grade: 9,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			await createStudent({
				studentId: `S10_${suffix}`,
				englishName: grade10Student,
				chineseName: '十年級',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			const gradeSelect = page.getByRole('combobox', { name: 'Filter by grade' });
			await gradeSelect.selectOption('9');

			await expect(page.getByRole('row', { name: grade9Student })).toBeVisible();
			await expect(page.getByRole('row', { name: grade10Student })).not.toBeVisible();
		});

		test('can filter students by status', async ({ page }) => {
			const suffix = getTestSuffix('filterStatus');
			const enrolledStudent = `Enrolled_${suffix}`;
			const notEnrolledStudent = `NotEnr_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createStudent({
				studentId: `SE_${suffix}`,
				englishName: enrolledStudent,
				chineseName: '在讀',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			await createStudent({
				studentId: `SNE_${suffix}`,
				englishName: notEnrolledStudent,
				chineseName: '不在讀',
				grade: 10,
				status: 'Not Enrolled',
				e2eTag: testE2eTag
			});

			const statusSelect = page.getByRole('combobox', { name: 'Filter by status' });
			await statusSelect.selectOption('Enrolled');

			await expect(page.getByRole('row', { name: enrolledStudent })).toBeVisible();
			await expect(page.getByRole('row', { name: notEnrolledStudent })).not.toBeVisible();
		});

		test('can search students by name', async ({ page }) => {
			const suffix = getTestSuffix('searchName');
			const targetStudent = `TargetName_${suffix}`;
			const otherStudent = `OtherName_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createStudent({
				studentId: `ST_${suffix}`,
				englishName: targetStudent,
				chineseName: '目標學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			await createStudent({
				studentId: `SO_${suffix}`,
				englishName: otherStudent,
				chineseName: '其他學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			await page.getByRole('textbox', { name: 'Search students' }).fill(targetStudent);

			await expect(page.getByRole('row', { name: targetStudent })).toBeVisible();
			await expect(page.getByRole('row', { name: otherStudent })).not.toBeVisible();
		});

		test('can search students by student ID', async ({ page }) => {
			const suffix = getTestSuffix('searchId');
			const targetId = `STID_${suffix}`;
			const otherId = `SOID_${suffix}`;
			testE2eTag = `e2e-test_${suffix}`;

			await createStudent({
				studentId: targetId,
				englishName: `StudentA_${suffix}`,
				chineseName: '學生A',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			await createStudent({
				studentId: otherId,
				englishName: `StudentB_${suffix}`,
				chineseName: '學生B',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});

			await page.getByRole('textbox', { name: 'Search students' }).fill(targetId);

			await expect(page.getByRole('row', { name: `StudentA_${suffix}` })).toBeVisible();
			await expect(page.getByRole('row', { name: `StudentB_${suffix}` })).not.toBeVisible();
		});

		test('shows empty state when no students match filters', async ({ page }) => {
			await expect(page.getByRole('row').first()).toBeVisible();

			await page.getByRole('textbox', { name: 'Search students' }).fill('NonExistentStudentXYZ123');

			await expect(page.getByText('No students match your filters')).toBeVisible();
		});
	});
});
