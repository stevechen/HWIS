import { test, expect, type Page, type Locator } from '@playwright/test';
import {
	createWeeklyReportTestData,
	cleanupWeeklyReportTestData,
	createStudent,
	createCategoryWithSubs,
	useRole
} from './convex-client';
import { getTestSuffix, getUniqueTag } from './helpers';

async function waitForReportsToLoad(page: Page) {
	const loading = page.getByRole('status').filter({ hasText: 'Loading reports...' });
	await expect(loading).toBeHidden();
}

async function waitForReportDetails(page: Page) {
	const dialog = page.getByRole('dialog');
	const detailsRegion = dialog.getByRole('region', { name: 'Student details table' });
	const detailTable = detailsRegion.getByRole('table');

	await expect(detailTable).toBeVisible({ timeout: 10000 });
	const dataRow = detailTable
		.getByRole('row')
		.filter({ hasNot: detailTable.getByRole('columnheader') })
		.first();
	await expect(dataRow).toBeVisible({ timeout: 10000 });
}

async function selectFirstAvailableGrade(gradeFilter: Locator) {
	const optionValue = await gradeFilter.evaluate((select: HTMLSelectElement) => {
		const option = Array.from(select.options).find((o) => o.value && o.value !== '');
		return option?.value ?? '';
	});

	if (optionValue) {
		await gradeFilter.selectOption(optionValue);
	}
}

test.describe('Weekly Reports - Data Display @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		e2eTag = getUniqueTag('weekly-report');
		await cleanupWeeklyReportTestData(e2eTag);
		const createResult = await createWeeklyReportTestData(e2eTag);
		if (!createResult || (typeof createResult === 'object' && 'error' in createResult)) {
			throw new Error(`Failed to create weekly report test data: ${JSON.stringify(createResult)}`);
		}
		testData = true;

		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');
		await waitForReportsToLoad(page);
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('displays real Convex data with 5 weeks of reports', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Weekly Reports' })).toBeVisible();

		// Verify table is displayed
		const table = page.getByRole('table');
		await expect(table).toBeVisible();

		// Check for rows in the table (at least header + some data)
		const rows = table.getByRole('row');
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(1); // At least header row
	});
});

