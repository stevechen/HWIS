import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
import {
	seedBaseline,
	createEvaluationForStudent,
	createStudent,
	cleanupTestData
} from './convex-client';

test.describe('Delete Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// Store test data info for cleanup
	let testE2eTag: string | null = null;

	test.beforeEach(async ({ page }) => {
		// Reset for each test
		testE2eTag = null;
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForSelector('text=Loading students...', { state: 'detached' });
	});

	test.afterEach(async () => {
		// Cleanup using the stored e2eTag from the test
		if (testE2eTag) {
			try {
				await cleanupTestData(testE2eTag);
			} catch {
				// Cleanup skipped
			}
		}
	});

	test('can delete student without evaluations', async ({ page }) => {
		const suffix = getTestSuffix('delNoEval');
		const studentId = `S_${suffix}`;
		const englishName = `DelNoEval_${suffix}`;

		// Store for cleanup
		testE2eTag = `e2e-test_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Not Enrolled',
			e2eTag: testE2eTag
		});

		await page.getByLabel('Search by name or student ID').fill(englishName);

		await expect(page.getByText(englishName).first()).toBeVisible();

		// Find and click delete button
		const deleteButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete' }).click();

		// Verify student is no longer visible
		await expect(page.getByText(englishName).first()).not.toBeVisible();
	});

	test('can delete student with cascade', async ({ page }) => {
		// This test requires baseline categories to be seeded
		const suffix = getTestSuffix('delCascade');
		const studentId = `S_${suffix}`;
		const englishName = `DelCascade_${suffix}`;

		await seedBaseline();
		await page.waitForTimeout(500);

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await createEvaluationForStudent({
			studentId,
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByLabel('Search by name or student ID').fill(englishName);

		await expect(page.getByText(englishName).first()).toBeVisible();

		const deleteButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		const dialog = page.getByRole('dialog');

		await expect(dialog.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible({
			timeout: 5000
		});
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete Anyway' }).click();

		await expect(page.getByText(englishName).first()).not.toBeVisible();
	});

	test('delete dialog shows Set Not Enrolled for student with evaluations', async ({ page }) => {
		const suffix = getTestSuffix('delDialog');
		const studentId = `S_${suffix}`;
		const englishName = `DelDialog_${suffix}`;

		// Store for cleanup
		testE2eTag = `e2e-test_${suffix}`;

		await seedBaseline();
		await page.waitForTimeout(500);

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});

		await createEvaluationForStudent({
			studentId,
			e2eTag: testE2eTag
		});

		await page.getByLabel('Search by name or student ID').fill(englishName);

		await expect(page.getByText(englishName).first()).toBeVisible();

		const deleteButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		// Check for warning message about evaluations
		const dialog = page.getByRole('dialog');
		await expect(dialog.locator('.bg-yellow-50, .dark\\:bg-yellow-950')).toBeVisible();
		await expect(dialog.getByText(/evaluation record/i)).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();
	});

	test('can set student to Not Enrolled from delete dialog', async ({ page }) => {
		const suffix = getTestSuffix('setNEfromDel');
		const studentId = `S_${suffix}`;
		const englishName = `SetNEFromDel_${suffix}`;

		// Store for cleanup
		testE2eTag = `e2e-test_${suffix}`;

		await seedBaseline();
		await page.waitForTimeout(500);

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await createEvaluationForStudent({
			studentId,
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByLabel('Search by name or student ID').fill(englishName);
		await expect(page.getByText(englishName).first()).toBeVisible();

		const deleteButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByRole('button', { name: 'Set Not Enrolled' }).click();

		await page.getByLabel('Search by name or student ID').fill(englishName);
		// Check status cell in the table row contains "Not Enrolled"
		await expect(
			page.locator('tr').filter({ hasText: englishName }).getByText('Not Enrolled').first()
		).toBeVisible();
	});
});
