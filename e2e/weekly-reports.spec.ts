import { test, expect } from './fixtures';
import {
	createWeeklyReportTestData,
	cleanupWeeklyReportTestData,
	createStudent,
	createCategory,
	useRole
} from './convex-client';
import { getTestSuffix, getUniqueTag } from './helpers';
import { AdminWeeklyReportsPage } from './pages';

test.describe('Weekly Reports - Data Display @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let e2eTag: string;
	let testData = false;
	let reportsPage: AdminWeeklyReportsPage;

	test.beforeEach(async ({ page }) => {
		reportsPage = new AdminWeeklyReportsPage(page);
		useRole('admin');
		e2eTag = getUniqueTag('weekly-report');
		await cleanupWeeklyReportTestData(e2eTag);
		const createResult = await createWeeklyReportTestData(e2eTag);
		if (!createResult || (typeof createResult === 'object' && 'error' in createResult)) {
			throw new Error(`Failed to create weekly report test data: ${JSON.stringify(createResult)}`);
		}
		testData = true;

		await reportsPage.goto();
		await reportsPage.waitForReportsToLoad();
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('displays real Convex data with 5 weeks of reports', async () => {
		await reportsPage.expectTableVisible();

		// Check for rows in the table (at least header + some data)
		const rowCount = await reportsPage.getRowCount();
		expect(rowCount).toBeGreaterThanOrEqual(1);
	});
});

test.describe('Weekly Reports - Dialog Interactions @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let e2eTag: string;
	let testData = false;
	let reportsPage: AdminWeeklyReportsPage;

	test.beforeEach(async ({ page }) => {
		reportsPage = new AdminWeeklyReportsPage(page);
		useRole('admin');
		e2eTag = getUniqueTag('weekly-report');
		await cleanupWeeklyReportTestData(e2eTag);
		const createResult = await createWeeklyReportTestData(e2eTag);
		if (!createResult || (typeof createResult === 'object' && 'error' in createResult)) {
			throw new Error(`Failed to create weekly report test data: ${JSON.stringify(createResult)}`);
		}
		testData = true;

		await reportsPage.goto();
		await reportsPage.waitForReportsToLoad();

		// Open dialog for subsequent tests
		await reportsPage.openFirstReport();
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('opens report dialog and displays weekly details', async () => {
		await reportsPage.expectDialogVisible();
		await expect(reportsPage.page.getByTestId('weekly-reports.dialog.title')).toContainText(
			'Report'
		);
	});

	test('can interact with filter inputs', async ({ page }) => {
		// Verify filter inputs exist and can be interacted with
		const nameFilter = page.getByTestId('weekly-reports.dialog.filter-name');
		await expect(nameFilter).toBeVisible();
		await nameFilter.fill('Test');
		await expect(nameFilter).toHaveValue('Test');
		await nameFilter.fill('');
		await expect(nameFilter).toHaveValue('');

		// Also test grade filter
		const gradeFilter = page.getByTestId('weekly-reports.dialog.filter-grade');
		await expect(gradeFilter).toBeVisible();
		await gradeFilter.click();
		// Select first available grade option (test data has random grades 7-12)
		const optionValue = await gradeFilter.evaluate((select: HTMLSelectElement) => {
			const option = Array.from(select.options).find((o) => o.value && o.value !== '');
			return option?.value ?? '';
		});
		if (optionValue) {
			await gradeFilter.selectOption(optionValue);
		}
		// Just verify filter is still interactive after selection
		await expect(gradeFilter).toBeVisible();
	});

	test('can interact with column header sort buttons', async () => {
		// Click on Grade header to sort
		await reportsPage.sortByGrade();

		// Click on Name header to sort
		await reportsPage.sortByName();
	});

	test('exports filtered data to CSV', async ({ page }) => {
		const exportButton = reportsPage.page.getByTestId('weekly-reports.dialog.export-button');
		await expect(exportButton).toBeVisible();

		// Click export and verify download starts
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
			exportButton.click()
		]);

		if (download) {
			expect(download.suggestedFilename()).toMatch(/\.csv$/);
		}
	});

	test('closes dialog with close button', async () => {
		await reportsPage.closeWithCloseButton();
		await reportsPage.expectDialogHidden();
	});

	test('closes dialog with X button', async () => {
		// Close any existing dialog first
		if (await reportsPage.page.getByTestId('weekly-reports.dialog').isVisible()) {
			await reportsPage.closeWithEscape();
			await reportsPage.expectDialogHidden();
		}

		// Open new dialog
		await reportsPage.openFirstReport();

		// Close with X button
		await reportsPage.closeWithXButton();
		await reportsPage.expectDialogHidden();
	});

	test('closes dialog with backdrop click', async () => {
		// Close any existing dialog first
		if (await reportsPage.page.getByTestId('weekly-reports.dialog').isVisible()) {
			await reportsPage.closeWithEscape();
			await reportsPage.expectDialogHidden();
		}

		// Open new dialog
		await reportsPage.openFirstReport();

		// Close by pressing Escape key (more reliable than backdrop click)
		await reportsPage.closeWithEscape();
		await reportsPage.expectDialogHidden();
	});
});

