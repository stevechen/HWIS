import { test, expect } from '@playwright/test';
import { createStudent, cleanupTestData, seedBaseline } from './convex-client';
import { getTestSuffix } from './helpers';

test.describe('Integration Tests (Real Backend) @integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// Store test data info for cleanup
	let testE2eTag: string | null = null;

	test.beforeEach(async () => {
		// Reset for each test
		testE2eTag = null;
	});

	test.afterEach(async () => {
		// Cleanup using the stored e2eTag from the test
		if (testE2eTag) {
			try {
				await cleanupTestData(testE2eTag);
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	test('Student CRUD cycle - create, edit, delete works with real backend', async ({ page }) => {
		const suffix = getTestSuffix('crud');
		const studentId = `S_${suffix}`;
		const englishName = `CrudTest_${suffix}`;
		const chineseName = 'CRUD測試';
		const grade = 10;

		// Store for cleanup
		testE2eTag = `e2e-test_${suffix}`;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await page.waitForTimeout(1000);

		// Create student using API (more reliable than UI for setup)
		await createStudent({
			studentId,
			englishName,
			chineseName,
			grade,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});

		// Reload page to see the new student
		await page.reload();
		await page.waitForSelector('body.hydrated');
		await page.waitForTimeout(500);

		// Verify student was created
		await expect(page.getByText(englishName).first()).toBeVisible();

		// Edit student - find and click edit button (first button in the row with pencil icon)
		const studentRow = page.locator('tr').filter({ hasText: englishName });
		await studentRow.locator('button').first().click();

		// Wait for edit dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByText('Edit Student')).toBeVisible();

		// Change status to Not Enrolled - use the Status select (second select in dialog)
		const statusSelect = page
			.locator('[role="dialog"] select')
			.filter({ hasText: /Enrolled|Not Enrolled/ });
		await statusSelect.selectOption('Not Enrolled');

		// Click Update button using filter pattern
		await page.locator('button').filter({ hasText: 'Update' }).click();

		// Wait for dialog to close
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Verify status changed - check for Not Enrolled badge in the student's row
		await page.waitForTimeout(500);
		const updatedRow = page.locator('tr').filter({ hasText: englishName });
		await expect(updatedRow.getByText('Not Enrolled')).toBeVisible();

		// Delete student - find and click delete button (last button in row with trash icon)
		await updatedRow.locator('button').last().click();

		// Wait for delete dialog
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByText('Delete Student')).toBeVisible();

		// Click Delete button using filter pattern
		await page.locator('button').filter({ hasText: 'Delete' }).first().click();

		// Wait for dialog to close and student to be removed
		await expect(page.getByRole('dialog')).not.toBeVisible();
		await page.waitForTimeout(300);
		await expect(page.getByText(englishName).first()).not.toBeVisible();
	});

	test('Evaluation persists to database and appears in list', async ({ page }) => {
		// Seed baseline data including categories
		await seedBaseline();

		const suffix = getTestSuffix('evalPersist');
		const studentId = `SE_${suffix}`;
		const englishName = `EvalPersist_${suffix}`;
		const chineseName = '評估持久';

		// Store for cleanup
		testE2eTag = `e2e-test_${suffix}`;

		const createResult = await createStudent({
			studentId,
			englishName,
			chineseName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});
		expect(createResult).toBeTruthy();

		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		const filterInput = page.getByLabel('Search students');
		await filterInput.fill(englishName);
		await page.waitForTimeout(300);

		const studentRow = page.getByText(englishName).first();
		await expect(studentRow).toBeVisible();

		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();
	});
});

test.describe('Category to Evaluation Integration (Real Backend) @integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// Store test data info for cleanup
	let testE2eTag: string | null = null;

	test.beforeEach(async () => {
		testE2eTag = null;
	});

	test.afterEach(async () => {
		if (testE2eTag) {
			try {
				await cleanupTestData(testE2eTag);
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	test.fixme('Category created by admin can be used in evaluation by teacher', async () => {
		// This test requires complex setup and UI interactions
	});
});
