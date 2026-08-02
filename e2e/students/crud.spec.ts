import { test, expect } from '../fixtures';
import { getTestSuffix, getTestStudentId } from '../helpers';
import {
	createStudent,
	createStudentWithEvaluations,
	cleanupByTag,
	setE2eTag,
	createCategory,
	useRole
} from '../convex-client';
import { AdminStudentsPage } from '../pages';

// ============================================================================
// CREATE STUDENT TESTS
// ============================================================================

test.describe('Add Student - UI Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('addStud');
	const studentId = getTestStudentId('addStud');
	const englishName = `AddTest_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let studentsPage: AdminStudentsPage;

	test.beforeEach(async ({ page }) => {
		studentsPage = new AdminStudentsPage(page);
		useRole('admin');
		await studentsPage.goto();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can add a new student', async () => {
		useRole('admin');
		const chineseName = '新增測試';

		await studentsPage.addStudent({
			studentId,
			englishName,
			chineseName
		});

		// Wait for the student to appear in the list
		await studentsPage.expectStudentVisible(studentId, englishName);

		// Set e2eTag on the student for cleanup
		await setE2eTag('students', studentId, e2eTag);
		testStudent = true;
	});
});

test.describe('Student ID Validation - Duplicate Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('dupIdForm');
	const studentId = getTestStudentId('dupIdForm');
	const englishName = `First_${suffix}`;
	let testStudent = false;
	let studentsPage: AdminStudentsPage;

	test.beforeEach(async ({ page }) => {
		studentsPage = new AdminStudentsPage(page);
		useRole('admin');
		// Create the student first so we can test duplicate detection
		await createStudent({
			studentId,
			englishName,
			grade: 10,
			e2eTag: `e2e-test_${suffix}`
		});
		testStudent = true;

		await studentsPage.goto();
		await studentsPage.expectLoadingHidden();

		// Wait for student to appear in the list
		await studentsPage.expectStudentRowVisible(studentId);
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', `e2e-test_${suffix}`);
	});

	test('shows error when submitting duplicate student ID via form', async () => {
		await studentsPage.page.getByTestId('admin-students.add-button').click();
		await expect(studentsPage.page.getByTestId('admin-students.dialog.root')).toBeVisible();

		await studentsPage.page.getByTestId('admin-students.dialog.student-id').fill(studentId);
		await studentsPage.page
			.getByTestId('admin-students.dialog.english-name')
			.fill('Duplicate Test');

		// Wait for grade/class select options to load
		const gradeClassSelect = studentsPage.page.getByTestId('admin-students.dialog.grade-class');
		await gradeClassSelect.waitFor({ state: 'visible' });
		await expect(async () => {
			const options = await gradeClassSelect.locator('option:not([disabled])').all();
			if (options.length <= 1) {
				throw new Error('Options not loaded yet');
			}
		}).toPass();
		await gradeClassSelect.selectOption('7-1');

		await studentsPage.page.getByTestId('admin-students.dialog.create-button').click();

		// Form error should appear
		await expect(
			studentsPage.page.getByTestId('admin-students.dialog.root').getByRole('alert')
		).toHaveText(/taken/);
	});
});

// ============================================================================
// EDIT STUDENT TESTS
// ============================================================================

test.describe('Edit Student - Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('editStatus');
	const studentId = getTestStudentId('editStatus');
	const englishName = `Status_${suffix}`;
	let testStudent = false;
	let studentsPage: AdminStudentsPage;

	test.beforeEach(async () => {
		useRole('admin');
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
		studentsPage = new AdminStudentsPage(page);
		await studentsPage.goto();
		await studentsPage.expectLoadingHidden();
		await studentsPage.fillSearch(studentId);
		await studentsPage.expectStudentRowVisible(studentId);
	});

	test('can update student status', async () => {
		// Edit status through the clickable status cell
		await studentsPage.toggleStudentStatus(studentId);
		await studentsPage.expectStudentStatus(studentId, 'Not Enrolled');

		// Find and click edit button for this student
		await studentsPage.setStudentStatusViaDialog(studentId, 'Enrolled');

		// Verify status changed back to Enrolled
		await studentsPage.expectStudentStatus(studentId, 'Enrolled');
	});
});

// ============================================================================
// DELETE STUDENT TESTS
// ============================================================================

test.describe('Delete Student - Without Evaluations', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('delNoEval');
	const studentId = getTestStudentId('delNoEval');
	const englishName = `DelNoEval_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;
	let studentsPage: AdminStudentsPage;

	test.beforeEach(async ({ page }) => {
		studentsPage = new AdminStudentsPage(page);
		useRole('admin');
		// Create category first (needed for students)
		await createCategory({
			name: `Cat_${suffix}`,
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITHOUT evaluation
		await createStudent({
			studentId: studentId,
			englishName: englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;

		await studentsPage.goto();
		await studentsPage.expectLoadingHidden();

		// Clear filters and wait for student to appear
		await studentsPage.clearFilters();
		await studentsPage.expectStudentRowVisible(studentId);
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can delete student without evaluations', async () => {
		// Filter to the specific student
		await studentsPage.fillSearch(englishName);
		await studentsPage.expectStudentRowVisible(studentId);

		// Click delete button and confirm
		await studentsPage.deleteStudent(studentId);

		// Data was deleted, don't clean up in afterEach
		testStudent = false;
	});
});

test.describe('Delete Student - With Cascade @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;
	let studentsPage: AdminStudentsPage;

	test.beforeEach(async ({ page }) => {
		studentsPage = new AdminStudentsPage(page);
		useRole('admin');
		suffix = getTestSuffix('delCascade');
		studentId = getTestStudentId('delCascade');
		englishName = `DelCascade_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		// Create category
		await createCategory({
			name: `Cat_${suffix}`,
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITH evaluation
		await createStudentWithEvaluations({
			studentId: studentId,
			englishName: englishName,
			chineseName: '刪除 cascade',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;
		testEvaluation = true;

		await studentsPage.goto();
		await studentsPage.expectLoadingHidden();

		// Clear filters
		await studentsPage.clearFilters();
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can delete student with cascade', async () => {
		// Wait for student
		await studentsPage.expectStudentRowVisible(studentId);

		// Click delete button and confirm cascade
		await studentsPage.deleteStudentWithCascade(studentId);

		// Student and evaluation deleted via cascade, but category & audit log still needs cleanup
		testStudent = false;
		// testCategory remains true for cleanup
	});
});

test.describe('Delete - Set Not Enrolled @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('setNotEnrolled');
	const studentId = getTestStudentId('setNotEnrolled');
	const englishName = `SetNotEnrolled_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;
	let studentsPage: AdminStudentsPage;

	test.beforeEach(async ({ page }) => {
		studentsPage = new AdminStudentsPage(page);
		useRole('admin');
		// Create category
		await createCategory({
			name: `Cat_${suffix}`,
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITH evaluation
		await createStudentWithEvaluations({
			studentId: studentId,
			englishName: englishName,
			chineseName: '設為未註冊',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;
		testEvaluation = true;

		await studentsPage.goto();
		await studentsPage.expectLoadingHidden();

		// Clear filters
		await studentsPage.clearFilters();
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can set student to Not Enrolled from delete dialog', async () => {
		// Wait for student
		await studentsPage.expectStudentRowVisible(studentId);

		// Set status to Not Enrolled via edit dialog
		await studentsPage.setStudentStatusViaDialog(studentId, 'Not Enrolled');

		// Clear search
		await studentsPage.fillSearch('');

		// Verify status changed
		await expect(
			studentsPage.page.locator(`[data-student-id="${studentId}"]`).getByText('Not Enrolled')
		).toBeVisible();

		// Student and category still exist, evaluation was used but should be cleaned up
		// (testEvaluation remains true for cleanup)
	});
});
