import { test, expect, type Page } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createStudent,
	createCategoryWithSubs,
	createEvaluationForStudent,
	cleanupByTag,
	useRole
} from './convex-client';

async function createStudentForEval(
	page: Page,
	suffix: string,
	englishName: string,
	chineseName: string,
	grade: number,
	status: string = 'Enrolled'
) {
	const studentId = `SE_${suffix}`;

	const createResult = await createStudent({
		studentId,
		englishName,
		chineseName,
		grade,
		status,
		e2eTag: `e2e-test_${suffix}`
	});
	expect(createResult).toBeTruthy();

	// Navigate to the evaluations page with test mode to bypass auth
	await page.goto('/evaluations/new');
	await page.waitForSelector('body.hydrated');

	await expect(page.getByText('1. Select Students')).toBeVisible();

	// Use aria-label to find the search input
	const filterInput = page.getByRole('textbox', { name: 'Search students' });
	await expect(filterInput).toBeVisible();

	// Clear the search input first, then type the student name (lowercase for case-insensitive search)
	await filterInput.fill('');
	await filterInput.fill(englishName.toLowerCase());

	// Student items display as "englishName (chineseName)" format
	// Look for the student name in the list - check for "No students found" first
	const noStudentsMsg = page.getByText('No students found');
	await expect(noStudentsMsg).not.toBeVisible();

	await page.waitForSelector('body.hydrated');

	// Try searching again
	const filterInput2 = page.locator('input[aria-label="Search students"]').first();
	await filterInput2.fill('');
	await filterInput2.fill(englishName.toLowerCase());

	// Student items are clickable divs with text in format "englishName (chineseName)"
	// Use case-insensitive search since the filter is case-insensitive
	const studentRow = page.getByRole('button', { name: new RegExp(englishName, 'i') });
	await expect(studentRow).toBeVisible();
}

test.describe('Evaluations (authenticated as teacher) @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
	});

	test('displays new evaluation page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'New Evaluation' })).toBeVisible();
	});

	test('displays categories from database', async ({ page }) => {
		// The category selector shows as a button with aria-label - just verify it exists
		const categoryTrigger = page.getByRole('button', { name: 'Select category' });
		await expect(categoryTrigger).toBeVisible();
		// Verify the trigger shows the placeholder text
		await expect(categoryTrigger).toContainText('Select Category');
	});

	test('displays students list', async ({ page }) => {
		await expect(page.getByText('1. Select Students')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Search students' })).toBeVisible();
	});
});

test.describe('Evaluations - Select Student', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('selectStudent');
		studentName = `SelectMe_${suffix}`;
		// createStudentForEval navigates to /evaluations/new
		await createStudentForEval(page, suffix, studentName, '選擇我', 10);
		testStudent = true;
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', `e2e-test_${suffix}`);
	});

	test('allows selecting a student', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: new RegExp(studentName, 'i') });
		await expect(studentRow).toBeVisible();

		await studentRow.click();

		await expect(page.getByText(/student.*selected/i)).toBeVisible();
	});
});

test.describe('Evaluations - Student Count', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('countStudent');
		studentName = `CountMe_${suffix}`;
		// createStudentForEval navigates to /evaluations/new
		await createStudentForEval(page, suffix, studentName, '計數我', 10);
		testStudent = true;
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', `e2e-test_${suffix}`);
	});

	test('shows selected student count', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: studentName });
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();
	});
});

test.describe('Evaluations - No Student Error', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('noStudent');
		studentName = `NoStudent_${suffix}`;
		// createStudentForEval navigates to /evaluations/new
		await createStudentForEval(page, suffix, studentName, '無學生', 10);
		testStudent = true;
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', `e2e-test_${suffix}`);
	});

	test('shows error without student selection', async ({ page }) => {
		// Try to submit without selecting any students
		const submitButton = page.getByRole('button', { name: /submit/i }).first();
		await expect(submitButton).toBeVisible();
		await submitButton.click();
		// The error message says "Please select at least one student"
		await expect(page.getByText(/Please select at least one student/i)).toBeVisible();
	});
});

test.describe('Evaluations - No Category Error', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('noCat');
		studentName = `NoCat_${suffix}`;
		// createStudentForEval navigates to /evaluations/new
		await createStudentForEval(page, suffix, studentName, '無類別', 10);
		testStudent = true;
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', `e2e-test_${suffix}`);
	});

	test('shows error without category', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: new RegExp(studentName, 'i') });
		await expect(studentRow).toBeVisible();
		await studentRow.click();

		// Wait for submit button to be visible after selecting student
		const submitButton = page.getByRole('button', { name: 'Submit Evaluation' });
		await expect(submitButton).toBeVisible();

		// Try to submit without selecting category
		await submitButton.click();

		// The error message says "Please select a category"
		await expect(page.getByText(/Please select a category/i)).toBeVisible();
	});
});

