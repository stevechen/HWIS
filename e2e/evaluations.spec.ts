import { test, expect, type Page } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupTestData } from './convex-client';

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

	await page.goto('/evaluations/new');
	await page.waitForSelector('body.hydrated');

	// Wait for students to load
	await page.waitForSelector('text=Loading students...', { state: 'detached' });

	await expect(page.getByText('1. Select Students')).toBeVisible();

	const filterInput = page.getByLabel('Search students');
	await filterInput.fill(englishName);

	// Wait for filter to apply
	await page.waitForTimeout(300);

	// Student items are clickable divs with text
	const studentRow = page.getByText(englishName).first();
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

		// The category selector shows as a button with the trigger text
		const categoryTrigger = page.getByRole('combobox', { name: /Select category/i });
		await expect(categoryTrigger).toBeVisible();
		await categoryTrigger.click();
		await expect(page.getByRole('option').first()).toBeVisible();
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
			await expect(page.getByText(/select.*student/i)).toBeVisible();
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
			await expect(page.getByText(/category/i)).toBeVisible();
		}
	});

	test.fixme('shows error without sub-category', async ({ page }) => {
		// This test requires categories with sub-categories to be seeded
		const suffix = getTestSuffix('noSub');
		const studentName = `NoSub_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '無子類別', 10);

		const studentRow = page.getByText(studentName).first();
		await studentRow.click();

		await page.getByRole('combobox', { name: /Select category/i }).click();
		await expect(page.getByRole('option').first()).toBeVisible();
		await page.getByRole('option').first().click();

		const submitButton = page
			.locator('button')
			.filter({ hasText: /submit/i })
			.first();
		if (await submitButton.isVisible()) {
			await submitButton.click();
			await expect(page.getByText(/sub-category/i)).toBeVisible();
		}
	});

	test.fixme('successfully submits evaluation', async ({ page }) => {
		// This test requires categories with sub-categories to be seeded
		const suffix = getTestSuffix('submit');
		const studentName = `Submit_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '提交', 10);

		const studentRow = page.getByText(studentName).first();
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		await page.getByRole('combobox', { name: /Select category/i }).click();
		await expect(page.getByRole('option').first()).toBeVisible();
		await page.getByRole('option').first().click();

		await expect(page.getByText(/sub-category/i)).toBeVisible();
	});
});
