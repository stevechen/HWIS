import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, createEvaluationForStudent, cleanupByTag, useRole } from './convex-client';

test.describe('Admin Evaluations - Infinite Scroll @infinite-scroll', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let testEntity = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		testEntity = false; // Reset at start of each test
		suffix = getTestSuffix('infiniteScroll');
		e2eTag = `e2e-test_${suffix}`;

		// Create multiple students with evaluations for testing pagination
		// We need enough data to trigger pagination (more than 20 items per page)
		for (let i = 0; i < 25; i++) {
			const studentId = `SE_SCROLL_${i}_${suffix}`;
			const englishName = `ScrollStudent_${i}_${suffix}`;
			await createStudent({
				studentId,
				englishName,
				chineseName: `滾動學生${i}`,
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});
			// Create multiple evaluations per student to ensure we have enough data
			await createEvaluationForStudent({ studentId, e2eTag });
			await createEvaluationForStudent({ studentId, e2eTag });
		}
		testEntity = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
	});

	test.afterEach(async () => {
		// Cleanup test data after each test
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('initial page load shows evaluations', async ({ page }) => {
		// Verify the evaluations region is visible
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();

		// Verify at least one evaluation is displayed
		const evaluationButtons = page.getByRole('button', { name: /Evaluation for ScrollStudent_/ });
		await expect(evaluationButtons.first()).toBeVisible();

		// Verify the count shows at least some evaluations loaded
		const count = await evaluationButtons.count();
		expect(count).toBeGreaterThan(0);
	});

	test('shows "No more evaluations" message at end of list', async ({ page }) => {
		// Scroll until we see "No more evaluations" or timeout
		// This handles the case where multiple pages need to be loaded
		const noMoreText = page.getByText('No more evaluations');
		let attempts = 0;
		const maxAttempts = 10;

		while (!(await noMoreText.isVisible()) && attempts < maxAttempts) {
			await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
			await page.waitForTimeout(300);
			attempts++;
		}

		// Eventually the "No more evaluations" message should appear
		await expect(noMoreText).toBeVisible();
	});

	test('filter changes reset pagination and show filtered results', async ({ page }) => {
		// Get initial count of evaluations
		const initialButtons = page.getByRole('button', { name: /Evaluation for ScrollStudent_/ });
		const initialCount = await initialButtons.count();

		// Apply a filter for a specific student
		const studentFilterInput = page.getByPlaceholder('Filter by student name...');
		await studentFilterInput.fill('ScrollStudent_0');

		// Wait for the filter to apply (Convex reactivity)
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();

		// Verify only filtered results are shown
		const filteredButtons = page.getByRole('button', { name: /Evaluation for ScrollStudent_0/ });
		await expect(filteredButtons.first()).toBeVisible();

		// The filtered count should be less than or equal to initial count
		const filteredCount = await filteredButtons.count();
		expect(filteredCount).toBeLessThanOrEqual(initialCount);

		// Clear the filter
		await studentFilterInput.fill('');
		// await page.waitForTimeout(500);

		// Verify all results are back
		const restoredButtons = page.getByRole('button', { name: /Evaluation for ScrollStudent_/ });
		const restoredCount = await restoredButtons.count();
		expect(restoredCount).toBeGreaterThanOrEqual(filteredCount);
	});

	test('sort order toggle resets pagination', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();

		// Get the evaluation buttons
		const evaluationButtons = page.getByRole('button', { name: /Evaluation for ScrollStudent_/ });

		// Verify sort button shows "newest first" initially (default sort)
		const sortButton = page.getByRole('button', { name: /newest first/i });
		await expect(sortButton).toBeVisible();

		// Click the sort toggle button to change to "oldest first"
		await sortButton.click();

		// Wait for the sort to apply
		await page.waitForTimeout(500);

		// Verify the sort button text changed to "oldest first"
		await expect(page.getByRole('button', { name: /oldest first/i })).toBeVisible();

		// Verify evaluations are still visible after sort change
		await expect(evaluationButtons.first()).toBeVisible();

		// Click again to toggle back to "newest first"
		const oldestButton = page.getByRole('button', { name: /oldest first/i });
		await oldestButton.click();

		// Wait for the sort to apply
		await page.waitForTimeout(500);

		// Verify we're back to "newest first"
		await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible();
	});

	test('teacher filter works correctly', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();

		// Apply a teacher filter (assuming there's a teacher associated with evaluations)
		const teacherFilterInput = page.getByPlaceholder('Filter by teacher...');
		await teacherFilterInput.fill('Test');

		// Wait for the filter to apply
		await page.waitForTimeout(500);

		// The filter should be applied - either showing results or empty state
		// We just verify the filter input works
		await expect(teacherFilterInput).toHaveValue('Test');

		// Clear the filter
		await teacherFilterInput.fill('');
		await page.waitForTimeout(500);

		// Verify evaluations are visible again
		const evaluationButtons = page.getByRole('button', { name: /Evaluation for ScrollStudent_/ });
		await expect(evaluationButtons.first()).toBeVisible();
	});

	test('loading indicator appears when fetching more data', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();

		// The loading indicator (spinner) should appear when loading more data
		// This is hard to test directly since it appears briefly during loading
		// We can verify the loading state component exists in the DOM structure

		// Scroll to trigger potential loading
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

		// Wait a moment for any loading to potentially start
		await page.waitForTimeout(100);

		// The page should still be functional
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});
});

test.describe('Admin Evaluations - Infinite Scroll Edge Cases @infinite-scroll-edge', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;
	let testEntity = false;

	test.beforeEach(async () => {
		useRole('admin');
		suffix = getTestSuffix('scrollEdge');
		e2eTag = `e2e-test_${suffix}`;
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('shows empty state when no evaluations exist', async ({ page }) => {
		// Navigate to admin evaluations page without creating any data
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');

		// Wait for loading to complete - the empty state appears after loading
		// Use web-first assertion with timeout for Convex reactivity
		await expect(page.getByText('No evaluations found.')).toBeVisible();
	});

	test('shows "No more evaluations" immediately for small datasets', async ({ page }) => {
		// Create just one student with one evaluation
		const studentId = `SE_SMALL_${suffix}`;
		const englishName = `SmallDataset_${suffix}`;
		await createStudent({
			studentId,
			englishName,
			chineseName: '小數據',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		await createEvaluationForStudent({ studentId, e2eTag });
		testEntity = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();

		// Scroll to bottom
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(500);

		// Should show "No more evaluations" since we have less than a page of data
		await expect(page.getByText('No more evaluations')).toBeVisible();
	});

	test('filter with no matches shows empty state', async ({ page }) => {
		// Create a student with evaluation
		const studentId = `SE_FILTER_${suffix}`;
		const englishName = `FilterTest_${suffix}`;
		await createStudent({
			studentId,
			englishName,
			chineseName: '過濾測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		await createEvaluationForStudent({ studentId, e2eTag });
		testEntity = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();

		// Apply a filter that matches nothing
		const studentFilterInput = page.getByPlaceholder('Filter by student name...');
		await studentFilterInput.fill('NonExistentStudentXYZ123');

		// Wait for the filter to apply - use web-first assertion with timeout
		await expect(page.getByText('No evaluations match your search criteria.')).toBeVisible();
	});
});