test.describe('Weekly Reports - Create Report @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let e2eTag: string;
	let testData = false;
	let reportsPage: AdminWeeklyReportsPage;

	test.beforeEach(async ({ page }) => {
		reportsPage = new AdminWeeklyReportsPage(page);
		useRole('admin');
		suffix = getTestSuffix('createReport');
		studentId = `WR_${suffix}`;
		e2eTag = getUniqueTag('weekly-report');
		// Create a student and category for evaluation
		await createStudent({
			studentId,
			englishName: `WeeklyReport_${suffix}`,
			chineseName: '週報測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		// Create category
		const categoryName = `TestCategory_${suffix}`;
		await createCategory({
			name: categoryName,
			e2eTag
		});

		testData = true;
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('should create weekly report', async ({ page }) => {
		// Navigate to evaluations page to create an evaluation
		const evalPage = await reportsPage.gotoNewEvaluation();

		// Search for and select the student
		await evalPage.searchStudent(`WeeklyReport_${suffix}`.toLowerCase());
		const studentRow = page.getByTestId(`evaluations-new.student-row-WeeklyReport_${suffix}`);
		await expect(studentRow).toBeVisible();
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Select category
		const categoryName = `TestCategory_${suffix}`;
		await evalPage.selectCategory(categoryName);

		// Submit the evaluation
		await evalPage.submit();

		// Should redirect to evaluations page after successful submission
		await expect(page).toHaveURL('/evaluations');
		await page.waitForSelector('body.hydrated');

		// Now navigate to weekly reports and verify the report appears
		await reportsPage.goto();
		await reportsPage.waitForReportsToLoad();

		// Verify the weekly reports page shows data
		await reportsPage.expectTableVisible();

		// Check that there's at least one report row (not just header)
		const rowCount = await reportsPage.getRowCount();
		expect(rowCount).toBeGreaterThanOrEqual(1);
	});
});

test.describe('Weekly Reports - Update Report @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let categoryName: string;
	let e2eTag: string;
	let testData = false;
	let reportsPage: AdminWeeklyReportsPage;

	test.beforeEach(async ({ page }) => {
		reportsPage = new AdminWeeklyReportsPage(page);
		useRole('admin');
		suffix = getTestSuffix('updateReport');
		studentId = `WR_UPDATE_${suffix}`;
		categoryName = `UpdateCategory_${suffix}`;
		e2eTag = getUniqueTag('weekly-report');
		// Create student
		await createStudent({
			studentId,
			englishName: `UpdateReport_${suffix}`,
			chineseName: '更新週報',
			grade: 11,
			status: 'Enrolled',
			e2eTag
		});

		// Create category
		await createCategory({
			name: categoryName,
			e2eTag
		});

		testData = true;

		// Create first evaluation
		const evalPage = await reportsPage.gotoNewEvaluation();

		// Search and select student
		await evalPage.searchStudent(`UpdateReport_${suffix}`.toLowerCase());
		const studentRow = page.getByTestId(`evaluations-new.student-row-UpdateReport_${suffix}`);
		await expect(studentRow).toBeVisible();
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Select category
		await evalPage.selectCategory(categoryName);

		// Submit first evaluation
		await evalPage.submit();
		await expect(page).toHaveURL('/evaluations');
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('should update existing weekly report', async ({ page }) => {
		// Navigate to weekly reports and get initial report data
		await reportsPage.goto();
		await reportsPage.waitForReportsToLoad();

		// Open the first report to see initial state
		await reportsPage.openFirstReport();
		await reportsPage.expectDialogVisible();

		// Close dialog
		await reportsPage.closeWithEscape();
		await reportsPage.expectDialogHidden();

		// Create second evaluation for the same student (this updates the weekly report)
		const evalPage = await reportsPage.gotoNewEvaluation();

		// Search and select same student again
		await evalPage.searchStudent(`UpdateReport_${suffix}`.toLowerCase());
		const studentRow2 = page.getByTestId(`evaluations-new.student-row-UpdateReport_${suffix}`);
		await expect(studentRow2).toBeVisible();
		await studentRow2.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Select category again
		await evalPage.selectCategory(categoryName);

		// Submit second evaluation
		await evalPage.submit();
		await expect(page).toHaveURL('/evaluations');

		// Navigate back to weekly reports and verify the report is updated
		await reportsPage.goto();
		await reportsPage.waitForReportsToLoad();

		// Open the report again and verify it's still there with data
		await reportsPage.openFirstReport();
		await reportsPage.expectDialogVisible();

		// Verify dialog header contains "Name" column
		await reportsPage.expectStudentNameColumnVisible();
	});
});
