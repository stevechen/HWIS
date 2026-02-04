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

		// Click Add Student button using aria-label
		await page.getByRole('button', { name: 'Add new student' }).click();

		// Wait for dialog to open - the form is in a div with role="dialog"
		await expect(page.getByRole('dialog').first()).toBeVisible();

		// Fill form using accessible labels
		const dialog = page.getByRole('dialog').first();
		await dialog.getByLabel('Student ID').fill(studentId);
		await dialog.getByLabel('English Name').fill(englishName);
		await dialog.getByLabel('Chinese Name').fill(chineseName);

		// Select grade using the combobox
		await page.getByRole('combobox').first().selectOption('10');

		// Submit form using aria-label
		await page.getByLabel('Create student').click();

		// Wait for the dialog to close
		await expect(page.getByRole('dialog').first()).not.toBeVisible();

		// Reload page to ensure fresh data from Convex
		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Wait for the student to appear in the list
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

		// Open add student dialog using aria-label
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect(page.getByRole('dialog').first()).toBeVisible();

		// Fill in student ID
		await page.getByRole('dialog').first().getByLabel('Student ID').fill(studentId);

		const dialog = page.getByRole('dialog').first();
		await expect(dialog.getByText('Student ID is available')).toBeVisible({ timeout: 5000 });
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
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect(page.getByRole('dialog').first()).toBeVisible();
		await page.getByRole('dialog').first().getByLabel('Student ID').fill(studentId);
		await page.getByRole('dialog').first().getByLabel('English Name').fill('Duplicate Test');
		await page.getByLabel('Create student').click();

		// Wait for error to appear - use positive assertion with timeout
		// Validation error should appear within reasonable time

		// Wait for any error indicator to be visible using timeout-based polling
		await page.waitForFunction(
			() => {
				const hasAlert = document.querySelector('[role="alert"]') !== null;
				const hasAlreadyExists =
					document.evaluate('//*[contains(text(), "already exists")]', document).iterateNext() !==
					null;
				const hasDuplicate =
					document.evaluate('//*[contains(text(), "duplicate")]', document).iterateNext() !== null;
				return hasAlert || hasAlreadyExists || hasDuplicate;
			},
			{ timeout: 5000 }
		);

		// Verify at least one error indicator is now visible
		const alertVisible = await page
			.locator('role=alert')
			.isVisible()
			.catch(() => false);
		const alreadyExistsVisible = await page
			.getByRole('dialog')
			.first()
			.locator('text=already exists')
			.isVisible()
			.catch(() => false);
		const duplicateVisible = await page
			.getByRole('dialog')
			.first()
			.locator('text=duplicate')
			.isVisible()
			.catch(() => false);
		const errorVisible = alertVisible || alreadyExistsVisible || duplicateVisible;
		expect(errorVisible).toBe(true);
	});
});
