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
			// First Select.Trigger for Grade filter
			const gradeSelect = page.locator('section div button:has-text("All Grades")').first();
			await gradeSelect.click();
			await page.getByRole('option', { name: 'Grade 9' }).click();
			await expect(page.getByText('Alice Smith')).toBeVisible();
			await expect(page.getByText('Bob Jones')).not.toBeVisible();
		});

		test('can filter students by status', async ({ page }) => {
			await page.waitForSelector('table tbody tr', { timeout: 15000 });
			// Second Select.Trigger for Status filter
			const statusSelect = page.locator('section div button:has-text("All Status")').first();
			await statusSelect.click();
			await page.getByRole('option', { name: 'Graduated' }).click();
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
			const gradeSelect = page.locator('section div button:has-text("All Grades")').first();
			await gradeSelect.click();
			await page.getByRole('option', { name: 'Grade 7' }).click();
			await expect(page.getByText('No students match your filters')).toBeVisible();
		});
	});

	test.describe('Add Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('opens add student dialog', async ({ page }) => {
			await page.goto('/admin/students');
			await page.getByRole('button', { name: 'Add Student' }).click();
			await expect(page.getByText('Add New Student')).toBeVisible();
			await expect(page.getByRole('dialog')).toBeVisible();
		});

		test('can add a new student', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill('S9999');
			await page.getByLabel('English Name *').fill('Test Student');
			await page.getByLabel('Chinese Name').fill('測試學生');
			await page.getByRole('dialog').locator('button:has-text("Select grade")').click();
			await page.getByRole('option', { name: '10' }).click();
			await page.getByRole('button', { name: 'Create' }).click();

			await expect(page.getByText('Test Student')).toBeVisible({ timeout: 10000 });
		});

		test('shows error when student ID is empty', async ({ page }) => {
			await page.goto('/admin/students');
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('English Name *').fill('Test Student');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('Student ID is required')).toBeVisible();
		});

		test('shows error when English name is empty', async ({ page }) => {
			await page.goto('/admin/students');
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill('S9999');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('English name is required')).toBeVisible();
		});

		test('shows error when duplicate student ID', async ({ page }) => {
			await page.goto('/admin/students');
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill('S1001');
			await page.getByLabel('English Name *').fill('Duplicate');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('Student ID already exists')).toBeVisible();
		});
	});

	test.describe('Edit Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('opens edit student dialog', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByText('Edit Student')).toBeVisible();
			await expect(page.getByRole('dialog')).toBeVisible();
		});

		test('pre-fills form with student data', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await expect(page.getByLabel('Student ID *')).toHaveValue('S1001');
			await expect(page.getByLabel('English Name *')).toHaveValue('Alice Smith');
		});

		test('can update student status', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Edit' }).first().click();
			// Second select is Status (first is Grade)
			await page.getByRole('dialog').locator('button:has-text("Enrolled")').click();
			await page.getByRole('option', { name: 'Graduated' }).click();
			await page.getByRole('button', { name: 'Update' }).click();

			await expect(page.getByText('Graduated').first()).toBeVisible({ timeout: 10000 });
		});
	});

	test.describe('Delete Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('opens delete confirmation dialog', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect(page.getByText('Delete Student')).toBeVisible();
			await expect(page.getByText('Are you sure you want to delete')).toBeVisible();
		});

		test('shows warning and both buttons for student with evaluations', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect(page.getByText('evaluation record')).toBeVisible();
			// Should show both buttons
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();
		});

		test('only shows Delete button for student without related records', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			// This test creates a new student without evaluations and deletes it
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill('S9998');
			await page.getByLabel('English Name *').fill('Test Delete No Evals');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('Test Delete No Evals')).toBeVisible({ timeout: 10000 });

			// Now delete it
			await page
				.getByRole('row', { name: 'Test Delete No Evals' })
				.getByRole('button', { name: 'Delete' })
				.click();
			// Should show only Delete button (not Set Not Enrolled or Delete Anyway)
			await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).not.toBeVisible();
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).not.toBeVisible();
		});

		test('can set student to Not Enrolled instead of delete', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			// Delete and choose to set Not Enrolled instead
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await page.getByRole('button', { name: 'Set Not Enrolled' }).click();

			// Student should now be Not Enrolled
			await expect(page.getByText('Not Enrolled').first()).toBeVisible({ timeout: 5000 });
		});

		test('can delete student with cascade', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			const initialCount = await page.locator('table tbody tr').count();

			// Delete a student (assuming this student has evaluations)
			await page.getByRole('button', { name: 'Delete' }).last().click();
			await page.getByRole('button', { name: 'Delete Anyway' }).click();

			// Student should be deleted
			await expect(page.locator('table tbody tr').count()).toBeLessThan(initialCount);
		});
	});

	test.describe('Navigation from Admin Dashboard', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('can navigate to students from admin dashboard', async ({ page }) => {
			await page.goto('/admin');
			await page.getByRole('button', { name: 'Manage Students' }).click();
			await expect(page).toHaveURL(/\/admin\/students/);
			await expect(page.getByText('Student Management')).toBeVisible();
		});

		test('can navigate to archive & reset from admin dashboard', async ({ page }) => {
			await page.goto('/admin');
			await page.getByRole('button', { name: 'Archive & Reset' }).click();
			await expect(page).toHaveURL(/\/admin\/academic/);
			await expect(page.getByText('Archive & Reset')).toBeVisible();
		});
	});

	test.describe('Import Students', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('opens import dialog', async ({ page }) => {
			await page.goto('/admin/students');
			await page.getByRole('banner').getByRole('button', { name: 'Import' }).click();
			await expect(page.getByText('Import Students from Excel')).toBeVisible();
			await expect(page.getByRole('dialog')).toBeVisible();
		});

		test('shows duplicate error in halt mode', async ({ page }) => {
			await page.goto('/admin/students');
			await page.getByRole('banner').getByRole('button', { name: 'Import' }).click();

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
			await page.goto('/admin/students');
			await page.getByRole('banner').getByRole('button', { name: 'Import' }).click();
			await page.getByRole('dialog').getByRole('combobox').click();
			await page.getByRole('option', { name: 'Skip duplicates' }).click();

			const fileChooserPromise = page.waitForEvent('filechooser');
			await page.getByLabel('CSV File').click();
			const fileChooser = await fileChooserPromise;
			await fileChooser.setFiles({
				name: 'students.csv',
				mimeType: 'text/csv',
				buffer: Buffer.from(
					'englishName,chineseName,studentId,grade,status\nImport Test1,測試一,S9001,10,Enrolled\nImport Test2,測試二,S9002,11,Enrolled'
				)
			});

			await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
			await expect(page.getByText('Created: 2')).toBeVisible({ timeout: 5000 });
		});
	});

	test.describe('Disable Student', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('can disable enrolled student', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });

			await page.getByRole('button', { name: 'Disable student' }).first().click();

			await expect(page.getByText('Enrolled').first()).not.toBeVisible({ timeout: 5000 });
		});

		test('disabled student shows Not Enrolled status', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Disable student' }).first().click();
			await expect(page.getByText('Not Enrolled').first()).toBeVisible({ timeout: 5000 });
		});

		test('delete dialog shows Set Not Enrolled for student with evaluations', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).toBeVisible();
		});

		test('delete dialog shows only Delete for student without evaluations', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			// Create a new student without evaluations
			await page.getByRole('button', { name: 'Add Student' }).click();
			await page.getByLabel('Student ID *').fill('S9997');
			await page.getByLabel('English Name *').fill('Test No Evals');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page.getByText('Test No Evals')).toBeVisible({ timeout: 10000 });

			// Delete the new student
			await page
				.getByRole('row', { name: 'Test No Evals' })
				.getByRole('button', { name: 'Delete' })
				.click();
			// Should show only Delete button
			await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Anyway' })).not.toBeVisible();
			await expect(page.getByRole('button', { name: 'Set Not Enrolled' })).not.toBeVisible();
		});

		test('can set student to Not Enrolled from delete dialog', async ({ page }) => {
			await page.goto('/admin/students');
			await page.waitForSelector('table tbody tr', { timeout: 10000 });
			// Make sure we have an enrolled student
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await page.getByRole('button', { name: 'Set Not Enrolled' }).click();
			await expect(page.getByText('Not Enrolled').first()).toBeVisible({ timeout: 5000 });
		});
	});
});

