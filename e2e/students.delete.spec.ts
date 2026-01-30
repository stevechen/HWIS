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

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForSelector('text=Loading students...', { state: 'detached' });
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('deleteStud');
		try {
			await cleanupTestData(suffix);
		} catch {
			console.log(`[TEST] Cleanup skipped for deleteStud`);
		}
	});

	test('can delete student without evaluations', async ({ page }) => {
		const suffix = getTestSuffix('delNoEval');
		const studentId = `S_${suffix}`;
		const englishName = `DelNoEval_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Not Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		// Wait for student to appear
		await page.waitForTimeout(500);

		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);

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
		await page.waitForTimeout(300);
		await expect(page.getByText(englishName).first()).not.toBeVisible();
	});

	test.fixme('can delete student with cascade', async ({ page }) => {
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

		await page.waitForTimeout(500);

		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);

		await expect(page.getByText(englishName).first()).toBeVisible();

		const deleteButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		const dialog = page.getByRole('dialog');

		await expect(dialog.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete Anyway' }).click();

		await page.waitForTimeout(300);
		await expect(page.getByText(englishName).first()).not.toBeVisible();
	});

	test.fixme('delete dialog shows Set Not Enrolled for student with evaluations', async ({
		page
	}) => {
		const suffix = getTestSuffix('delDialog');
		const studentId = `S_${suffix}`;
		const englishName = `DelDialog_${suffix}`;

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

		await page.waitForTimeout(500);

		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);

		await expect(page.getByText(englishName).first()).toBeVisible();

		const deleteButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		await expect(page.getByText(/evaluation/i)).toBeVisible();
		await expect(
			page.getByRole('dialog').getByRole('button', { name: 'Set Not Enrolled' })
		).toBeVisible();
		await expect(
			page.getByRole('dialog').getByRole('button', { name: 'Delete Anyway' })
		).toBeVisible();
	});

	test.fixme('can set student to Not Enrolled from delete dialog', async ({ page }) => {
		const suffix = getTestSuffix('setNEfromDel');
		const studentId = `S_${suffix}`;
		const englishName = `SetNEFromDel_${suffix}`;

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

		await page.waitForTimeout(500);

		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);

		await expect(page.getByText(englishName).first()).toBeVisible();

		const deleteButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /delete/i })
			.first();
		await deleteButton.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByRole('button', { name: 'Set Not Enrolled' }).click();

		const confirmButton = page.getByRole('button', { name: 'Confirm' });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}

		await page.waitForTimeout(300);
		await page.getByLabel('Search by name or student ID').fill(englishName);
		await expect(page.getByText('Not Enrolled').first()).toBeVisible();
	});
});
