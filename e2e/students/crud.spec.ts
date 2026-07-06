import { test, expect } from '@playwright/test';
import { getTestSuffix, getTestStudentId } from '../helpers';
import {
	createStudent,
	createStudentWithEvaluations,
	cleanupByTag,
	setE2eTag,
	createCategory,
	useRole
} from '../convex-client';

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

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can add a new student', async ({ page }) => {
		useRole('admin');
		const chineseName = '新增測試';

		// Click Add Student button using aria-label
		await page.getByRole('button', { name: 'Add new student' }).click();

		// Wait for dialog to open - the form is in a div with role="dialog"
		const dialog = page.getByRole('dialog', { name: 'Student form' });
		await expect(dialog).toBeVisible();

		// Fill form using accessible labels
		await dialog.getByRole('textbox', { name: 'Student ID' }).fill(studentId);
		await dialog.getByRole('textbox', { name: 'English Name *' }).fill(englishName);
		await dialog.getByRole('textbox', { name: 'Chinese Name' }).fill(chineseName);

		// Wait for grade/class select options to load (dynamic async data)
		const gradeSelect = page.locator('select[aria-label="Grade and Class"]');
		await gradeSelect.waitFor({ state: 'visible' });
		// Wait for actual options to be populated (not just placeholder)
		await page.waitForFunction(() => {
			const select = document.querySelector('select[aria-label="Grade and Class"]');
			return select && select.querySelectorAll('option:not([disabled])').length > 1;
		});
		await gradeSelect.selectOption('7-1');

		// Submit form using aria-label
		await page.getByRole('button', { name: 'Create student' }).click({ force: true });

		// Wait for the dialog to close
		await expect(dialog).not.toBeVisible();
		await page.waitForSelector('body.hydrated');

		// Wait for the student to appear in the list
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

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

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		// Create the student first so we can test duplicate detection
		await createStudent({
			studentId,
			englishName,
			grade: 10,
			e2eTag: `e2e-test_${suffix}`
		});
		testStudent = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Wait for student to appear in the list
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', `e2e-test_${suffix}`);
	});

	test('shows error when submitting duplicate student ID via form', async ({ page }) => {
		// Try to add duplicate via form
		await page.getByRole('button', { name: 'Add new student' }).click();

		const dialog = page.getByRole('dialog', { name: 'Student form' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('textbox', { name: 'Student ID' }).fill(studentId);
		await dialog.getByLabel('English Name').fill('Duplicate Test');

		// Wait for grade/class select options to load (dynamic async data)
		const gradeSelect = page.locator('select[aria-label="Grade and Class"]');
		await gradeSelect.waitFor({ state: 'visible' });
		// Wait for actual options to be populated (not just placeholder)
		await page.waitForFunction(() => {
			const select = document.querySelector('select[aria-label="Grade and Class"]');
			return select && select.querySelectorAll('option:not([disabled])').length > 1;
		});
		await gradeSelect.selectOption('7-1');

		await dialog.getByRole('button', { name: 'Create student' }).click();

		await dialog.getByRole('alert', { name: 'Form errors' }).isVisible();
		await expect(dialog.getByRole('alert', { name: 'Form errors' })).toHaveText(/taken/);
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
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading students...')).not.toBeVisible();
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill(studentId);
		await expect(page.getByText('Loading students...')).not.toBeVisible();
		await expect(studentRow(page, studentId)).toBeVisible({ timeout: 15000 });
	});

	test('can update student status', async ({ page }) => {
		const row = studentRow(page, studentId);

		// Edit status through the clickable status cell
		// force: true needed because the span has pointer-events: none (td handles the click)
		await row.getByText('Enrolled').click({ force: true });
		await expect(row.getByText('Not Enrolled')).toBeVisible();

		// Find and click edit button for this student
		const editButton = row.getByRole('button', { name: `Edit ${studentId}` });
		await editButton.click();

		// Wait for dialog and change status
		const dialog = page.getByRole('dialog', { name: 'student form' });
		await expect(dialog).toBeVisible();

		// Select the status dropdown and change it
		// Use a more specific selector to target the status dropdown
		const statusSelect = dialog.getByLabel('Status');
		await statusSelect.selectOption('Enrolled');

		// Click Update button
		await dialog.getByRole('button', { name: 'Update student' }).click();

		// Wait for dialog to close and Convex to update
		await expect(dialog).not.toBeVisible();
		await expect(row).toBeVisible();
		await expect(row.getByText('Enrolled')).toBeVisible();
	});
});

function studentRow(page: import('@playwright/test').Page, studentId: string) {
	return page.getByRole('row').filter({
		has: page.getByRole('cell', { name: studentId, exact: true })
	});
}

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

	test.beforeEach(async ({ page }) => {
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

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading students...')).not.toBeVisible();

		// Clear filters and wait for student to appear
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');

		// Wait for the created student to appear in the list
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can delete student without evaluations', async ({ page }) => {
		// Filter to the specific student
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill(englishName);
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page.getByRole('button', { name: `Delete ${studentId}` });
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialog = page.getByRole('dialog');

		// Click Delete button
		const deleteBtn = dialog.getByRole('button', { name: 'Delete' });
		await expect(deleteBtn).toBeVisible();
		await deleteBtn.click();

		// Wait for dialog to close
		await expect(dialog).not.toBeVisible();

		// Verify deletion
		await expect(page.getByRole('cell', { name: englishName })).not.toBeVisible();

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

	test.beforeEach(async ({ page }) => {
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

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Clear filters
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can delete student with cascade', async ({ page }) => {
		// Wait for student
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page.getByRole('button', { name: `Delete ${studentId}` });
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialog = page.getByRole('dialog');

		// Wait for cascade UI
		await expect(dialog.getByRole('alert')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();

		// Click Delete Anyway
		await dialog.getByRole('button', { name: 'Delete Anyway' }).click();

		// Verify deletion
		await expect(page.getByRole('row', { name: englishName })).not.toBeVisible();

		// Student and evaluation deleted via cascade, but category & audit log (through evaluation clean up) still needs cleanup
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

	test.beforeEach(async ({ page }) => {
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

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Clear filters
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can set student to Not Enrolled from delete dialog', async ({ page }) => {
		// Wait for student
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page
			.getByRole('row', { name: englishName })
			.getByRole('button')
			.filter({ has: page.locator('svg') })
			.first();
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();

		// Click Set Not Enrolled
		const status = page.getByRole('dialog', { name: 'student form' }).getByLabel('Student Status');
		await status.selectOption('Not Enrolled');
		await page.getByRole('button', { name: 'Update student' }).click();

		// Clear search
		await page.getByRole('textbox', { name: 'Search students' }).fill('');

		// Verify status changed
		await expect(
			page.getByRole('row', { name: englishName }).getByText('Not Enrolled')
		).toBeVisible();

		// Student and category still exist, evaluation was used but should be cleaned up
		// (testEvaluation remains true for cleanup)
	});
});