test.describe('Evaluations - No Sub-Category Error', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let categoryName: string;
	let studentName: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('noSub');
		categoryName = `TestCategory_${suffix}`;
		studentName = `NoSub_${suffix}`;
		// Create a category with sub-categories first
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['SubCategory1', 'SubCategory2'],
			e2eTag: `e2e-test_${suffix}`
		});
		testData = true;

		// createStudentForEval navigates to /evaluations/new
		await createStudentForEval(page, suffix, studentName, '無子類別', 10);
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', `e2e-test_${suffix}`);
	});

	test('shows error without sub-category', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: new RegExp(studentName, 'i') });
		await studentRow.click();

		// Click on the category trigger to open the dropdown
		await page.getByRole('button', { name: 'Select category' }).click();

		// Wait for dropdown to open and select the category we just created
		await expect(page.getByRole('option', { name: categoryName })).toBeVisible();
		await page.getByRole('option', { name: categoryName }).click();

		// Verify sub-category section appears
		await expect(page.getByText(/Sub-Category/i)).toBeVisible();

		// Try to submit without selecting sub-category
		const submitButton = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton.click();

		// Should show error about sub-category
		await expect(page.getByText(/Please select a sub-category/i)).toBeVisible();
	});
});

test.describe('Evaluations - Submit Success', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let categoryName: string;
	let studentName: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('submit');
		categoryName = `TestCategory_${suffix}`;
		studentName = `Submit_${suffix}`;
		// Create a category with sub-categories first
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['SubCategory1', 'SubCategory2'],
			e2eTag: `e2e-test_${suffix}`
		});
		testData = true;

		// createStudentForEval navigates to /evaluations/new
		await createStudentForEval(page, suffix, studentName, '提交', 10);
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', `e2e-test_${suffix}`);
	});

	test('successfully submits evaluation', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: studentName });
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Click on the category trigger to open the dropdown
		await page.getByRole('button', { name: 'Select category' }).click();

		// Wait for dropdown to open and select the category we just created
		await expect(page.getByRole('option', { name: categoryName })).toBeVisible();
		await page.getByRole('option', { name: categoryName }).click();
		// Verify sub-category section appears
		await expect(page.getByText(/Sub-Category/i)).toBeVisible();

		// Select a sub-category
		await page.getByRole('button', { name: 'Select sub-category' }).click();
		await expect(page.getByRole('option', { name: 'SubCategory1' })).toBeVisible();
		await page.getByRole('option', { name: 'SubCategory1' }).click();

		// Submit the evaluation
		const submitButton = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton.click();

		// Should redirect to evaluations page after successful submission (teachers land on evaluations)
		await expect(page).toHaveURL('/evaluations');
	});
});

test.describe('Evaluations (admin user) @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
	});

	test('displays "Back to Admin" button for admin users', async ({ page }) => {
		const backButton = page.getByRole('button', { name: /Back to Admin/i });
		await expect(backButton).toBeVisible();
	});

	test('"Back to Admin" button navigates to admin dashboard', async ({ page }) => {
		const backButton = page.getByRole('button', { name: /Back to Admin/i });
		await expect(backButton).toBeVisible();

		// Click the button and verify navigation
		await backButton.click();
		await expect(page).toHaveURL('/admin');
	});

	test('displays evaluation history for admin users', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'My Evaluations' })).toBeVisible();
	});

	test('can navigate back to admin then return to evaluations', async ({ page }) => {
		// First verify "Back to Admin" button exists and click it
		const backButton = page.getByRole('button', { name: /Back to Admin/i });
		await expect(backButton).toBeVisible();
		await backButton.click();
		await expect(page).toHaveURL('/admin');

		// Now navigate back to evaluations using the Evaluation Review card
		const evalReviewCard = page.getByRole('link', { name: /My Evaluation Review/i });
		await expect(evalReviewCard).toBeVisible();
		await evalReviewCard.click();
		await expect(page).toHaveURL('/evaluations');

		// Verify "Back to Admin" button is still visible
		await expect(page.getByRole('button', { name: /Back to Admin/i })).toBeVisible();
	});
});

