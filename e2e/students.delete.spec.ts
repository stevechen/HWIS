import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createEvaluationForStudent,
	createStudent,
	cleanupByTag,
	createCategoryWithSubs,
	useRole
} from './convex-client';

test.describe('Delete Student - Without Evaluations', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('delNoEval');
	const studentId = `S_${suffix}`;
	const englishName = `DelNoEval_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		// Create category first (needed for students)
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITHOUT evaluation
		await createStudent({
			studentId: studentId,
			englishName: englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Clear filters
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
	});

	test('can delete student without evaluations', async ({ page }) => {
		// Wait for student to appear
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page.getByRole('button', { name: `Delete ${studentId}` });
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialog = page.getByRole('dialog');

		// Click Delete button
		const deleteBtn = dialog.getByRole('button', { name: 'Delete' });
		await expect(deleteBtn).toBeVisible();
		await deleteBtn.click();

		// Wait for dialog to close
		await expect(dialog).not.toBeVisible();

		// Verify deletion
		await expect(page.getByRole('cell', { name: englishName })).not.toBeVisible();

		// Data was deleted, don't clean up in afterEach
		testStudent = false;
	});
});

test.describe('Delete Student - With Cascade', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		suffix = getTestSuffix('delCascade');
		studentId = `S_${suffix}`;
		englishName = `DelCascade_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		// Create category
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITH evaluation
		await createStudent({
			studentId: studentId,
			englishName: englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;

		await createEvaluationForStudent({ studentId, e2eTag });
		testEvaluation = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Clear filters
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can delete student with cascade', async ({ page }) => {
		// Wait for student
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page.getByRole('button', { name: `Delete ${studentId}` });
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialog = page.getByRole('dialog');

		// Wait for cascade UI
		await expect(dialog.getByRole('alert')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();

		// Click Delete Anyway
		await dialog.getByRole('button', { name: 'Delete Anyway' }).click();

		// Verify deletion
		await expect(page.getByRole('row', { name: englishName })).not.toBeVisible();

		// Student and evaluation deleted via cascade, but category & audit log (through evaluation clean up) still needs cleanup
		testStudent = false;
		// testCategory remains true for cleanup
	});
});

test.describe('Delete Dialog - Shows Options', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('dlgNotEnrolled');
	const studentId = `S_${suffix}`;
	const englishName = `DlgNotEnrolled_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;

	test.beforeEach(async () => {
		useRole('admin');
		// Create category
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITH evaluation
		await createStudent({
			studentId: studentId,
			englishName: englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;

		await createEvaluationForStudent({ studentId, e2eTag });
		testEvaluation = true;
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Clear filters
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');
	});

	test('delete dialog shows Set Not Enrolled for student with evaluations', async ({ page }) => {
		// Wait for student
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page.getByRole('button', { name: `Delete ${studentId}` }).first();
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialog = page.getByRole('dialog');

		// Verify cascade UI
		await expect(dialog.getByRole('alert')).toBeVisible();
		await expect(dialog.getByText(/evaluation record/i)).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();
	});
});

test.describe('Delete - Set Not Enrolled', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('setNotEnrolled');
	const studentId = `S_${suffix}`;
	const englishName = `SetNotEnrolled_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;
	let testCategory = false;
	let testEvaluation = false;

	test.beforeEach(async ({ page }) => {
		// Create category
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Homework'],
			e2eTag: e2eTag
		});
		testCategory = true;

		// Create student WITH evaluation
		await createStudent({
			studentId: studentId,
			englishName: englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;

		await createEvaluationForStudent({ studentId, e2eTag });
		testEvaluation = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		// Clear filters
		const statusFilter = page.getByLabel('Filter by status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		const searchInput = page.getByRole('textbox', { name: 'Search students' });
		await searchInput.fill('');
	});

	test.afterEach(async () => {
		if (testEvaluation) await cleanupByTag('evaluations', e2eTag);
		if (testCategory) await cleanupByTag('categories', e2eTag);
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('can set student to Not Enrolled from delete dialog', async ({ page }) => {
		// Wait for student
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		// Click delete button
		const deleteButton = page
			.getByRole('row', { name: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		// Wait for dialog
		await expect(page.getByRole('dialog')).toBeVisible();

		// Click Set Not Enrolled
		await page.getByRole('dialog').getByRole('button', { name: 'Set Not Enrolled' }).click();

		// Clear search
		await page.getByRole('textbox', { name: 'Search students' }).fill('');

		// Verify status changed
		await expect(
			page.getByRole('row', { name: englishName }).getByText('Not Enrolled')
		).toBeVisible();

		// Student and category still exist, evaluation was used but should be cleaned up
		// (testEvaluation remains true for cleanup)
	});
});
