import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
// Mock auth removed - using real storageState files now
import { createStudent, cleanupTestData } from './convex-client';

test.describe('Edit Student @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForSelector('text=Loading students...', { state: 'detached' });
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
		const englishName = `Status_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		// Wait for student to appear in list
		await page.waitForTimeout(500);

		// Search for the student
		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);

		// Verify student is visible
		await expect(page.getByText(englishName).first()).toBeVisible();

		// Find and click edit button for this student
		const editButton = page
			.locator('tr')
			.filter({ hasText: englishName })
			.getByRole('button', { name: /edit/i })
			.first();
		await editButton.click();

		// Wait for dialog and change status
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('dialog').getByLabel('Status').selectOption('Not Enrolled');
		await page.getByRole('dialog').getByRole('button', { name: 'Update' }).click();

		// Wait for dialog to close
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Verify status changed
		await page.getByLabel('Search by name or student ID').fill(englishName);
		await page.waitForTimeout(300);
		await expect(page.getByText('Not Enrolled').first()).toBeVisible();
	});
});
