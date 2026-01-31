import { test, expect } from '@playwright/test';
import { getTestSuffix, cleanupE2EData } from './students.shared';
import { createStudent } from './convex-client';

test.describe('Add Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		// Wait for students to load
		await page.waitForTimeout(1000);
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

		// Select grade using the NativeSelect
		await page.locator('select').first().selectOption('10');

		// Submit form - look for Create button
		await page.locator('button').filter({ hasText: 'Create' }).click();

		// Wait for the dialog to close
		await expect(page.locator('[role="dialog"]').first()).not.toBeVisible();

		// Reload page to ensure fresh data from Convex
		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Wait for the student to appear in the list
		await expect(page.getByText(englishName)).toBeVisible({ timeout: 10000 });
	});
});

test.describe('Student ID Validation @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForTimeout(1000);
	});

	test.afterEach(async ({ page }) => {
		await cleanupE2EData(page, 'dupIdCheck');
	});

	test.fixme('shows check icon for unique student ID after manual check', async ({ page }) => {
		// This test depends on UI that may have changed
		const suffix = getTestSuffix('dupIdCheck');
		const studentId = `S_${suffix}`;

		await page.locator('button').filter({ hasText: 'Add Student' }).click();
		await page.locator('input#studentId').fill(studentId);

		// Check for success indicator
		await expect(
			page.locator('[role="dialog"]').first().locator('.text-green-500').first()
		).toBeVisible();
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
		await expect(page.getByText(englishName)).toBeVisible({ timeout: 15000 });

		// Try to add duplicate via form
		await page.locator('button').filter({ hasText: 'Add Student' }).click();
		await expect(page.locator('[role="dialog"]').first()).toBeVisible();
		await page.locator('input#studentId').fill(studentId);
		await page.locator('input#englishName').fill('Duplicate Test');
		await page.locator('button').filter({ hasText: 'Create' }).click();

		// Wait for error to appear
		await page.waitForTimeout(500);

		// Check for error message - look for error text in the dialog
		const dialogContent = await page.locator('[role="dialog"]').first().textContent();
		expect(dialogContent).toMatch(/already exists|duplicate|error/i);
	});
});