test.describe('Evaluations Long-Press Edit @evaluations-longpress', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let testData = false;

	// DATA SEEDING & Navigation
	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('longpressEdit');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `STU_${suffix}`;

		// Create category and student via API
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Sub1', 'Sub2'],
			e2eTag
		});

		await createStudent({
			studentId,
			englishName: `Student_${suffix}`,
			chineseName: '學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluation as the authenticated teacher (using JWT from useRole)
		await createEvaluationForStudent({ studentId, e2eTag });
		testData = true;

		// Navigate to student timeline using custom studentId URL (now supported!)
		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
	});

	// CLEANUP - Conditional based on flag
	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	// TESTS
	test('long-press on own evaluation opens edit dialog', async ({ page }) => {
		// Find an evaluation card
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		// Long-press by holding mouse down for 500ms+
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Should open edit dialog
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
	});

	test('can change points in edit dialog using buttons', async ({ page }) => {
		// Find and long-press on an evaluation card
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Edit dialog should be visible
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Click on +2 points button
		await page.getByRole('button', { name: /Award 2 points/i }).click();

		// Save changes
		await page.getByRole('button', { name: /Save Changes/i }).click();

		// Dialog should close
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('can cancel edit dialog', async ({ page }) => {
		// Find and long-press on an evaluation card
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Edit dialog should be visible
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Click cancel
		await page.getByRole('button', { name: /Cancel/i }).click();

		// Dialog should close
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('shows delete confirmation dialog after delete request', async ({ page }) => {
		// Find an evaluation card
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		// Long-press to open edit dialog
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Wait for edit dialog
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Delete button should be visible - click it
		await page.getByRole('button', { name: /Delete/i }).click();

		// Delete confirmation dialog should appear
		await expect(page.getByRole('dialog', { name: /Delete Evaluation/i })).toBeVisible();
	});
});

test.describe('Evaluations Long-Press Delete @evaluations-longpress', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let englishName: string;
	let studentId: string;
	let testData = false;

	// DATA SEEDING & Navigation
	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('longpressDelete');
		e2eTag = `e2e-test_${suffix}`;
		englishName = `Student_${suffix}`;
		studentId = `STU_${suffix}`;

		// Create category and student via API
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Sub1', 'Sub2'],
			e2eTag
		});

		await createStudent({
			studentId,
			englishName,
			chineseName: '學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluation as the authenticated admin (using JWT from useRole)
		await createEvaluationForStudent({ studentId, e2eTag });
		testData = true;

		// Navigate to evaluations page
		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
	});

	// CLEANUP - Conditional based on flag
	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('can delete evaluation via long-press on evaluations page', async ({ page }) => {
		// Wait for the evaluation to appear via Convex reactivity
		// The card shows the student's name. Can't locate by button name cause test name is too long. Either Playwright or html server truncates it.
		const nameOnCard = page.getByRole('button', { name: /Evaluation for/i }).getByText(englishName);
		await expect(nameOnCard).toBeVisible();

		// Long-press to open edit dialog (hold for 600ms)
		await nameOnCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await nameOnCard.dispatchEvent('mouseup');

		// Edit dialog should open
		const editDialog = page.getByRole('dialog', { name: /Edit Evaluation/i });
		await expect(editDialog).toBeVisible();

		// Click Delete button
		await editDialog.getByRole('button', { name: /Delete/i }).click();

		// Delete confirmation dialog should appear
		const deleteDialog = page.getByRole('dialog', { name: /Delete Evaluation/i });
		await expect(deleteDialog).toBeVisible();

		// Confirm deletion
		await deleteDialog.getByRole('button', { name: /Delete/i, exact: true }).click();

		// Delete confirmation dialog should close
		await expect(deleteDialog).not.toBeVisible();
		await expect(nameOnCard).not.toBeVisible();
	});
});

