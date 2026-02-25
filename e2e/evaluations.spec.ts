import { test, expect, type Page } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createStudent,
	createStudentWithEvaluations,
	createCategory,
	cleanupByTag,
	useRole
} from './convex-client';

async function waitForStudentsReady(page: Page) {
	await expect(page.getByText('Loading students...')).not.toBeVisible();
	await expect(page.getByRole('list', { name: 'Students' })).toBeVisible();
}

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

		// Create a category first
		await createCategory({
			name: categoryName,
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

		// Submit the evaluation
		const submitButton = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton.click();

		// Should redirect to evaluations page after successful submission (teachers land on evaluations)
		await expect(page).toHaveURL('/evaluations');
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
		await createCategory({
			name: `Cat_${suffix}`,
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
		await createCategory({
			name: `Cat_${suffix}`,
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
		await expect(page.getByText('Loading history...')).not.toBeVisible();
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
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
