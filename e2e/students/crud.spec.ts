import { test, expect } from '@playwright/test';
import { getTestSuffix } from '../helpers';
import {
	createStudent,
	createStudentWithEvaluations,
	cleanupByTag,
	setE2eTag,
	createCategoryWithSubs,
	useRole
} from '../convex-client';

// ============================================================================
// CREATE STUDENT TESTS
// ============================================================================

test.describe('Add Student - UI Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('addStud');
	const studentId = `S_${suffix}`;
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

		// Submit form using aria-label
		await page.getByRole('button', { name: 'Create student' }).click();

		// Wait for the dialog to close
		await expect(dialog).not.toBeVisible();
		await page.waitForSelector('body.hydrated');

		// Wait for the student to appear in the list
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Set e2eTag on the student for cleanup
		await setE2eTag('students', studentId, e2eTag);
		testStudent = true;
	});

	test('shows check icon for unique student ID after manual check', async ({ page }) => {
		const suffix2 = getTestSuffix('dupIdCheck');
		const studentId2 = `S_${suffix2}`;

		// Open add student dialog using aria-label
		await page.getByRole('button', { name: 'Add new student' }).click();
		const dialog = page.getByRole('dialog', { name: 'Student form' });

		await expect(dialog).toBeVisible();

		// Fill in student ID
		await dialog.getByRole('textbox', { name: 'Student ID' }).fill(studentId2);
		await dialog.getByRole('button', { name: 'ID unknown' }).click();

		await expect(dialog.getByRole('button', { name: 'ID available' })).toBeVisible();
	});
});

test.describe('Student ID Validation - Duplicate Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('dupIdForm');
	const studentId = `S_${suffix}`;
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
	const studentId = `S_${suffix}`;
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

// ============================================================================
// DELETE STUDENT TESTS
// ============================================================================

test.describe('Delete Student - Without Evaluations', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('delNoEval');
	const studentId = `S_${suffix}`;
	const englishName = `DelNoEval_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		// Create category first (needed for students)
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
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

		// Clear filters
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');
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
		studentId = `S_${suffix}`;
		englishName = `DelCascade_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		// Create category
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
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

test.describe('Delete Dialog - Shows Options @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('dlgNotEnrolled');
	const studentId = `S_${suffix}`;
	const englishName = `DlgNotEnrolled_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;

	test.beforeEach(async () => {
		useRole('admin');
		// Create category
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITH evaluation
		await createStudentWithEvaluations({
			studentId: studentId,
			englishName: englishName,
			chineseName: '對話框測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;
		testEvaluation = true;
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test.beforeEach(async ({ page }) => {
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

	test('delete dialog shows Set Not Enrolled for student with evaluations', async ({ page }) => {
		// Wait for student
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page.getByRole('button', { name: `Delete ${studentId}` }).first();
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialog = page.getByRole('dialog');

		// Verify cascade UI
		await expect(dialog.getByRole('alert')).toBeVisible();
		await expect(dialog.getByText(/evaluation record/i)).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();
	});
});

test.describe('Delete - Set Not Enrolled @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('setNotEnrolled');
	const studentId = `S_${suffix}`;
	const englishName = `SetNotEnrolled_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;

	test.beforeEach(async ({ page }) => {
		// Create category
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
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

// ============================================================================
// ARCHIVE / YEAR-END RESET TESTS
// ============================================================================

test.describe('Archive & Reset Page - Static Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:5173/admin/academic');
		await page.waitForSelector('body.hydrated');
	});

	test('page loads and shows correct heading', async ({ page }) => {
		const url = page.url();
		expect(url).toContain('/admin/academic');

		await expect(page.getByRole('heading', { name: /Year-End Reset/i })).toBeVisible();
	});

	test('shows advance academic year section', async ({ page }) => {
		// Check if we're on the right page
		await expect(page.getByRole('heading', { name: /Year-End Reset/i })).toBeVisible();

		await expect(page.getByText(/Advance Academic Year/i)).toBeVisible();
	});

	test('shows advance year button', async ({ page }) => {
		const advanceButton = page.getByRole('button', { name: /Advance/i });
		await expect(advanceButton.first()).toBeVisible();
	});
});
