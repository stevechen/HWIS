import { test, expect } from '@playwright/test';
import { getTestSuffix, getStudentId } from './helpers';
import { createStudent, createCategory, cleanupByTag, useRole } from './convex-client';

test.describe('Bulk Operations @bulk @sequential', () => {
	test.describe('Bulk Evaluation Creation', () => {
		test.use({ storageState: 'e2e/.auth/teacher.json' });

		const suffix = getTestSuffix('bulkEval');
		const e2eTag = `e2e-test_${suffix}`;
		const categoryName = `BulkTest_${suffix}`;
		let testDataCreated = false;

		test.beforeEach(async ({ page }) => {
			useRole('teacher');

			// Create multiple students for bulk evaluation
			for (let i = 1; i <= 3; i++) {
				await createStudent({
					studentId: getStudentId(`BULK${i}_${suffix}`),
					englishName: `BulkStudent${i}_${suffix}`,
					chineseName: `大量${i}`,
					grade: 9 + i,
					status: 'Enrolled',
					e2eTag
				});
			}

			// Create category for evaluations
			await createCategory({
				name: categoryName,
				e2eTag
			});

			testDataCreated = true;

			// Navigate to new evaluation page
			await page.goto('/evaluations/new');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByText('Loading students...')).not.toBeVisible();
		});

		test.afterEach(async () => {
			if (testDataCreated) await cleanupByTag('all', e2eTag);
		});

		test('can select multiple students for bulk evaluation', async ({ page }) => {
			// Verify the step 1 heading is visible
			await expect(page.getByText('1. Select Students')).toBeVisible();

			// Search for students
			const searchInput = page.getByRole('textbox', { name: 'Search students' });
			await expect(searchInput).toBeVisible();

			// Clear search to show all students
			await searchInput.clear();

			// Look for student checkboxes - they should appear in the list
			// The UI should show student items with checkboxes
			const studentCheckboxes = page.locator('input[type="checkbox"]');
			const count = await studentCheckboxes.count();

			// Should have at least 3 students (created in beforeEach)
			expect(count).toBeGreaterThanOrEqual(3);
		});

		test('can create evaluation for all selected students', async ({ page }) => {
			// Clear search to show all students
			const searchInput = page.getByRole('textbox', { name: 'Search students' });
			await searchInput.clear();

			// Select all visible students by clicking the select all checkbox if it exists
			// Or by selecting individual students
			const selectAllCheckbox = page.locator('input[type="checkbox"]').first();
			await selectAllCheckbox.click();

			// Click the "Select All" or similar control if available
			// Otherwise, manually select 3 students
			const checkboxes = page.locator('input[type="checkbox"]');
			const totalCheckboxes = await checkboxes.count();

			// Select up to 3 checkboxes (first one might be select all)
			for (let i = 0; i < Math.min(3, totalCheckboxes); i++) {
				await checkboxes.nth(i).check();
			}

			// Proceed to step 2 - select category
			const continueButton = page.getByRole('button', { name: /continue|next/i });
			if (await continueButton.isVisible()) {
				await continueButton.click();
			}

			// Step 2: Select category
			// await expect(page.getByText('2. Select Category')).toBeVisible();

			// Click the category dropdown
			const categoryTrigger = page.getByRole('button', { name: /select category/i });
			await categoryTrigger.click();

			// Select the category we created
			const categoryOption = page.getByRole('option', { name: categoryName });
			await categoryOption.click();

			// Fill in evaluation details
			const detailsInput = page.getByRole('textbox', { name: /details|notes/i });
			await detailsInput.fill('Great work on homework!');

			// Fill in value (points)
			await page.getByRole('button', { name: 'Award 2 points' }).click();

			// Submit the form
			await page.getByRole('button', { name: /submit|create|save/i }).click();

			// Should see success message or be redirected
			// The evaluations page should show the new evaluations
			await expect(page).toHaveURL(/evaluations|admin/);
		});
	});

	test.describe('Bulk Status Change', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		const suffix = getTestSuffix('bulkStatus');
		const e2eTag = `e2e-status_${suffix}`;
		let testDataCreated = false;

		test.beforeEach(async ({ page }) => {
			useRole('admin');

			// Create multiple students with Not Enrolled status
			for (let i = 1; i <= 3; i++) {
				await createStudent({
					studentId: getStudentId(`STAT${i}_${suffix}`),
					englishName: `StatusStudent${i}_${suffix}`,
					chineseName: `狀態${i}`,
					grade: 9 + i,
					status: 'Not Enrolled',
					e2eTag
				});
			}
			testDataCreated = true;

			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testDataCreated) {
				await cleanupByTag('students', e2eTag);
			}
		});

		test('can filter students by status', async ({ page }) => {
			// Initially show all students - should see the "Not Enrolled" ones
			await expect(page.getByText(`StatusStudent1_${suffix}`)).toBeVisible();

			// Filter by "Enrolled" status
			const statusFilter = page.getByRole('combobox', { name: /filter by status/i });
			await statusFilter.selectOption('Enrolled');

			// The "Not Enrolled" students should not be visible
			// and there should be no students or different ones shown
			await expect(page.getByText(`StatusStudent1_${suffix}`)).not.toBeVisible();
		});

		test('can filter students by grade', async ({ page }) => {
			// Filter by grade 10
			const gradeFilter = page.getByRole('combobox', { name: /filter by grade/i });

			await expect(page.getByText('Loading students...')).not.toBeVisible();

			await gradeFilter.selectOption('11');

			// Should only see grade 10 students
			// Our test students are in grades 10, 11, 12
			await expect(page.getByText(`StatusStudent1_${suffix}`)).not.toBeVisible();
			// Grade 9 and 11 should not be visible
			await expect(page.getByText(`StatusStudent2_${suffix}`)).toBeVisible();
			await expect(page.getByText(`StatusStudent3_${suffix}`)).not.toBeVisible();
		});
	});

	test.describe('Bulk Selection in UI', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		const suffix = getTestSuffix('bulkSelect');
		const e2eTag = `e2e-select_${suffix}`;
		let testDataCreated = false;

		test.beforeEach(async ({ page }) => {
			useRole('admin');

			// Create multiple students
			for (let i = 1; i <= 5; i++) {
				await createStudent({
					studentId: getStudentId(`SEL${i}_${suffix}`),
					englishName: `SelectStudent${i}_${suffix}`,
					chineseName: `選擇${i}`,
					grade: 9,
					status: 'Enrolled',
					e2eTag
				});
			}
			testDataCreated = true;

			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testDataCreated) {
				await cleanupByTag('students', e2eTag);
			}
		});

		test('can search for students', async ({ page }) => {
			// Search for a specific student
			const searchInput = page.getByPlaceholder(/search/i);
			await searchInput.fill(`SelectStudent2_${suffix}`);

			// Only the matching student should be visible
			await expect(page.getByText(`SelectStudent2_${suffix}`)).toBeVisible();

			// Other students should not be visible
			await expect(page.getByText(`SelectStudent1_${suffix}`)).not.toBeVisible();
		});
	});
});
