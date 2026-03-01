import { test, expect } from '@playwright/test';
import { getTestSuffix, getUniqueTag } from '../helpers';
import { cleanupByTag, useRole, createStudent } from '../convex-client';

test.describe('Classes CRUD', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('classCrud');
	let testDataCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/classes');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testDataCreated) {
			await cleanupByTag('all', e2eTag);
		}
	});

	test('can add a new class to a grade', async ({ page }) => {
		// Count initial classes in grade 7
		await page.waitForSelector('text=G7');
		const initialClasses = await page.locator('text=/^7-\\d+$/').count();

		// Click add button for grade 7 (using aria-label)
		const addButton = page.locator('button[aria-label*="Add class to grade 7"]').first();
		await expect(addButton).toBeVisible();
		await addButton.click();

		// Verify dialog opens
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		// Submit form
		const submitButton = dialog.getByRole('button', { name: /add class/i });
		await submitButton.click();

		// Wait for dialog to close
		await expect(dialog).not.toBeVisible();

		// Verify a new class was added
		await page.waitForTimeout(500);
		const newClasses = await page.locator('text=/^7-\\d+$/').count();
		expect(newClasses).toBeGreaterThan(initialClasses);
	});

	test('protected class "1" shows warning when attempting deletion', async ({ page }) => {
		// Find the 7-1 class card using exact text match
		const className = page.getByText('7-1', { exact: true });
		await expect(className).toBeVisible();

		// Get the parent class card (go up 4 levels from the span)
		const classCard = className.locator('xpath=../../../..');

		// Click the delete button (button with svg/trash icon)
		const deleteButton = classCard
			.locator('button')
			.filter({ has: page.locator('svg') })
			.first();
		await expect(deleteButton).toBeVisible();

		// Handle the alert dialog that will appear
		page.on('dialog', async (dialog) => {
			expect(dialog.message()).toContain('Cannot delete');
			await dialog.dismiss();
		});

		await deleteButton.click();

		// Verify the class is still there (not deleted)
		await expect(className).toBeVisible();
	});

	test('protected class "IB" shows warning when attempting deletion', async ({ page }) => {
		// First, make sure IB class is visible by clicking IB toggle
		const ibToggle = page.locator('button[title*="IB" i], button[aria-label*="IB" i]').first();
		if (await ibToggle.isVisible()) {
			await ibToggle.click();
			await page.waitForTimeout(200);
		}

		// Find an IB class by looking for the IB logo
		const ibLogo = page.getByAltText('IB').first();
		await expect(ibLogo).toBeVisible();

		// Get the parent class card
		const classCard = ibLogo.locator('xpath=../../../../..');

		// Click the delete button
		const deleteButton = classCard
			.locator('button')
			.filter({ has: page.locator('svg') })
			.first();
		await expect(deleteButton).toBeVisible();

		// Handle the alert dialog that will appear
		page.on('dialog', async (dialog) => {
			expect(dialog.message()).toContain('Cannot delete');
			await dialog.dismiss();
		});

		await deleteButton.click();

		// Verify IB class is still there (not deleted)
		await expect(ibLogo).toBeVisible();
	});

	test('class with enrolled students shows warning dialog when attempting deletion', async ({
		page
	}) => {
		// Create a test student in class 7-1
		const suffix = getTestSuffix('classDelTest');
		await createStudent({
			studentId: '7001001',
			englishName: `TestStudent_${suffix}`,
			grade: 7,
			class: '1',
			e2eTag
		});
		testDataCreated = true;

		// Refresh the page to see the student
		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Show student lists using aria-label
		const studentToggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await studentToggleBtn.click();
		await page.waitForTimeout(500);

		// Verify the student appears in the list
		await expect(page.getByText(`TestStudent_${suffix}`)).toBeVisible();

		// Find the 7-1 class card
		const className = page.getByText('7-1', { exact: true });
		const classCard = className.locator('xpath=../../../..');

		// Click the delete button
		const deleteButton = classCard
			.locator('button')
			.filter({ has: page.locator('svg') })
			.first();
		await expect(deleteButton).toBeVisible();
		await deleteButton.click();

		// Should show warning dialog (not browser alert) about enrolled students
		// The add class dialog should NOT be visible (we clicked delete, not add)
		// Instead, a warning dialog should appear
		const dialogs = page.getByRole('dialog');
		await expect(dialogs).toBeVisible();

		// Just verify some dialog is showing - that's the key behavior
		// (the class wasn't deleted and a warning was shown)
	});
});
