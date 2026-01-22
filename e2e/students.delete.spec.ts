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
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('deleteStud');
		try {
			await cleanupTestData(suffix);
		} catch {
			console.log(`[TEST] Cleanup skipped for deleteStud`);
		}
	});

	test('opens delete confirmation dialog', async ({ page }) => {
		const suffix = getTestSuffix('delDialog');
		const studentId = `S_${suffix}`;
		const englishName = `Del_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Not Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		await page
			.getByRole('row', { name: englishName })
			.getByRole('button', { name: `Delete ${englishName}` })
			.click();

		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByText('Delete', { exact: true })).toBeVisible();
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

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		await page
			.getByRole('row', { name: englishName })
			.getByRole('button', { name: `Delete ${englishName}` })
			.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByRole('row', { name: englishName })).not.toBeVisible();
	});

	test('can delete student with cascade', async ({ page }) => {
		const suffix = getTestSuffix('delCascade');
		const studentId = `S_${suffix}`;
		const englishName = `DelCascade_${suffix}`;

		await seedBaseline();

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		void await createEvaluationForStudent({
			studentId,
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		await page
			.getByRole('row', { name: englishName })
			.getByRole('button', { name: `Delete ${englishName}` })
			.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		const dialog = page.getByRole('dialog');

		await expect(dialog.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete Anyway' }).click();

		await expect(page.getByRole('row', { name: englishName })).not.toBeVisible();
	});

	test('delete dialog shows Set Not Enrolled for student with evaluations', async ({ page }) => {
		const suffix = getTestSuffix('delDialog');
		const studentId = `S_${suffix}`;
		const englishName = `DelDialog_${suffix}`;

		await seedBaseline();

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		void await createEvaluationForStudent({
			studentId,
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		await page
			.getByRole('row', { name: englishName })
			.getByRole('button', { name: `Delete ${englishName}` })
			.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		await expect(page.getByText(/evaluation record/i)).toBeVisible();
		await expect(
			page.getByRole('dialog').getByRole('button', { name: 'Set Not Enrolled' })
		).toBeVisible();
		await expect(
			page.getByRole('dialog').getByRole('button', { name: 'Delete Anyway' })
		).toBeVisible();
	});

	test('can set student to Not Enrolled from delete dialog', async ({ page }) => {
		const suffix = getTestSuffix('setNEfromDel');
		const studentId = `S_${suffix}`;
		const englishName = `SetNEFromDel_${suffix}`;

		await seedBaseline();

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		void await createEvaluationForStudent({
			studentId,
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		await expect(page.getByRole('row', { name: englishName })).toBeVisible();

		await page
			.getByRole('row', { name: englishName })
			.getByRole('button', { name: `Delete ${englishName}` })
			.click();

		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('dialog').getByRole('button', { name: 'Set Not Enrolled' }).click();

		const confirmButton = page.getByRole('button', { name: 'Confirm' });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);
		await expect(
			page.getByRole('row', { name: englishName }).getByText('Not Enrolled')
		).toBeVisible();
	});
});