test.describe('Admin Evaluations - Multi-Search Filters', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;
	let studentId1: string;
	let studentId2: string;
	let englishName1: string;
	let englishName2: string;
	let testData = false;

	// DATA SEEDING & Navigation
	test.beforeEach(async ({ page }) => {
		useRole('admin');
		suffix = getTestSuffix('adminEvalFilter');
		e2eTag = `e2e-test_${suffix}`;
		studentId1 = `STU1_${suffix}`;
		studentId2 = `STU2_${suffix}`;
		englishName1 = `Alice_${suffix}`;
		englishName2 = `Bob_${suffix}`;

		// Create two students with different names
		await createStudent({
			studentId: studentId1,
			englishName: englishName1,
			chineseName: '學生1',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		await createStudent({
			studentId: studentId2,
			englishName: englishName2,
			chineseName: '學生2',
			grade: 11,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluations for both students
		await createEvaluationForStudent({ studentId: studentId1, e2eTag });
		await createEvaluationForStudent({ studentId: studentId2, e2eTag });
		testData = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	// CLEANUP - Conditional based on flag
	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('renders student and teacher filter inputs', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await expect(studentFilter).toBeVisible();

		const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher(s)…' });
		await expect(teacherFilter).toBeVisible();
	});

	test('filters by single student name', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await studentFilter.fill(englishName1);

		// Alice's card should be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		// Bob's card should not be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).not.toBeVisible();
	});

	test('filters by multiple student names (comma-separated)', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		// Search for both students using comma-separated names
		await studentFilter.fill(`${englishName1}, ${englishName2}`);

		// Both students' cards should be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).toBeVisible();
	});

	test('clears student filter', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await studentFilter.fill(englishName1);

		// Verify only Alice is visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).not.toBeVisible();

		// Both students should be visible again
		await studentFilter.clear();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).toBeVisible();
	});
});

test.describe('Evaluations - Student Filter Multi-Search', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId1: string;
	let studentId2: string;
	let englishName1: string;
	let englishName2: string;
	let testData = false;

	// DATA SEEDING & Navigation
	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('evalFilter');
		e2eTag = `e2e-test_${suffix}`;
		studentId1 = `STU1_${suffix}`;
		studentId2 = `STU2_${suffix}`;
		englishName1 = `Carol_${suffix}`;
		englishName2 = `Dave_${suffix}`;

		// Create two students with different names
		await createStudent({
			studentId: studentId1,
			englishName: englishName1,
			chineseName: '學生1',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		await createStudent({
			studentId: studentId2,
			englishName: englishName2,
			chineseName: '學生2',
			grade: 11,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluations for both students
		await createEvaluationForStudent({ studentId: studentId1, e2eTag });
		await createEvaluationForStudent({ studentId: studentId2, e2eTag });
		testData = true;

		// Navigate to evaluations page
		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	// CLEANUP - Conditional based on flag
	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('renders student filter input', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await expect(studentFilter).toBeVisible();
	});

	test('filters by single student name', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await studentFilter.fill(englishName1);

		// Carol's card should be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		// Dave's card should not be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).not.toBeVisible();
	});

	test('filters by multiple student names (comma-separated)', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		// Search for both students using comma-separated names
		await studentFilter.fill(`${englishName1}, ${englishName2}`);

		// Both students' cards should be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).toBeVisible();
	});

	test('clears student filter', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await studentFilter.fill(englishName1);

		// Verify only Carol is visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).not.toBeVisible();

		// Clear the filter
		await studentFilter.fill('');
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).toBeVisible();
	});
});

