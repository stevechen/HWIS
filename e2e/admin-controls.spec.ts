import { test, expect } from './fixtures';
import { createStudent, cleanupByTag } from './convex-client';
import { getTestSuffix } from './helpers';
import { AdminStudentsPage } from './pages';

test.describe('Admin Controls Visibility @admin', () => {
	test.use({ role: 'admin' });

	let testE2eTag: string;
	let studentId: string;
	let testStudent = false;
	let studentsPage: AdminStudentsPage;

	test.beforeEach(async ({ page }) => {
		studentsPage = new AdminStudentsPage(page);
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

		await studentsPage.goto();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', testE2eTag);
	});

	test('admin can access student management controls for a student row', async () => {
		await studentsPage.fillSearch(studentId);
		await studentsPage.expectStudentRowVisible(studentId);
		await expect(
			studentsPage.page.getByTestId(`admin-students.student-row-${studentId}.edit`)
		).toBeVisible();
		await expect(
			studentsPage.page.getByTestId(`admin-students.student-row-${studentId}.delete`)
		).toBeVisible();
		await studentsPage.expectStudentStatus(studentId, 'Enrolled');
	});
});

test.describe('Teacher User', () => {
	test.use({ role: 'teacher' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test('teacher cannot access admin student controls', async ({ page }) => {
		// Teachers are redirected from /admin/* to /evaluations by the admin layout guard
		await expect(page).toHaveURL(/\/evaluations/);
	});
});
