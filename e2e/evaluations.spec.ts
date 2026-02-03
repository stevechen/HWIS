import { test, expect, type Page } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, createCategoryWithSubs, cleanupTestData } from './convex-client';

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
	await page.goto('/evaluations/new?testRole=teacher');
	await page.waitForSelector('body.hydrated');

	// Wait for students to load - need longer wait for Convex reactivity
	await page.waitForTimeout(3000);

	await expect(page.getByText('1. Select Students')).toBeVisible();

	// Use aria-label to find the search input
	const filterInput = page.locator('input[aria-label="Search students"]').first();
	await expect(filterInput).toBeVisible();

	// Clear the search input first, then type the student name (lowercase for case-insensitive search)
	await filterInput.fill('');
	await filterInput.fill(englishName.toLowerCase());

	// Wait for filter to apply and reactivity to update (Convex reactive queries need time)
	await page.waitForTimeout(2000);

	// Student items display as "englishName (chineseName)" format
	// Look for the student name in the list - check for "No students found" first
	const noStudentsMsg = page.getByText('No students found');
	const hasNoStudents = await noStudentsMsg.isVisible().catch(() => false);

	if (hasNoStudents) {
		await page.waitForSelector('body.hydrated');

		// Try searching again
		const filterInput2 = page.locator('input[aria-label="Search students"]').first();
		await filterInput2.fill('');
		await filterInput2.fill(englishName.toLowerCase());
		await page.waitForTimeout(2000);
	}

	// Student items are clickable divs with text in format "englishName (chineseName)"
	// Use case-insensitive search since the filter is case-insensitive
	const studentRow = page.getByText(new RegExp(englishName, 'i')).first();
	await expect(studentRow).toBeVisible();
}

test.describe('Evaluations (authenticated as teacher) @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('eval');
		try {
			await cleanupTestData(suffix);
		} catch {
			// Ignore cleanup errors
		}
	});

	test('displays new evaluation page', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'New Evaluation' })).toBeVisible();
	});

	test('displays categories from database', async ({ page }) => {
		// Wait for categories to load
		await page.waitForTimeout(500);

		// The category selector shows as a button with aria-label - just verify it exists
		const categoryTrigger = page.locator('[aria-label="Select category"]').first();
		await expect(categoryTrigger).toBeVisible();
		// Verify the trigger shows the placeholder text
		await expect(categoryTrigger).toContainText('Select Category');
	});

	test('displays students list', async ({ page }) => {
		await expect(page.getByText('1. Select Students')).toBeVisible();
		await expect(page.getByLabel('Search students')).toBeVisible();
	});

	test('allows selecting a student', async ({ page }) => {
		const suffix = getTestSuffix('selectStudent');
		const studentName = `SelectMe_${suffix}`;

		await createStudentForEval(page, suffix, studentName, '選擇我', 10);

		const studentRow = page.getByText(studentName).first();
		await expect(studentRow).toBeVisible();

		await studentRow.click();

		await expect(page.getByText(/student.*selected/i)).toBeVisible();
	});

	test('shows selected student count', async ({ page }) => {
		const suffix = getTestSuffix('countStudent');
		const studentName = `CountMe_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '計數我', 10);

		const studentRow = page.getByText(studentName).first();
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();
	});

	test('shows error without student selection', async ({ page }) => {
		// Try to submit without selecting any students
		const submitButton = page
			.locator('button')
			.filter({ hasText: /submit/i })
			.first();
		if (await submitButton.isVisible()) {
			await submitButton.click();
			// The error message says "Please select at least one student"
			await expect(page.getByText(/Please select at least one student/i)).toBeVisible();
		}
	});

	test('shows error without category', async ({ page }) => {
		const suffix = getTestSuffix('noCat');
		const studentName = `NoCat_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '無類別', 10);

		const studentRow = page.getByText(studentName).first();
		await studentRow.click();

		// Try to submit without selecting category
		const submitButton = page
			.locator('button')
			.filter({ hasText: /submit/i })
			.first();
		if (await submitButton.isVisible()) {
			await submitButton.click();
			// The error message says "Please select a category"
			await expect(page.getByText(/Please select a category/i)).toBeVisible();
		}
	});

	test('shows error without sub-category', async ({ page }) => {
		// Create a category with sub-categories first
		const suffix = getTestSuffix('noSub');
		const categoryName = `TestCategory_${suffix}`;
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['SubCategory1', 'SubCategory2'],
			e2eTag: `e2e-test_${suffix}`
		});

		const studentName = `NoSub_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '無子類別', 10);

		const studentRow = page.getByText(studentName).first();
		await studentRow.click();

		// Click on the category trigger to open the dropdown
		await page.locator('[aria-label="Select category"]').first().click();

		// Wait for dropdown to open and select the category we just created
		await expect(page.getByText(categoryName)).toBeVisible();
		await page.getByText(categoryName).click();

		// Verify sub-category section appears
		await expect(page.getByText(/Sub-Category/i)).toBeVisible();

		// Try to submit without selecting sub-category
		const submitButton = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton.click();

		// Should show error about sub-category
		await expect(page.getByText(/Please select a sub-category/i)).toBeVisible();
	});

	test('successfully submits evaluation', async ({ page }) => {
		// Create a category with sub-categories first
		const suffix = getTestSuffix('submit');
		const categoryName = `TestCategory_${suffix}`;
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['SubCategory1', 'SubCategory2'],
			e2eTag: `e2e-test_${suffix}`
		});

		const studentName = `Submit_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '提交', 10);

		const studentRow = page.getByText(studentName).first();
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Click on the category trigger to open the dropdown
		await page.locator('[aria-label="Select category"]').first().click();

		// Wait for dropdown to open and select the category we just created
		await expect(page.getByText(categoryName)).toBeVisible();
		await page.getByText(categoryName).click();

		// Verify sub-category section appears
		await expect(page.getByText(/Sub-Category/i)).toBeVisible();

		// Select a sub-category
		await page.locator('[aria-label="Select sub-category"]').first().click();
		await expect(page.getByText('SubCategory1')).toBeVisible();
		await page.getByText('SubCategory1').click();

		// Submit the evaluation
		const submitButton = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton.click();

		// Should redirect to evaluations page after successful submission (teachers land on evaluations)
		await expect(page).toHaveURL('/evaluations', { timeout: 10000 });
	});
});

test.describe('Evaluations (admin user) @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
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
		await expect(page).toHaveURL('/admin', { timeout: 5000 });
	});

	test('displays evaluation history for admin users', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Evaluation History' })).toBeVisible();
	});

	test('can navigate back to admin then return to evaluations', async ({ page }) => {
		// First verify "Back to Admin" button exists and click it
		const backButton = page.getByRole('button', { name: /Back to Admin/i });
		await expect(backButton).toBeVisible();
		await backButton.click();
		await expect(page).toHaveURL('/admin', { timeout: 5000 });

		// Now navigate back to evaluations using the Evaluation Review card
		const evalReviewCard = page.getByRole('link', { name: /My Evaluation Review/i });
		await expect(evalReviewCard).toBeVisible();
		await evalReviewCard.click();
		await expect(page).toHaveURL('/evaluations', { timeout: 5000 });

		// Verify "Back to Admin" button is still visible
		await expect(page.getByRole('button', { name: /Back to Admin/i })).toBeVisible();
	});
});
