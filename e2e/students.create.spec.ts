import { test, expect } from '@playwright/test';
import { getTestSuffix, cleanupE2EData } from './students.shared';
import { createStudent } from './convex-client';

test.describe('Add Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async ({ page }) => {
		await cleanupE2EData(page, 'addStudent');
	});

	test('opens add student dialog', async ({ page }) => {
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Add New Student' })).toBeVisible();
	});

	test('can add a new student', async ({ page }) => {
		const suffix = getTestSuffix('addStud');
		const studentId = `S_${suffix}`;
		const englishName = `AddTest_${suffix}`;
		const chineseName = '新增測試';

		await page.getByRole('button', { name: 'Add new student' }).click();
		await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill(studentId);
		await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill(englishName);
		await page.getByRole('dialog').getByPlaceholder('e.g., 張三').fill(chineseName);
		await page.getByRole('dialog').locator('select[aria-label="Grade"]').selectOption('10');
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		// Wait for the dialog to close
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Search for the student
		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		// Verify student is in the list
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});

	test('shows error when student ID is empty', async ({ page }) => {
		await page.getByRole('button', { name: 'Add new student' }).click();
		await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill('Test Student');
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		// Check for error in the dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialogContent = await page.getByRole('dialog').textContent();
		expect(dialogContent).toMatch(/student ID|required|error/i);
	});

	test('shows error when English name is empty', async ({ page }) => {
		await page.getByRole('button', { name: 'Add new student' }).click();
		await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill('S12345');
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		// Check for error in the dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialogContent = await page.getByRole('dialog').textContent();
		expect(dialogContent).toMatch(/name|required|error/i);
	});

	test('can cancel add form', async ({ page }) => {
		await page.getByRole('button', { name: 'Add new student' }).click();
		await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill('S12345');
		await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill('Test');
		await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

		// Verify dialog is closed
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});
});

test.describe('Student ID Validation @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async ({ page }) => {
		await cleanupE2EData(page, 'dupIdCheck');
	});

	test('shows check icon for unique student ID after manual check', async ({ page }) => {
		const suffix = getTestSuffix('dupIdCheck');
		const studentId = `S_${suffix}`;

		await page.getByRole('button', { name: 'Add new student' }).click();
		await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill(studentId);

		// Click check button
		await page
			.getByRole('dialog')
			.locator('button[title="Check if student ID is available"]')
			.click();

		// Check for success indicator - web-first assertion auto-retries
		await expect(page.getByRole('dialog').locator('.text-green-500').first()).toBeVisible();
	});

	test('shows error when submitting duplicate student ID via form', async ({ page }) => {
		const suffix = getTestSuffix('dupIdForm');
		const studentId = `S_${suffix}`;
		const englishName = `First_${suffix}`;

		// First create a student using server API
		await createStudent({
			studentId,
			englishName,
			grade: 10,
			e2eTag: `e2e-test_${suffix}`
		});

		// Search for the student
		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		// Verify student exists
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Try to add duplicate via form
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill(studentId);
		await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill('Duplicate Test');
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		// Check for error message - use role="alert" for semantic accessiblity
		const errorAlert = page.getByRole('dialog').getByRole('alert');
		await expect(errorAlert).toHaveText(/Student ID already exists/i);
	});
});
