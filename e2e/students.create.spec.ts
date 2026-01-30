import { test, expect } from '@playwright/test';
import { getTestSuffix, cleanupE2EData } from './students.shared';
import { createStudent } from './convex-client';

test.describe('Add Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		// Wait for students to load
		await page.waitForSelector('text=Loading students...', { state: 'detached' });
	});

	test.afterEach(async ({ page }) => {
		await cleanupE2EData(page, 'addStudent');
	});

	test('can add a new student', async ({ page }) => {
		const suffix = getTestSuffix('addStud');
		const studentId = `S_${suffix}`;
		const englishName = `AddTest_${suffix}`;
		const chineseName = '新增測試';

		await page.getByRole('button', { name: 'Add Student' }).click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Fill form using labels instead of placeholders
		await page.getByRole('dialog').getByLabel('Student ID').fill(studentId);
		await page.getByRole('dialog').getByLabel('English Name').fill(englishName);
		await page.getByRole('dialog').getByLabel('Chinese Name').fill(chineseName);

		// Select grade
		const gradeSelect = page.getByRole('dialog').getByLabel('Grade');
		await gradeSelect.selectOption('10');

		// Submit form
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		// Wait for the dialog to close
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Search for the student
		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);

		// Verify student is in the list by text content
		await expect(page.getByText(englishName).first()).toBeVisible();
	});
});

test.describe('Student ID Validation @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForSelector('text=Loading students...', { state: 'detached' });
	});

	test.afterEach(async ({ page }) => {
		await cleanupE2EData(page, 'dupIdCheck');
	});

	test.fixme('shows check icon for unique student ID after manual check', async ({ page }) => {
		// This test depends on UI that may have changed
		const suffix = getTestSuffix('dupIdCheck');
		const studentId = `S_${suffix}`;

		await page.getByRole('button', { name: 'Add Student' }).click();
		await page.getByRole('dialog').getByLabel('Student ID').fill(studentId);

		// Check for success indicator
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

		// Wait for student to appear
		await page.waitForTimeout(500);

		// Search for the student
		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);

		// Verify student exists
		await expect(page.getByText(englishName).first()).toBeVisible();

		// Try to add duplicate via form
		await page.getByRole('button', { name: 'Add Student' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('dialog').getByLabel('Student ID').fill(studentId);
		await page.getByRole('dialog').getByLabel('English Name').fill('Duplicate Test');
		await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

		// Check for error message
		const errorAlert = page.getByRole('dialog').getByRole('alert');
		await expect(errorAlert).toHaveText(/Student ID already exists|duplicate/i);
	});
});
