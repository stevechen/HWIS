import { test, expect, type Page } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createStudent,
	createStudentWithEvaluations,
	createCategoryWithSubs,
	cleanupByTag,
	useRole
} from './convex-client';

async function waitForStudentsReady(page: Page) {
	await expect(page.getByText('Loading students...')).not.toBeVisible();
	await expect(page.getByRole('list', { name: 'Students' })).toBeVisible();
}

test.describe('Evaluations (authenticated as teacher) @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await waitForStudentsReady(page);
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

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		testStudent = false; // Reset at start of each test
		suffix = getTestSuffix('selectStudent');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		studentName = `SelectMe_${suffix}`;

		// Create student via API
		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' seçme',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testStudent = true;

		// Navigate to the evaluations page
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await waitForStudentsReady(page);
		await expect(page.getByText('1. Select Students')).toBeVisible();

		// Search for the student to make them visible in the list
		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await filterInput.fill(studentName.toLowerCase());
		const studentRow = page.getByRole('button', { name: new RegExp(studentName, 'i') });
		await expect(studentRow).toBeVisible({ timeout: 10000 });
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', e2eTag);
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

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		testStudent = false; // Reset at start of each test
		suffix = getTestSuffix('countStudent');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		studentName = `CountMe_${suffix}`;

		// Create student via API
		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' saya',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testStudent = true;

		// Navigate to the evaluations page
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await waitForStudentsReady(page);
		await expect(page.getByText('1. Select Students')).toBeVisible();

		// Search for the student to make them visible in the list
		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await filterInput.fill(studentName.toLowerCase());
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', e2eTag);
	});

	test('shows selected student count', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: studentName });
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();
	});
});

