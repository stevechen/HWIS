import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { setTestAuth } from './auth.helpers';
import { createStudent, cleanupTestData } from './convex-client';

async function createStudentForEval(
	page: any,
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

	await expect(page.locator('div[role="button"]').first()).toBeVisible();

	const filterInput = page.getByPlaceholder('Filter by name or ID...');
	await filterInput.fill(englishName);

	const studentRow = page.locator('div[role="button"]', { hasText: suffix });
	await expect(studentRow).toBeVisible();
}

test.describe('Evaluations (authenticated as teacher) @evaluations', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.beforeEach(async ({ page }) => {
		await setTestAuth(page, 'teacher');

		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('eval');
		try {
			await cleanupTestData(suffix);
		} catch (e) {}
	});

	test('should display new evaluation page', async ({ page }) => {
		await expect(page.locator('h1', { hasText: 'New Evaluation' })).toBeVisible();
	});

	test('should display categories from database', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Select category' })).toBeVisible();
		await page.getByRole('button', { name: 'Select category' }).click();
		await expect(page.locator('[role="option"]').first()).toBeVisible();
	});

	test('should display students list', async ({ page }) => {
		await expect(page.getByText('1. Select Students')).toBeVisible();
		await expect(page.getByPlaceholder('Filter by name or ID...')).toBeVisible();
	});

	test('should allow selecting a student', async ({ page }) => {
		const suffix = getTestSuffix('selectStudent');
		const studentName = `SelectMe_${suffix}`;

		await createStudentForEval(page, suffix, studentName, '選擇我', 10);

		// Students are div[role="button"], not actual buttons
		const studentRow = page.locator('div[role="button"]', { hasText: suffix });
		await expect(studentRow).toBeVisible();

		await studentRow.click();

		await expect(page.getByText('1 student(s) selected')).toBeVisible();
	});

	test('should show selected student count', async ({ page }) => {
		const suffix = getTestSuffix('countStudent');
		const studentName = `CountMe_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '計數我', 10);

		const studentRow = page.locator('div[role="button"]', { hasText: suffix });
		await studentRow.click();
		await expect(page.getByText('1 student(s) selected')).toBeVisible();
	});

	test('should show error when submitting without student selection', async ({ page }) => {
		await page.getByRole('button', { name: 'Submit evaluation for 0 student(s)' }).click();
		await expect(page.getByText('Please select at least one student')).toBeVisible();
	});

	test('should show error when submitting without category', async ({ page }) => {
		const suffix = getTestSuffix('noCat');
		const studentName = `NoCat_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '無類別', 10);

		const studentRow = page.locator('div[role="button"]', { hasText: suffix });
		await studentRow.click();

		await page.getByRole('button', { name: 'Submit evaluation for 1 student(s)' }).click();
		await expect(page.getByText('Please select a category')).toBeVisible();
	});

	test('should show error when submitting without sub-category', async ({ page }) => {
		const suffix = getTestSuffix('noSub');
		const studentName = `NoSub_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '無子類別', 10);

		const studentRow = page.locator('div[role="button"]', { hasText: suffix });
		await studentRow.click();

		await page.getByRole('button', { name: 'Select category' }).click();
		await expect(page.locator('[role="option"]').first()).toBeVisible();
		await page.locator('[role="option"]').first().click();
		await page.getByRole('button', { name: 'Submit evaluation for 1 student(s)' }).click();
		await expect(page.getByText('Please select a sub-category')).toBeVisible();
	});

	test('should successfully submit evaluation', async ({ page }) => {
		const suffix = getTestSuffix('submit');
		const studentName = `Submit_${suffix}`;
		await createStudentForEval(page, suffix, studentName, '提交', 10);

		const studentRow = page.locator('div[role="button"]', { hasText: suffix });
		await studentRow.click();
		await expect(page.getByText('1 student(s) selected')).toBeVisible();

		await page.getByRole('button', { name: 'Select category' }).click();
		await expect(page.locator('[role="option"]').first()).toBeVisible();
		await page.locator('[role="option"]').first().click();

		await expect(page.getByRole('button', { name: 'Select Sub-Category' })).toBeVisible();

		await page.getByRole('button', { name: 'Select Sub-Category' }).click();
		await expect(page.locator('[role="option"]').first()).toBeVisible();
		await page.locator('[role="option"]').first().click();

		await expect(
			page.getByRole('button', { name: /Submit evaluation for 1 student/ })
		).toBeVisible();
	});
});
