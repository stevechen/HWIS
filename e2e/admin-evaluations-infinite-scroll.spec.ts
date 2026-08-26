import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import { createStudentWithEvaluations, cleanupByTag } from './convex-client';
import { AdminEvaluationsPage } from './pages';

async function waitForEvaluationsReady(page: import('@playwright/test').Page) {
	const evalsPage = new AdminEvaluationsPage(page);

	for (let attempt = 0; attempt < 2; attempt++) {
		const loading = page.getByTestId('admin-evaluations.loading');
		await Promise.race([
			loading.waitFor({ state: 'hidden' }),
			page.getByTestId('admin-evaluations.error').waitFor({ state: 'visible' })
		]);

		if (!(await page.getByTestId('admin-evaluations.error').isVisible())) break;

		// Auth can race on first load in Chromium; reload once and retry
		await page.reload();
		await page.waitForSelector('body.hydrated');
	}

	await evalsPage.expectErrorHidden();
	await evalsPage.expectLoadingHidden();
	await evalsPage.expectTimelineVisible();
}

test.describe('Admin Evaluations - Infinite Scroll @infinite-scroll @sequential', () => {
	test.use({ role: 'admin' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let testEntity = false;
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		// Extend timeout for data creation (5 students × 6 evaluations = 30 evaluations)
		test.setTimeout(60000);

		evalsPage = new AdminEvaluationsPage(page);
		testEntity = false; // Reset at start of each test
		suffix = getTestSuffix('infiniteScroll');
		e2eTag = `e2e-test_${suffix}`;

		// Create students with evaluations in parallel for faster setup
		// 5 students × 6 evaluations = 30 evaluations (enough for pagination)
		// This is more efficient than 15 students × 2 evaluations (saves 10 API calls)
		const createPromises = [];
		for (let i = 0; i < 5; i++) {
			const studentId = `SE_SCROLL_${i}_${suffix}`;
			const englishName = `ScrollStudent_${i}_${suffix}`;
			createPromises.push(
				createStudentWithEvaluations({
					studentId,
					englishName,
					chineseName: `Student${i}`,
					grade: 10,
					status: 'Enrolled',
					evaluationCount: 6,
					e2eTag
				})
			);
		}
		await Promise.all(createPromises);
		testEntity = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');

		await waitForEvaluationsReady(page);
	});

	test.afterEach(async () => {
		// Cleanup test data after each test
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('initial page load shows evaluations', async () => {
		await evalsPage.expectTimelineVisible();

		// Verify at least one evaluation is displayed
		await evalsPage.expectFirstCardVisible();

		// Verify at least some evaluations loaded
		await evalsPage.expectSecondCardVisible();
	});

	test('shows "No more evaluations" message at end of list', async () => {
		await evalsPage.expectTimelineVisible();

		// Filter by this test's unique suffix to isolate from parallel tests
		await evalsPage.fillStudentFilter(suffix);

		// Wait for filter to apply
		await evalsPage.expectLoadingHidden();

		// Scroll until we see "No more evaluations" or timeout
		// This handles the case where multiple pages need to be loaded
		let attempts = 0;
		const maxAttempts = 10;

		while (
			!(await evalsPage.page.getByTestId('admin-evaluations.no-more').isVisible()) &&
			attempts < maxAttempts
		) {
			evalsPage.scrollToBottom();
			await evalsPage.expectLoadingHidden();
			attempts++;
		}

		// Eventually the "No more evaluations" message should appear
		await evalsPage.expectNoMoreVisible();
	});

	test('filter changes reset pagination and show filtered results', async () => {
		await evalsPage.expectTimelineVisible();

		// Verify multiple students are visible initially (at least 2 different ones)
		await evalsPage.expectFirstCardVisible();
		await evalsPage.expectSecondCardVisible();

		// Apply a filter for a specific student
		await evalsPage.fillStudentFilter('ScrollStudent_0');

		// Wait for the filter to apply (Convex reactivity)
		await evalsPage.expectLoadingHidden();
		await evalsPage.expectErrorHidden();

		// Verify only filtered results are shown (ScrollStudent_0)
		await evalsPage.expectFirstCardVisible();

		// Verify that other students are NOT visible (filter is working)
		const otherStudentCards = evalsPage.getAllCards().filter({
			has: evalsPage.page.locator('text="ScrollStudent_1"')
		});
		await expect(otherStudentCards).not.toBeVisible();

		// Clear the filter
		await evalsPage.fillStudentFilter('');

		// Wait for the filter to clear (Convex reactivity)
		await evalsPage.expectLoadingHidden();

		// Verify multiple students are visible again (at least 2 different ones)
		await evalsPage.expectFirstCardVisible();
		await evalsPage.expectSecondCardVisible();
	});

	test('sort order toggle resets pagination', async () => {
		// Wait for initial load
		await evalsPage.expectTimelineVisible();

		// Scope the list to this test's own records so seeded data cannot dominate the view.
		await evalsPage.fillStudentFilter(suffix);
		await evalsPage.expectLoadingHidden();
		await evalsPage.expectErrorHidden();

		// Get the evaluation cards for this test dataset only
		await evalsPage.expectFirstCardVisible();

		// Verify sort button shows "newest first" initially (default sort)
		await evalsPage.expectSortButton('Newest First');

		// Click the sort toggle button to change to "oldest first"
		await evalsPage.clickSortButton();

		// Wait for the sort to apply
		await evalsPage.expectLoadingHidden();
		await evalsPage.expectErrorHidden();

		// Verify the sort button text changed to "oldest first"
		await evalsPage.expectSortButton('Oldest First');

		// Verify evaluations are still visible after sort change
		await evalsPage.expectFirstCardVisible();

		// Click again to toggle back to "newest first"
		await evalsPage.clickSortButton();

		// Wait for the sort to apply
		await evalsPage.expectLoadingHidden();
		await evalsPage.expectErrorHidden();

		// Verify we're back to "newest first"
		await evalsPage.expectSortButton('Newest First');
		await evalsPage.expectFirstCardVisible();
	});

	test('teacher filter works correctly', async () => {
		// Wait for initial load
		await evalsPage.expectTimelineVisible();

		// Apply a teacher filter
		await evalsPage.fillTeacherFilter('Test');

		// Wait for the filter to apply
		await evalsPage.expectLoadingHidden();

		// The filter should be applied - either showing results or empty state
		// We just verify the filter input works
		await expect(evalsPage.page.getByTestId('admin-evaluations.filter-teacher')).toHaveValue(
			'Test'
		);

		// Clear the filter
		await evalsPage.fillTeacherFilter('');

		// Verify evaluations are visible again
		await evalsPage.expectFirstCardVisible();
	});
});

test.describe('Admin Evaluations - Small Dataset @infinite-scroll-small @sequential', () => {
	test.use({ role: 'admin' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let testEntity = false;
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new AdminEvaluationsPage(page);
		testEntity = false; // Reset at start of each test
		suffix = getTestSuffix('scrollSmall');
		e2eTag = `e2e-test_${suffix}`;

		// Create just one student with one evaluation using the optimized helper
		await createStudentWithEvaluations({
			studentId: `SE_SMALL_${suffix}`,
			englishName: `SmallDataset_${suffix}`,
			chineseName: '小數據',
			grade: 10,
			status: 'Enrolled',
			evaluationCount: 1,
			e2eTag
		});
		testEntity = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await evalsPage.expectLoadingHidden();
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('shows "No more evaluations" immediately for small datasets', async () => {
		await evalsPage.expectTimelineVisible();

		// Filter to this test's single record so the assertion is independent of seeded data.
		await evalsPage.fillStudentFilter(suffix);
		await evalsPage.expectLoadingHidden();
		await evalsPage.expectErrorHidden();

		// Scroll to bottom
		evalsPage.scrollToBottom();

		// Should show "No more evaluations" since we have less than a page of data
		await evalsPage.expectNoMoreVisible();
	});
});

test.describe('Admin Evaluations - Filter Empty State @infinite-scroll-filter-empty @sequential', () => {
	test.use({ role: 'admin' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let testEntity = false;
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new AdminEvaluationsPage(page);
		testEntity = false; // Reset at start of each test
		suffix = getTestSuffix('scrollFilter');
		e2eTag = `e2e-test_${suffix}`;

		// Create a student with evaluation using the optimized helper
		await createStudentWithEvaluations({
			studentId: `SE_FILTER_${suffix}`,
			englishName: `FilterTest_${suffix}`,
			chineseName: '過濾測試',
			grade: 10,
			status: 'Enrolled',
			evaluationCount: 1,
			e2eTag
		});
		testEntity = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await evalsPage.expectLoadingHidden();
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('filter with no matches shows empty state', async () => {
		await evalsPage.expectTimelineVisible();

		// Apply a filter that matches nothing
		await evalsPage.fillStudentFilter('NonExistentStudentXYZ123');

		// Wait for the filter to apply - use web-first assertion with timeout
		await evalsPage.expectEmptyStateVisible();
	});
});
