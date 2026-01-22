import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
import { setTestAuth } from './auth.helpers';
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Edit Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await setTestAuth(page, 'admin');

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		const suffix = getTestSuffix('editStudent');
		try {
			await cleanupTestData(suffix);
		} catch {
			console.log(`[TEST] Cleanup skipped for editStudent`);
		}
	});

	test('opens edit student dialog', async ({ page }) => {
		const suffix = getTestSuffix('editOpen');
		const studentId = `S_${suffix}`;

		await createStudent({
			studentId,
			englishName: `EditMe_${suffix}`,
			grade: 10,
			status: 'Not Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(`EditMe_${suffix}`);

		await expect(page.getByRole('row', { name: `EditMe_${suffix}` })).toBeVisible();

		await page
			.getByRole('row', { name: `EditMe_${suffix}` })
			.getByRole('button', { name: `Edit EditMe_${suffix}` })
			.click();

		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Edit Student' })).toBeVisible();
	});

	test('pre-fills form with student data', async ({ page }) => {
		const suffix = getTestSuffix('editPrefill');
		const studentId = `S_${suffix}`;

		await createStudent({
			studentId,
			englishName: `Prefill_${suffix}`,
			chineseName: '預填',
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(`Prefill_${suffix}`);

		await expect(page.getByRole('row', { name: `Prefill_${suffix}` })).toBeVisible();

		await page
			.getByRole('row', { name: `Prefill_${suffix}` })
			.getByRole('button', { name: new RegExp(`^Edit Prefill_${suffix}$`) })
			.click();

		await expect(page.getByRole('dialog').getByPlaceholder('e.g., S1001')).toHaveValue(studentId);
		await expect(page.getByRole('dialog').getByPlaceholder('e.g., John Smith')).toHaveValue(
			`Prefill_${suffix}`
		);
	});

	test('can update student status', async ({ page }) => {
		const suffix = getTestSuffix('editStatus');
		const studentId = `S_${suffix}`;

		await createStudent({
			studentId,
			englishName: `Status_${suffix}`,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(`Status_${suffix}`);

		await expect(page.getByRole('row', { name: `Status_${suffix}` })).toBeVisible();

		await page
			.getByRole('row', { name: `Status_${suffix}` })
			.getByRole('button', { name: new RegExp(`^Edit Status_${suffix}$`) })
			.click();

		await page
			.getByRole('dialog')
			.locator('select[aria-label="Status"]')
			.selectOption('Not Enrolled');
		await page.getByRole('dialog').getByRole('button', { name: 'Update' }).click();

		await expect(page.getByRole('dialog')).not.toBeVisible();
		await page.getByPlaceholder('Search by name or student ID...').fill(`Status_${suffix}`);
		await expect(
			page.getByRole('row', { name: `Status_${suffix}` }).getByText('Not Enrolled')
		).toBeVisible();
	});
});
