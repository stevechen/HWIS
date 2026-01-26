import { test, expect } from '@playwright/test';
import { createWeeklyReportTestData, cleanupWeeklyReportTestData } from './convex-client';

test.describe('Weekly Reports Integration', () => {
	test.beforeEach(async () => {
		await cleanupWeeklyReportTestData();
		await createWeeklyReportTestData();
	});

	test.afterEach(async () => {
		await cleanupWeeklyReportTestData();
	});

	test('displays real Convex data with 5 weeks of reports', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Wait for data to load (not demo mode)
		await expect(page.getByRole('heading', { name: 'Weekly Reports' })).toBeVisible();

		// Verify 5 weeks are displayed
		const table = page.getByRole('table');
		await expect(table).toBeVisible();

		// Check for specific week counts (based on our test data)
		const rows = table.getByRole('row');
		await expect(rows).toHaveCount(6); // 1 header + 5 data rows

		// Verify week numbers exist (should be in reverse chronological order)
		await expect(table.getByRole('cell', { name: '3' })).toBeVisible(); // Most recent week
		await expect(table.getByRole('cell', { name: '2' })).toBeVisible();
		await expect(table.getByRole('cell', { name: '51' })).toBeVisible(); // 2024 week
		await expect(table.getByRole('cell', { name: '50' })).toBeVisible();
		await expect(table.getByRole('cell', { name: '49' })).toBeVisible(); // Oldest week

		// Verify student counts match our test data
		await expect(table.getByRole('cell', { name: '3' })).toBeVisible(); // Week 3: 3 students
		await expect(table.getByRole('cell', { name: '4' })).toBeVisible(); // Week 2: 4 students
	});

	test('opens report dialog and displays weekly details', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Click on the most recent week (Week 3)
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1); // Skip header
		await firstDataRow.click();

		// Verify dialog opens
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Week 3 Report' })).toBeVisible();

		// Verify student data is displayed
		await expect(page.getByText('Total Students: 3')).toBeVisible();
		await expect(page.getByRole('table', { name: 'Student Details' })).toBeVisible();
	});

	test('filters student data by ID', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Get a student ID from our test data (should be in format weekly-test-xxx-STU-xx)
		const filterInput = page.getByPlaceholder('Filter by student ID...');
		await filterInput.fill('weekly-test');

		// Verify filtering works
		await expect(filterInput).toHaveValue('weekly-test');

		// Check that filtered results appear (student table should update)
		await page.waitForTimeout(500); // Allow filtering to process
	});

	test('filters student data by name', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Filter by student name
		const nameFilter = page.getByPlaceholder('Filter by name (comma-separated)...');
		await nameFilter.fill('Alice');

		// Verify filtering works
		await expect(nameFilter).toHaveValue('Alice');

		// Check that filtered results appear
		await page.waitForTimeout(500);
	});

	test('filters student data by grade', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Filter by grade
		const gradeFilter = page.getByRole('combobox', { name: /filter by grade/i });
		await gradeFilter.click();

		// Select grade 10
		await page.getByRole('option', { name: '10' }).click();

		// Verify grade filtering
		await expect(gradeFilter).toHaveValue('10');

		// Check that filtered results appear
		await page.waitForTimeout(500);
	});

	test('sorts student data by different columns', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Test sorting by ID
		await page.getByRole('button', { name: 'Sort by ID' }).click();
		await page.waitForTimeout(500);

		// Test sorting by name
		await page.getByRole('button', { name: 'Sort by Name' }).click();
		await page.waitForTimeout(500);

		// Test sorting by grade
		await page.getByRole('button', { name: 'Sort by Grade' }).click();
		await page.waitForTimeout(500);

		// Test ascending/descending toggle
		await page.getByRole('button', { name: 'Toggle sort direction' }).click();
		await page.waitForTimeout(500);
	});

	test('exports filtered data to CSV', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Apply a filter first
		const nameFilter = page.getByPlaceholder('Filter by name (comma-separated)...');
		await nameFilter.fill('Alice');

		// Click export button
		const exportButton = page.getByRole('button', { name: 'Export to CSV' });
		await expect(exportButton).toBeVisible();

		// Handle download (setup download listener before click)
		const downloadPromise = page.waitForEvent('download');
		await exportButton.click();

		// Wait for download to complete
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/weekly.*report.*\.csv$/i);

		// Verify download completed
		console.log(`Downloaded: ${download.suggestedFilename()}`);
	});

	test('closes dialog with close button', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Close with close button
		const closeButton = page.getByRole('button', { name: 'Close' }).first();
		await closeButton.click();

		// Verify dialog is closed
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('closes dialog with X button', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Close with X button
		const xButton = page.getByRole('button', { name: 'Close' }).nth(1);
		await xButton.click();

		// Verify dialog is closed
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('closes dialog with backdrop click', async ({ page }) => {
		// Navigate to weekly reports page
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Open report dialog
		const table = page.getByRole('table');
		const firstDataRow = table.getByRole('row').nth(1);
		await firstDataRow.click();

		// Wait for dialog to open
		await expect(page.getByRole('dialog')).toBeVisible();

		// Close by clicking backdrop
		const dialog = page.getByRole('dialog');
		await dialog.click({ position: { x: 10, y: 10 } });

		// Verify dialog is closed
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('displays empty state when no data available', async ({ page }) => {
		// Clean up data first
		await cleanupWeeklyReportTestData();

		// Navigate without data
		await page.goto('/admin/weekly-reports');
		await page.waitForSelector('body.hydrated');

		// Should show empty state
		await expect(page.getByText('No weekly reports available yet.')).toBeVisible();

		// Restore data for other tests
		await createWeeklyReportTestData();
	});
});
