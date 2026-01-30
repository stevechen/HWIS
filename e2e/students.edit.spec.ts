import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
// Mock auth removed - using real storageState files now
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Edit Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
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