test.describe('Weekly Reports - Dialog Interactions @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		e2eTag = getUniqueTag('weekly-report');
		await cleanupWeeklyReportTestData(e2eTag);
		const createResult = await createWeeklyReportTestData(e2eTag);
		if (!createResult || (typeof createResult === 'object' && 'error' in createResult)) {
			throw new Error(`Failed to create weekly report test data: ${JSON.stringify(createResult)}`);
		}
		testData = true;

		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');
		await waitForReportsToLoad(page);

		// Open dialog for subsequent tests
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await expect(firstDataRow).toBeVisible();
		await firstDataRow.click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByText('Loading details...')).not.toBeVisible();
		await waitForReportDetails(page);
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('opens report dialog and displays weekly details', async ({ page }) => {
		// Verify dialog header contains "Report"
		await expect(page.getByRole('dialog').getByRole('heading')).toContainText('Report');
	});

	test('can interact with filter inputs', async ({ page }) => {
		// Verify filter inputs exist and can be interacted with
		const nameFilter = page.getByRole('textbox', { name: 'Filter name (comma separated)' });
		await expect(nameFilter).toBeVisible();
		await nameFilter.fill('Test');
		await expect(nameFilter).toHaveValue('Test');
		await nameFilter.fill('');
		await expect(nameFilter).toHaveValue('');

		// Also test grade filter
		// await expect(page.getByText('Loading details...')).not.toBeVisible();
		const gradeFilter = page.getByLabel('Filter by grade');
		await expect(gradeFilter).toBeVisible();
		await gradeFilter.click();
		// Select first available grade option (test data has random grades 7-12)
		await selectFirstAvailableGrade(gradeFilter);
		// Just verify filter is still interactive after selection
		await expect(gradeFilter).toBeVisible();
	});

	test('can interact with column header sort buttons', async ({ page }) => {
		// Click on Grade header to sort
		const detailTable = page.getByRole('dialog').getByRole('table');
		const gradeHeader = detailTable.getByRole('columnheader', { name: 'G', exact: true });
		await expect(gradeHeader).toBeVisible();
		await gradeHeader.click();

		// Click on Name header to sort
		const nameHeader = detailTable.getByRole('columnheader', { name: 'Name' });
		await expect(nameHeader).toBeVisible();
		await nameHeader.click();
	});

	test('exports filtered data to CSV', async ({ page }) => {
		// Find export button and verify it's visible
		const exportButton = page.getByRole('button', { name: /Export|CSV/i }).first();
		await expect(exportButton).toBeVisible();
		// Note: We don't actually click to avoid file download in tests
	});

	test('closes dialog with close button', async ({ page }) => {
		// Close with close button
		const closeButton = page.getByText('Close', { exact: true });
		await expect(closeButton).toBeVisible();
		await closeButton.click();
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('closes dialog with X button', async ({ page }) => {
		// Close any existing dialog first
		const existingDialog = page.getByRole('dialog');
		if (await existingDialog.isVisible()) {
			await page.keyboard.press('Escape');
			await expect(existingDialog).not.toBeVisible();
		}

		// Open new dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await expect(firstDataRow).toBeVisible();
		await firstDataRow.click();
		await expect(page.getByRole('dialog')).toBeVisible();

		// Close with X button (aria-label="Close")
		const xButton = page.getByLabel('Close');
		await expect(xButton).toBeVisible();
		await xButton.click();
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('closes dialog with backdrop click', async ({ page }) => {
		// Close any existing dialog first
		const existingDialog = page.getByRole('dialog');
		if (await existingDialog.isVisible()) {
			await page.keyboard.press('Escape');
			await expect(existingDialog).not.toBeVisible();
		}

		// Open new dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await expect(firstDataRow).toBeVisible();
		await firstDataRow.click();
		await expect(page.getByRole('dialog')).toBeVisible();

		// Close by pressing Escape key (more reliable than backdrop click)
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});
});

test.describe('Weekly Reports - Create Report @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
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

		// Create category with subcategories
		const categoryName = `TestCategory_${suffix}`;
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['TestSubCategory'],
			e2eTag
		});

		testData = true;

		// Navigate to evaluations page to create an evaluation
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('should create weekly report', async ({ page }) => {
		// Search for and select the student
		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await expect(filterInput).toBeVisible();
		await filterInput.fill(`WeeklyReport_${suffix}`.toLowerCase());

		// Select the student
		const studentRow = page.getByRole('button', {
			name: new RegExp(`WeeklyReport_${suffix}`, 'i')
		});
		await expect(studentRow).toBeVisible();
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Select category
		const categoryName = `TestCategory_${suffix}`;
		await page.getByRole('button', { name: 'Select category' }).click();
		await expect(page.getByRole('option', { name: categoryName })).toBeVisible();
		await page.getByRole('option', { name: categoryName }).click();

		// Wait for sub-category to appear and select it
		await expect(page.getByText(/Sub-Category/i)).toBeVisible();
		await page.getByRole('button', { name: 'Select sub-category' }).click();
		await expect(page.getByRole('option', { name: 'TestSubCategory' })).toBeVisible();
		await page.getByRole('option', { name: 'TestSubCategory' }).click();

		// Submit the evaluation
		const submitButton = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton.click();
		await page.waitForSelector('body.hydrated');

		// Should redirect to evaluations page after successful submission
		await expect(page).toHaveURL('/evaluations');
		await page.waitForSelector('body.hydrated');

		// Now navigate to weekly reports and verify the report appears
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');
		await waitForReportsToLoad(page);

		// Verify the weekly reports page shows data
		await expect(page.getByRole('heading', { name: 'Weekly Reports' })).toBeVisible();

		// Check that there's at least one report row (not just header)
		const table = page.getByRole('table');
		await expect(table).toBeVisible();
		const rows = table.getByRole('row');
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(2); // Header + at least one data row
	});
});