test.describe('Archive & Reset Page', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('page loads correctly', async ({ page }) => {
		await page.goto('/admin/academic');
		await expect(page).toHaveURL(/\/admin\/academic/);
		await expect(page.getByText('Archive & Reset')).toBeVisible();
	});

	test('shows both cards', async ({ page }) => {
		await page.goto('/admin/academic');
		await expect(page.getByRole('heading', { name: 'Advance Academic Year' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Archive Old Graduates' })).toBeVisible();
	});

	test('can advance academic year', async ({ page }) => {
		await page.goto('/admin/academic');
		await page.getByRole('button', { name: 'Advance Academic Year' }).click();
		await expect(page.getByRole('button', { name: 'Confirm & Advance' })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm & Advance' }).click();
		await expect(page.getByText('Advanced grades for')).toBeVisible({ timeout: 10000 });
	});

	test('can change archive retention period', async ({ page }) => {
		await page.goto('/admin/academic');
		await page.getByLabel('Keep graduates from the last N years:').click();
		await page.getByRole('option', { name: '2 years' }).click();
		await expect(page.getByLabel('Keep graduates from the last N years:')).toHaveText('2 years');
	});

	test('shows preview of graduates to be archived', async ({ page }) => {
		await page.goto('/admin/academic');
		// Should show count of graduates older than retention period
		await expect(page.getByText(/graduates older than/)).toBeVisible();
	});

	test('archive confirmation shows all graduates to be deleted', async ({ page }) => {
		await page.goto('/admin/academic');
		await page.getByRole('button', { name: 'Archive & Delete' }).click();
		await expect(page.getByText('This will permanently delete')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Archive & Delete' })).toBeVisible();
	});

	test('non-admin cannot access archive page', async ({ page }) => {
		await page.goto('/admin/academic');
		await expect(page).not.toHaveURL(/\/admin\/academic/);
	});
});