test.describe('Evaluations - No Student Error', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		testStudent = false; // Reset at start of each test
		suffix = getTestSuffix('noStudent');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		studentName = `NoStudent_${suffix}`;

		// Create student via API
		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' ogrenci',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testStudent = true;

		// Navigate to the evaluations page
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await waitForStudentsReady(page);
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', e2eTag);
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

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let studentName: string;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		testStudent = false; // Reset at start of each test
		suffix = getTestSuffix('noCat');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		studentName = `NoCat_${suffix}`;

		// Create student via API
		const createResult = await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' kategori',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		if (createResult && typeof createResult === 'object' && 'error' in createResult) {
			throw new Error(`Failed to create student: ${createResult.error}`);
		}
		testStudent = true;

		// Navigate to the evaluations page
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await waitForStudentsReady(page);
		// await expect(page.getByText('1. Select Students')).toBeVisible();

		// Search for the student to make them visible in the list
		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await filterInput.fill(studentName.toLowerCase());
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', e2eTag);
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

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let categoryName: string;
	let studentName: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		testData = false; // Reset at start of each test
		suffix = getTestSuffix('noSub');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		categoryName = `TestCategory_${suffix}`;
		studentName = `NoSub_${suffix}`;

		// Create a category with sub-categories first
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['SubCategory1', 'SubCategory2'],
			e2eTag
		});

		// Create student via API
		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' altkategori',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;

		// Navigate to the evaluations page
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await waitForStudentsReady(page);

		// Search for the student to make them visible in the list
		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await filterInput.fill(studentName.toLowerCase());
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('shows error without sub-category', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: new RegExp(studentName, 'i') });
		await studentRow.click();

		// Click on the category trigger to open the dropdown
		await page.getByRole('button', { name: 'Select category' }).click();

		// Wait for categories to load (Convex sync) - look for any option first
		await expect(page.getByRole('option').first()).toBeVisible({ timeout: 10000 });

		// Now wait for our specific category and select it
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

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let categoryName: string;
	let studentName: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		testData = false; // Reset at start of each test
		suffix = getTestSuffix('submit');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		categoryName = `TestCategory_${suffix}`;
		studentName = `Submit_${suffix}`;

		// Create a category with sub-categories first
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['SubCategory1', 'SubCategory2'],
			e2eTag
		});

		// Create student via API
		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' gönder',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;

		// Navigate to the evaluations page
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await waitForStudentsReady(page);

		// Search for the student to make them visible in the list
		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await filterInput.fill(studentName.toLowerCase());
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('successfully submits evaluation', async ({ page }) => {
		const studentRow = page.getByRole('button', { name: studentName });
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Click on the category trigger to open the dropdown
		await page.getByRole('button', { name: 'Select category' }).click();

		// Wait for categories to load (Convex sync) - look for any option
		await expect(page.getByRole('option').first()).toBeVisible({ timeout: 10000 });

		// Now wait for our specific category and select it
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
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
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
		await page.waitForSelector('body.hydrated');
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

test.describe('Evaluations Long-Press Edit @evaluations-longpress @sequential', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let testData = false;

	// DATA SEEDING & Navigation
	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		testData = false; // Reset at start of each test
		suffix = getTestSuffix('longpressEdit');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `STU_${suffix}`;

		// Create category and student via API
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Sub1', 'Sub2'],
			e2eTag
		});

		await createStudentWithEvaluations({
			studentId,
			englishName: `Student_${suffix}`,
			chineseName: ' ogrenci',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;

		// Navigate to student timeline using custom studentId URL (now supported!)
		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading user data...')).not.toBeVisible();
		await expect(page.getByText('No evaluations found.')).not.toBeVisible();
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
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

test.describe('Evaluations Long-Press Delete @evaluations-longpress @sequential', () => {
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
		testData = false; // Reset at start of each test
		suffix = getTestSuffix('longpressDelete');
		e2eTag = `e2e-test_${suffix}`;
		englishName = `DeleteMe_${suffix}`;
		studentId = `STU_${suffix}`;

		// Create category and student via API
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Sub1', 'Sub2'],
			e2eTag
		});

		await createStudentWithEvaluations({
			studentId,
			englishName,
			chineseName: ' ogrenci',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;

		// Navigate to student timeline using custom studentId URL (now supported!)
		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	// CLEANUP - Conditional based on flag
	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	// TESTS
	test('can delete own evaluation', async ({ page }) => {
		// Find an evaluation card
		const card = page.getByRole('button', { name: /Evaluation by/ }).first();
		await expect(card).toBeVisible();

		// Long-press to open edit dialog
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Wait for edit dialog
		const editDialog = page.getByRole('dialog', { name: /Edit Evaluation/i });
		await expect(editDialog).toBeVisible();

		// Delete button should be visible - click it
		await editDialog.getByRole('button', { name: /Delete/i }).click();

		// Delete confirmation dialog should appear
		const deleteDialog = page.getByRole('dialog', { name: /Delete Evaluation/i });
		await expect(deleteDialog).toBeVisible();

		// Confirm delete
		await deleteDialog.getByRole('button', { name: /Delete/i, exact: true }).click();

		// Dialog should close
		await expect(deleteDialog).not.toBeVisible();

		// Evaluation card should be removed
		await expect(card).not.toBeVisible();
	});

	test('can cancel delete confirmation', async ({ page }) => {
		// Find an evaluation card
		const card = page.locator('.bg-card').first();
		await expect(card).toBeVisible();

		// Long-press to open edit dialog
		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		// Wait for edit dialog
		const editDialog = page.getByRole('dialog', { name: /Edit Evaluation/i });
		await expect(editDialog).toBeVisible();

		// Delete button should be visible - click it
		await editDialog.getByRole('button', { name: 'Delete', exact: true }).click();

		// Delete confirmation dialog should appear
		const deleteDialog = page.getByRole('dialog', { name: /Delete Evaluation/i });
		await expect(deleteDialog).toBeVisible();

		// Click cancel on the confirmation dialog
		await deleteDialog.getByRole('button', { name: /Cancel/i }).click();

		// Confirmation dialog should close
		await expect(deleteDialog).not.toBeVisible();

		// Evaluation card should still exist
		await expect(card).toBeVisible();
	});
});

test.describe('Evaluations - UI Controls @sequential', () => {
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
		testData = false; // Reset at start of each test
		suffix = getTestSuffix('evalUI');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `STU_${suffix}`;
		englishName = `UIName_${suffix}`;

		await createStudentWithEvaluations({
			studentId,
			englishName,
			chineseName: ' ogrenci',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;

		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
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