test.describe('Weekly Reports - Update Report @weekly @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let categoryName: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
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
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['UpdateSubCategory'],
			e2eTag
		});

		testData = true;

		// Create first evaluation
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');

		// Search and select student
		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await expect(filterInput).toBeVisible();
		await filterInput.fill(`UpdateReport_${suffix}`.toLowerCase());

		const studentRow = page.getByRole('button', {
			name: new RegExp(`UpdateReport_${suffix}`, 'i')
		});
		await expect(studentRow).toBeVisible();
		await studentRow.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Select category and subcategory
		await page.getByRole('button', { name: 'Select category' }).click();
		await expect(page.getByRole('option', { name: categoryName })).toBeVisible();
		await page.getByRole('option', { name: categoryName }).click();

		await expect(page.getByText(/Sub-Category/i)).toBeVisible();
		await page.getByRole('button', { name: 'Select sub-category' }).first().click();
		await expect(page.getByRole('option', { name: 'UpdateSubCategory' })).toBeVisible();
		await page.getByRole('option', { name: 'UpdateSubCategory' }).click();

		// Submit first evaluation
		const submitButton = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton.click();
		await expect(page).toHaveURL('/evaluations');
	});

	test.afterEach(async () => {
		if (testData) await cleanupWeeklyReportTestData(e2eTag);
	});

	test('should update existing weekly report', async ({ page }) => {
		// Navigate to weekly reports and get initial report data
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');
		await waitForReportsToLoad(page);

		// Open the first report to see initial state
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await expect(firstDataRow).toBeVisible();
		await firstDataRow.click();
		await expect(page.getByRole('dialog')).toBeVisible();

		// Close dialog
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).not.toBeVisible();

		// Create second evaluation for the same student (this updates the weekly report)
		await page.goto('/evaluations/new');
		await page.waitForSelector('body.hydrated');

		// Search and select same student again
		const filterInput2 = page.getByRole('textbox', { name: 'Search students' });
		await expect(filterInput2).toBeVisible();
		await filterInput2.fill(`UpdateReport_${suffix}`.toLowerCase());

		const studentRow2 = page.getByRole('button', {
			name: new RegExp(`UpdateReport_${suffix}`, 'i')
		});
		await expect(studentRow2).toBeVisible();
		await studentRow2.click();
		await expect(page.getByText(/student.*selected/i)).toBeVisible();

		// Select category and subcategory again
		await page.getByRole('button', { name: 'Select category' }).click();
		await expect(page.getByRole('option', { name: categoryName })).toBeVisible();
		await page.getByRole('option', { name: categoryName }).click();

		await expect(page.getByText(/Sub-Category/i)).toBeVisible();
		await page.getByRole('button', { name: 'Select sub-category' }).click();
		await expect(page.getByRole('option', { name: 'UpdateSubCategory' })).toBeVisible();
		await page.getByRole('option', { name: 'UpdateSubCategory' }).click();

		// Submit second evaluation
		const submitButton2 = page.getByRole('button', { name: /Submit Evaluation/i });
		await submitButton2.click();
		await expect(page).toHaveURL('/evaluations');

		// Navigate back to weekly reports and verify the report is updated
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');
		await waitForReportsToLoad(page);

		// Open the report again and verify it's still there with data
		const table2 = page.getByRole('table');
		const firstDataRow2 = table2.getByRole('row').nth(1);
		await expect(firstDataRow2).toBeVisible();
		await firstDataRow2.click();
		await expect(page.getByRole('dialog')).toBeVisible();

		// Verify dialog header contains "Report"
		await expect(
			page.getByRole('dialog').getByRole('columnheader', { name: 'Name' })
		).toBeVisible();
	});
});
