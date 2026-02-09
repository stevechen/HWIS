import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupByTag, setE2eTag } from './convex-client';

test.describe('Add Student - UI Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('addStud');
	const studentId = `S_${suffix}`;
	const englishName = `AddTest_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can add a new student', async ({ page }) => {
		const chineseName = '新增測試';

		// Click Add Student button using aria-label
		await page.getByRole('button', { name: 'Add new student' }).click();

		// Wait for dialog to open - the form is in a div with role="dialog"
		const dialog = page.getByRole('dialog', { name: 'Student form' });
		await expect(dialog).toBeVisible();

		// Fill form using accessible labels
		await dialog.getByRole('textbox', { name: 'Student ID' }).fill(studentId);
		await dialog.getByRole('textbox', { name: 'English Name *' }).fill(englishName);
		await dialog.getByRole('textbox', { name: 'Chinese Name' }).fill(chineseName);

		// Submit form using aria-label
		await page.getByRole('button', { name: 'Create student' }).click();

		// Wait for the dialog to close
		await expect(dialog).not.toBeVisible();
		await page.waitForSelector('body.hydrated');

		// Wait for the student to appear in the list
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Set e2eTag on the student for cleanup
		await setE2eTag('students', studentId, e2eTag);
		testStudent = true;
	});

	test('shows check icon for unique student ID after manual check', async ({ page }) => {
		const suffix2 = getTestSuffix('dupIdCheck');
		const studentId2 = `S_${suffix2}`;

		// Open add student dialog using aria-label
		await page.getByRole('button', { name: 'Add new student' }).click();
		const dialog = page.getByRole('dialog', { name: 'Student form' });

		await expect(dialog).toBeVisible();

		// Fill in student ID
		await dialog.getByRole('textbox', { name: 'Student ID' }).fill(studentId2);
		await dialog.getByRole('button', { name: 'ID unknown' }).click();

		await expect(dialog.getByRole('button', { name: 'ID available' })).toBeVisible();
	});
});

test.describe('Student ID Validation - Duplicate Data Tests', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('dupIdForm');
	const studentId = `S_${suffix}`;
	const englishName = `First_${suffix}`;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		// Create the student first so we can test duplicate detection
		await createStudent({
			studentId,
			englishName,
			grade: 10,
			e2eTag: `e2e-test_${suffix}`
		});
		testStudent = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Wait for student to appear in the list
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', `e2e-test_${suffix}`);
	});

	test('shows error when submitting duplicate student ID via form', async ({ page }) => {
		// Try to add duplicate via form
		await page.getByRole('button', { name: 'Add new student' }).click();

		const dialog = page.getByRole('dialog', { name: 'Student form' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('textbox', { name: 'Student ID' }).fill(studentId);
		await dialog.getByLabel('English Name').fill('Duplicate Test');
		await dialog.getByRole('button', { name: 'Create student' }).click();

		await dialog.getByRole('alert', { name: 'Form errors' }).isVisible();
		await expect(dialog.getByRole('alert', { name: 'Form errors' })).toHaveText(/taken/);
	});
});