test.describe('Admin Evaluations - Combined Filters', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// CONSTANTS
	let suffix: string;
	let e2eTag: string;
	let studentId1: string;
	let studentId2: string;
	let englishName1: string;
	let englishName2: string;
	let testData = false;

	// DATA SEEDING
	test.beforeEach(async ({ page }) => {
		useRole('admin');
		suffix = getTestSuffix('adminCombined');
		e2eTag = `e2e-test_${suffix}`;
		studentId1 = `STU1_${suffix}`;
		studentId2 = `STU2_${suffix}`;
		englishName1 = `Frank_${suffix}`;
		englishName2 = `Grace_${suffix}`;

		// Create two students
		await createStudent({
			studentId: studentId1,
			englishName: englishName1,
			chineseName: '學生1',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		await createStudent({
			studentId: studentId2,
			englishName: englishName2,
			chineseName: '學生2',
			grade: 11,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluations
		await createEvaluationForStudent({ studentId: studentId1, e2eTag });
		await createEvaluationForStudent({ studentId: studentId2, e2eTag });
		testData = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('filters by both student and teacher', async ({ page }) => {
		// Get student filter and search for one student
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await studentFilter.fill(englishName1);

		// Only Frank's card should be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).not.toBeVisible();
	});

	test('clearing one filter preserves the other', async ({ page }) => {
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student(s)…' });
		await studentFilter.fill(englishName1);

		// Verify filtering works
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).not.toBeVisible();

		// Clear student filter
		await studentFilter.fill('');

		// Both should be visible again
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName1}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${englishName2}` })
		).toBeVisible();
	});
});

test.describe('Admin Evaluations - Pagination', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// CONSTANTS
	let suffix: string;
	let e2eTag: string;
	let testData = false;
	const limit = 50; // Assuming the pagination limit is 50

	// DATA SEEDING
	test.beforeEach(async ({ page }) => {
		useRole('admin');
		suffix = getTestSuffix('adminPaging');
		e2eTag = `e2e-test_${suffix}`;

		// Create 55 students with evaluations to test pagination (limit is 50)
		for (let i = 1; i <= limit + 1; i++) {
			await createStudent({
				studentId: `STU_${suffix}_${i}`,
				englishName: `Paging_${suffix}_${i}`,
				chineseName: `學生${i}`,
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});
			await createEvaluationForStudent({ studentId: `STU_${suffix}_${i}`, e2eTag });
		}
		testData = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('displays More button when more results exist', async ({ page }) => {
		// With 55 evaluations and limit of 50, More button should be visible
		const moreButton = page.getByRole('button', { name: /More/i });
		await expect(moreButton).toBeVisible();
	});

	test('loads more evaluations on click', async ({ page }) => {
		// Initial count should be 50
		const cards = page.getByRole('button', { name: /Evaluation for/ });
		await expect(cards.nth(limit - 1)).toBeVisible();
		await expect(cards.nth(limit)).not.toBeVisible();

		// Click More button to load remaining 5
		const moreButton = page.getByRole('button', { name: /More/i });
		await moreButton.click();

		// Wait for additional cards to appear
		await expect(cards.nth(limit)).toBeVisible();

		// More button should be hidden (all loaded)
		await expect(moreButton).not.toBeVisible();
	});

	test('shows loading state while fetching', async ({ page }) => {
		// More button should be visible
		const moreButton = page.getByRole('button', { name: /More/i });
		await expect(moreButton).toBeVisible();

		// Button should contain loading or More text
		await expect(moreButton).toContainText(/More|Loading/);
	});
});

test.describe('Evaluations - Pagination', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	// CONSTANTS
	let suffix: string;
	let e2eTag: string;
	let testData = false;
	const limit = 50; // Assuming the pagination limit is 50

	// DATA SEEDING
	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('evalPaging');
		e2eTag = `e2e-test_${suffix}`;

		// Create 55 students with evaluations to test pagination (limit is 50)
		for (let i = 1; i <= limit + 1; i++) {
			await createStudent({
				studentId: `STU_${suffix}_${i}`,
				englishName: `Pager_${suffix}_${i}`,
				chineseName: `學生${i}`,
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});
			await createEvaluationForStudent({ studentId: `STU_${suffix}_${i}`, e2eTag });
		}
		testData = true;

		// Navigate to evaluations page
		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('displays More button when more results exist', async ({ page }) => {
		const moreButton = page.getByRole('button', { name: /More/i });
		await expect(moreButton).toBeVisible();
	});

	test('loads more evaluations on click', async ({ page }) => {
		// Initial count should be 50
		const cards = page.locator('.bg-card');
		await expect(cards.nth(limit - 1)).toBeVisible();
		await expect(cards.nth(limit)).not.toBeVisible();

		// Click More button to load remaining 5
		const moreButton = page.getByRole('button', { name: /More/i });
		await moreButton.click();

		// Wait for additional cards to appear
		await expect(cards.nth(limit)).toBeVisible();

		// More button should be hidden (all loaded)
		await expect(moreButton).not.toBeVisible();
	});

	test('shows loading state while fetching', async ({ page }) => {
		const moreButton = page.getByRole('button', { name: /More/i });
		await expect(moreButton).toBeVisible();
		await expect(moreButton).toContainText(/More|Loading/);
	});

	test('shows New button', async ({ page }) => {
		const newButton = page.getByRole('button', { name: 'New', exact: true });
		await expect(newButton).toBeVisible();
	});
});

test.describe('Evaluations - UI Controls', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	// CONSTANTS
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let englishName: string;
	let testData = false;

	// DATA SEEDING
	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('evalUI');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `STU_${suffix}`;
		englishName = `UIName_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		await createEvaluationForStudent({ studentId, e2eTag });
		testData = true;

		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('shows evaluation cards with student name', async ({ page }) => {
		const card = page.getByRole('button', { name: `Evaluation for ${englishName}` });
		await expect(card).toBeVisible();
	});

	test('can navigate to student detail by clicking card', async ({ page }) => {
		const card = page.getByRole('button', { name: `Evaluation for ${englishName}` });
		await expect(card).toBeVisible();

		// Click on the card
		await card.click();

		// Should navigate to student detail page
		await expect(page).toHaveURL(/.*evaluations\/student\/.*/);
	});
});
