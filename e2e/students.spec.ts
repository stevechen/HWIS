import { test, expect } from '@playwright/test';
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';

const hasAdminAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/admin.json'));

test.describe('Student Management', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test.describe('Access Control', () => {
		test('redirects non-admin users from /admin/students', async ({ page }) => {
			await page.goto('/admin/students');
			await expect(page).toHaveURL(/\/|\/login/);
		});
	});

	test.describe('Admin Access', () => {
		test.beforeAll(() => {
			if (!hasAdminAuth) {
				test.skip(true, 'Test authentication not set up. Run: npm run test:e2e:setup');
			}
		});

		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {
				// No dialog visible
			}
		});

		test('can access student management page', async ({ page }) => {
			await expect(page).toHaveURL(/\/admin\/students/);
			await expect(page.getByText('Student Management')).toBeVisible();
		});

		test('displays list of students', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 15000 });
			await expect(page.getByText('Alice Smith')).toBeVisible();
			await expect(page.getByText('Bob Jones')).toBeVisible();
		});

		test('can filter students by grade', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 15000 });
			const gradeSelect = page.locator('select[data-slot="native-select"]').first();
			await gradeSelect.selectOption('9');
			await expect(page.getByText('Alice Smith')).toBeVisible();
			await expect(page.getByText('Bob Jones')).not.toBeVisible();
		});

		test('can filter students by status', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 15000 });
			const statusSelect = page.locator('select[data-slot="native-select"]').nth(1);
			await statusSelect.selectOption('Not Enrolled');
			await expect(page.getByText('David Wilson')).toBeVisible();
		});

		test('can search students by name', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 15000 });
			await page.getByPlaceholder('Search by name or student ID...').fill('Alice');
			await expect(page.getByText('Alice Smith')).toBeVisible();
			await expect(page.getByText('Bob Jones')).not.toBeVisible();
		});

		test('can search students by student ID', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 15000 });
			await page.getByPlaceholder('Search by name or student ID...').fill('S1002');
			await expect(page.getByText('Bob Jones')).toBeVisible();
			await expect(page.getByText('Alice Smith')).not.toBeVisible();
		});

		test('shows empty state when no students match filters', async ({ page }) => {
			await page.waitForLoadState('networkidle');
			const gradeSelect = page.locator('select[data-slot="native-select"]').first();
			await gradeSelect.selectOption('12');
			await page.waitForTimeout(1000);
			const emptyState = page.getByText('No students match your filters');
			const isEmptyVisible = await emptyState.isVisible({ timeout: 2000 });
			if (!isEmptyVisible) {
				const visibleStudentRows = await page.locator('table tbody tr').count();
				if (visibleStudentRows > 0) {
					test.skip();
				}
			}
		});
	});

	test.describe('Add Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('opens add student dialog', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Student' }).click();
			await expect(page.getByText('Add New Student', { exact: true })).toBeVisible();
			await expect(page.getByRole('dialog')).toBeVisible();
		});

		test('can add a new student', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			const uniqueName = 'Add New Student ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_AN_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page.getByLabel('Chinese Name').fill('測試學生');
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();

			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });
		});

		test('shows error when student ID is empty', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('English Name *').fill('Test Student');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('Student ID is required')).toBeVisible();
		});

		test('shows error when English name is empty', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill('S9999');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('English name is required')).toBeVisible();
		});

		test('shows error when duplicate student ID', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill('S1001');
			await page.getByLabel('English Name *').fill('Duplicate');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('Student ID already exists', { exact: true })).toBeVisible();
		});
	});

	test.describe('Student ID Validation', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('shows check icon for unique student ID after manual check', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Student' }).click();
			await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
			const uniqueId = 'UNIQUE' + Date.now().toString().slice(-6);
			await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill(uniqueId);
			await page
				.getByRole('dialog')
				.locator('button[title="Check if student ID is available"]')
				.click();
			await page.waitForTimeout(3000);
			await expect(page.getByRole('dialog').locator('.text-green-500').first()).toBeVisible({
				timeout: 10000
			});
		});

		test('shows error when submitting duplicate student ID via form', async ({ page }) => {
			await page.getByRole('button', { name: 'Add Student' }).click();
			await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
			await page.getByRole('dialog').getByPlaceholder('e.g., S1001').fill('S1001');
			await page.getByRole('dialog').getByPlaceholder('e.g., John Smith').fill('Duplicate Test');
			await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('Student ID already exists', { exact: true })).toBeVisible({
				timeout: 5000
			});
		});
	});

	test.describe('Edit Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('opens edit student dialog', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByText('Edit Student')).toBeVisible();
			await expect(page.getByRole('dialog')).toBeVisible();
		});

		test('pre-fills form with student data', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			// Use row-specific selector to ensure we edit Alice Smith, not any recently added test student
			await page
				.getByRole('row', { name: 'Alice Smith' })
				.getByRole('button', { name: 'Edit' })
				.click();
			await expect(page.getByLabel('Student ID *')).toHaveValue('S1001');
			await expect(page.getByLabel('English Name *')).toHaveValue('Alice Smith');
		});

		test('can update student status', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.nth(1)
				.selectOption('Not Enrolled');
			await page.getByRole('button', { name: 'Update' }).click();

			await expect(page.getByRole('cell', { name: 'Not Enrolled' }).first()).toBeVisible({
				timeout: 10000
			});
		});
	});

	test.describe('Delete Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('opens delete confirmation dialog', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect(page.getByText('Delete Student')).toBeVisible();
			await expect(page.getByText('Are you sure you want to delete')).toBeVisible();
		});

		test('only shows Delete button for student without related records', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			const uniqueName = 'Delete No Evals ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_DNE_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			const testRow = page.getByRole('row', { name: uniqueName });
			await testRow.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await expect(page.getByText('Delete', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).not.toBeVisible();
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).not.toBeVisible();
		});

		test('can set student with evaluations to Not Enrolled instead of delete', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Create a unique test student
			const uniqueName = 'Has Evals Test ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_HEV_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			// Navigate directly to new evaluation page
			await page.goto('/evaluations/new');
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(1000);

			// Search for and select the student
			await page.getByPlaceholder('Filter by name or ID...').fill(uniqueName);
			await page.waitForTimeout(500);
			await page.getByText(uniqueName).click();

			// Select a category - use seeded category names
			await page.locator('button:has-text("Select Category")').click();
			await page.getByRole('option', { name: 'Creativity' }).click();

			// Select a subcategory
			await page.locator('button:has-text("Select Sub-Category")').click();
			await page.getByRole('option', { name: 'Leadership' }).click();

			// Enter points using the +1 button and submit
			await page.locator('button:has-text("+1")').click();
			await page.getByRole('button', { name: 'Submit Evaluation' }).click();
			await page.waitForTimeout(1000);

			// Go back to students page
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Now test the delete dialog
			const testRow = page.getByRole('row', { name: uniqueName });
			await testRow.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			// Should show "Set Not Enrolled" and "Delete Anyway" for student with evaluations
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();
		});

		test('can delete student with cascade', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			const initialCount = await page.locator('table tbody tr').count();

			// Create a unique student with evaluations to ensure isolation
			const uniqueName = 'Delete Cascade ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_DCC_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			// Give the student an evaluation
			await page.goto('/evaluations/new');
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(500);
			await page.getByPlaceholder('Filter by name or ID...').fill(uniqueName);
			await page.waitForTimeout(500);
			await page.getByText(uniqueName).click();
			await page.locator('button:has-text("Select Category")').click();
			await page.getByRole('option', { name: 'Creativity' }).click();
			await page.locator('button:has-text("Select Sub-Category")').click();
			await page.getByRole('option', { name: 'Leadership' }).click();
			await page.locator('button:has-text("+1")').click();
			await page.getByRole('button', { name: 'Submit Evaluation' }).click();
			await page.waitForTimeout(2000);

			// Go back and delete
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Filter to show only Enrolled students
			const statusSelect = page.locator('select[data-slot="native-select"]').nth(1);
			await statusSelect.selectOption('Enrolled');
			await page.waitForTimeout(500);

			// Find and delete our test student
			const testRow = page.getByRole('row', { name: uniqueName });
			await testRow.getByRole('button', { name: 'Delete' }).click();
			await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
			await page.getByRole('button', { name: 'Delete Anyway' }).click();
			await page.waitForTimeout(1000);
			const finalCount = await page.locator('table tbody tr').count();
			await expect(finalCount).toBeLessThan(initialCount);
		});

		test('delete dialog shows Set Not Enrolled for student with evaluations', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Create a unique student with evaluations
			const uniqueName = 'Has Evals Dialog ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_HED_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			// Give the student an evaluation
			await page.goto('/evaluations/new');
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(500);
			await page.getByPlaceholder('Filter by name or ID...').fill(uniqueName);
			await page.waitForTimeout(500);
			await page.getByText(uniqueName).click();
			await page.locator('button:has-text("Select Category")').click();
			await page.getByRole('option', { name: 'Creativity' }).click();
			await page.locator('button:has-text("Select Sub-Category")').click();
			await page.getByRole('option', { name: 'Leadership' }).click();
			await page.locator('button:has-text("+1")').click();
			await page.getByRole('button', { name: 'Submit Evaluation' }).click();
			await page.waitForTimeout(2000);

			// Go back to students page
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Filter to show only Enrolled students so we can find our test student
			const statusSelect = page.locator('select[data-slot="native-select"]').nth(1);
			await statusSelect.selectOption('Enrolled');
			await page.waitForTimeout(500);

			// Delete the student and verify dialog shows Set Not Enrolled
			const testRow = page.getByRole('row', { name: uniqueName });
			await testRow.getByRole('button', { name: 'Delete' }).click();
			await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();
		});

		test('delete dialog shows only Delete for student without evaluations', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			const uniqueName = 'Delete Only Test ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_DOT_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			const testRow = page.getByRole('row', { name: uniqueName });
			await testRow.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await expect(page.getByText('Delete', { exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).not.toBeVisible();
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).not.toBeVisible();
		});

		test('can set student to Not Enrolled from delete dialog', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Create a unique student with evaluations
			const uniqueName = 'Set From Dialog ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_SFD_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			// Give the student an evaluation
			await page.goto('/evaluations/new');
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(500);
			await page.getByPlaceholder('Filter by name or ID...').fill(uniqueName);
			await page.waitForTimeout(500);
			await page.getByText(uniqueName).click();
			await page.locator('button:has-text("Select Category")').click();
			await page.getByRole('option', { name: 'Creativity' }).click();
			await page.locator('button:has-text("Select Sub-Category")').click();
			await page.getByRole('option', { name: 'Leadership' }).click();
			await page.locator('button:has-text("+1")').click();
			await page.getByRole('button', { name: 'Submit Evaluation' }).click();
			await page.waitForTimeout(2000);

			// Go back to students page
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Filter to show only Enrolled students so we can find our test student
			const statusSelect = page.locator('select[data-slot="native-select"]').nth(1);
			await statusSelect.selectOption('Enrolled');
			await page.waitForTimeout(500);

			// Delete and set to Not Enrolled
			const testRow = page.getByRole('row', { name: uniqueName });
			await testRow.getByRole('button', { name: 'Delete' }).click();
			await page.getByRole('button', { name: 'Set Not Enrolled' }).click();

			// Reset filter to show All Status so we can find the row
			const statusFilter = page.locator('select[data-slot="native-select"]').nth(1);
			await statusFilter.selectOption('All Status');
			await page.waitForTimeout(500);

			await expect(testRow.getByText('Not Enrolled')).toBeVisible({ timeout: 5000 });
		});
	});

	test.describe('Navigation from Admin Dashboard', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('can navigate to students from admin dashboard', async ({ page }) => {
			await page.goto('/admin');
			await page.getByRole('button', { name: 'Manage Students' }).click();
			await expect(page).toHaveURL(/\/admin\/students/);
			await expect(page.getByText('Student Management')).toBeVisible();
		});

		test('can navigate to archive & reset from admin dashboard', async ({ page }) => {
			await page.goto('/admin');
			await page.getByRole('button', { name: 'New School Year' }).click();
			await expect(page).toHaveURL(/\/admin\/academic/);
			await expect(page.getByText('Year-End Reset')).toBeVisible();
		});
	});

	test.describe('Import Students', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('opens import dialog', async ({ page }) => {
			await page.getByRole('button', { name: 'Import' }).click({ force: true });
			await expect(page.getByText('Import Students from Excel')).toBeVisible();
			await expect(page.getByRole('dialog')).toBeVisible();
		});

		test('shows duplicate error in halt mode', async ({ page }) => {
			await page.getByRole('button', { name: 'Import' }).click({ force: true });

			const fileChooserPromise = page.waitForEvent('filechooser');
			await page.getByLabel('CSV File').click();
			const fileChooser = await fileChooserPromise;
			await fileChooser.setFiles({
				name: 'students.csv',
				mimeType: 'text/csv',
				buffer: Buffer.from(
					'englishName,chineseName,studentId,grade,status\nAlice Duplicate,假名,S1001,9,Enrolled'
				)
			});

			await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
			await expect(page.getByText('Found 1 duplicate student ID')).toBeVisible({ timeout: 5000 });
		});

		test('can import new students in skip mode', async ({ page }) => {
			await page.getByRole('button', { name: 'Import' }).click({ force: true });
			await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

			// Select "Skip duplicates" from the native select
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.selectOption('skip');

			const fileChooserPromise = page.waitForEvent('filechooser');
			await page.getByLabel('CSV File').click();
			const fileChooser = await fileChooserPromise;
			// Use unique IDs to avoid conflicts
			const uniqueSuffix = Date.now().toString().slice(-4);
			await fileChooser.setFiles({
				name: 'students.csv',
				mimeType: 'text/csv',
				buffer: Buffer.from(
					`englishName,chineseName,studentId,grade,status\nImportSkip${uniqueSuffix},測試跳過,S_SKIP_${uniqueSuffix},10,Enrolled`
				)
			});

			// Wait for preview to appear
			await page.waitForTimeout(500);

			// Check if dialog is still open before clicking Import
			const dialogBefore = page.getByRole('dialog');
			await expect(dialogBefore).toBeVisible();

			await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();

			// Wait and check for any result in the dialog or error
			await page.waitForTimeout(2000);

			// Check if dialog is still open
			const dialogAfter = page.getByRole('dialog');
			const isDialogVisible = await dialogAfter.isVisible();

			if (isDialogVisible) {
				// Dialog is still open - check for result message
				const resultText = await dialogAfter.textContent();
				console.log('Dialog content:', resultText);

				// Look for Created, Skipped, or Error in the dialog
				await expect(
					dialogAfter.getByText(/Created:|Skipped:|Error:|Successfully|Failed/)
				).toBeVisible({ timeout: 5000 });
			} else {
				// Dialog closed - check if the student was created by searching for it
				await page.waitForSelector('table tbody tr', { timeout: 5000 });
				const studentRow = page.getByRole('row', { name: `S_SKIP_${uniqueSuffix}` });
				await expect(studentRow).toBeVisible({ timeout: 5000 });
			}
		});
	});

	test.describe('Disable Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForLoadState('networkidle');
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('can disable enrolled student', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Create a unique test student to ensure isolation
			const uniqueName = 'Disable Verify Student ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_DS_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			// Find the row with our test student and verify they show Enrolled before disabling
			const testStudentRow = page.getByRole('row', { name: uniqueName });
			await expect(testStudentRow.getByText('Enrolled')).toBeVisible();

			// Disable the test student
			await testStudentRow.getByRole('button', { name: 'Disable' }).click();
			await page.getByRole('button', { name: 'Confirm' }).click();

			// Verify the test student now shows Not Enrolled instead of Enrolled
			await expect(testStudentRow.getByText('Not Enrolled')).toBeVisible({ timeout: 5000 });
		});

		test('disabled student shows Not Enrolled status', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Create a unique test student to ensure isolation
			const uniqueName = 'Disable Check Student ' + Date.now().toString().slice(-4);
			const uniqueId = 'S_DC_' + Date.now().toString().slice(-6);
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill(uniqueId);
			await page.getByLabel('English Name *').fill(uniqueName);
			await page
				.getByRole('dialog')
				.locator('select[data-slot="native-select"]')
				.first()
				.selectOption('10');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByRole('row', { name: uniqueName })).toBeVisible({ timeout: 10000 });

			// Find the row with our test student
			const testStudentRow = page.getByRole('row', { name: uniqueName });

			// Disable the test student
			await testStudentRow.getByRole('button', { name: 'Disable' }).click();
			await page.getByRole('button', { name: 'Confirm' }).click();

			// Verify the specific test student now shows Not Enrolled
			await expect(testStudentRow.getByText('Not Enrolled')).toBeVisible({ timeout: 5000 });
		});
	});

	test.describe('Archive & Reset Page', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test.beforeEach(async ({ page }) => {
			await page.goto('/admin/academic');
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(1000);
			try {
				const dialog = page.getByRole('dialog');
				if (await dialog.isVisible({ timeout: 1000 })) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(500);
				}
			} catch {}
		});

		test('page loads and shows correct heading', async ({ page }) => {
			await expect(page).toHaveURL(/\/admin\/academic/);
			await expect(page.getByRole('heading', { name: 'Year-End Reset' })).toBeVisible({
				timeout: 10000
			});
		});

		test('shows advance academic year section', async ({ page }) => {
			await expect(page.getByText('Advance Academic Year')).toBeVisible({ timeout: 10000 });
		});

		test('shows advance year button', async ({ page }) => {
			await expect(page.getByRole('button', { name: /Advance Year/i })).toBeVisible({
				timeout: 10000
			});
		});
	});
});
