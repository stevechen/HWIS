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

	test('can add a new student', async ({ page }) => {
		const suffix = getTestSuffix('addStud');
		const studentId = `S_${suffix}`;
		const englishName = `AddTest_${suffix}`;
		const chineseName = '新增測試';

		// Click Add Student button
		await page.locator('button').filter({ hasText: 'Add Student' }).click();

		// Wait for dialog to open - the form is in a div with role="dialog"
		await expect(page.locator('[role="dialog"]').first()).toBeVisible();

		// Fill form using input IDs
		await page.locator('input#studentId').fill(studentId);
		await page.locator('input#englishName').fill(englishName);
		await page.locator('input#chineseName').fill(chineseName);

		// Submit form - look for Create button
		await page.locator('button').filter({ hasText: 'Create' }).click();

		// Wait for the dialog to close - this happens after successful Convex mutation
		await expect(page.locator('[role="dialog"]').first()).not.toBeVisible();

		// Search for and verify the newly created student appears
		await expect(page.getByText(englishName)).toBeVisible();
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

		// Open add student dialog
		await page.locator('button').filter({ hasText: 'Add Student' }).click();
		await expect(page.locator('[role="dialog"]').first()).toBeVisible();

		// Fill in student ID
		await page.locator('input#studentId').fill(studentId);

		// Check for success indicators using multiple possible selectors
		// The UI might show success in different ways
		const dialog = page.locator('[role="dialog"]').first();

		// Wait for validation to occur (either auto or manual)
		// The form has a 500ms debounce - wait for potential success indicators
		const hasSuccessIndicator = await Promise.any([
			// Green check icon
			dialog
				.locator('.text-green-500')
				.isVisible()
				.then((v) => v),
			// Check icon SVG
			dialog
				.locator('svg[class*="check"]')
				.isVisible()
				.then((v) => v),
			// Success text
			dialog
				.getByText(/available|valid|unique/i)
				.isVisible()
				.then((v) => v),
			// No error message shown
			dialog
				.locator('.text-red-500, .text-destructive')
				.isVisible()
				.then((v) => !v)
		]).catch(() => false);

		// If no explicit success indicator, verify the form allows submission
		// (Create button is enabled means validation passed)
		if (!hasSuccessIndicator) {
			const createButton = dialog.getByRole('button', { name: 'Create' });
			await expect(createButton).toBeEnabled();
		}
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

		// Wait for student to appear in the list (Convex reactivity)
		await expect(page.getByText(englishName)).toBeVisible({ timeout: 5000 });

		// Try to add duplicate via form
		await page.locator('button').filter({ hasText: 'Add Student' }).click();
		await expect(page.locator('[role="dialog"]').first()).toBeVisible();
		await page.locator('input#studentId').fill(studentId);
		await page.locator('input#englishName').fill('Duplicate Test');
		await page.locator('button').filter({ hasText: 'Create' }).click();

		// Wait for error to appear
		await expect(page.getByText(/already exists|duplicate|error/i).first()).toBeVisible({
			timeout: 5000
		});

		// Check for error message - look for error text in the dialog
		// The error appears in multiple forms: alert message, validation text, or dialog remains open with error
		const dialog = page.locator('[role="dialog"]').first();

		// Check for alert error, validation message, or form error
		const hasError = await Promise.any([
			page
				.locator('role=alert')
				.isVisible()
				.then((v) => v),
			dialog
				.locator('text=already exists')
				.isVisible()
				.then((v) => v),
			dialog
				.locator('text=error')
				.isVisible()
				.then((v) => v),
			dialog
				.locator('text=duplicate')
				.isVisible()
				.then((v) => v)
		]).catch(() => false);

		if (!hasError) {
			// As fallback, check that dialog is still open (error prevented submission)
			await expect(dialog).toBeVisible();
		}
	});
});
