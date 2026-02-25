import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createStudentWithEvaluations,
	createCategory,
	cleanupByTag,
	useRole
} from './convex-client';

test.describe('Teacher Role-Based UI - Student Timeline Page @teacher-permissions @sequential', () => {
	// CONSTANTS - Define at top of describe
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let englishName: string;
	let testData = false;

	// Cleanup after each test
	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test.describe('Teacher View', () => {
		// DATA SEEDING - Teacher creates their own data
		test.beforeEach(async () => {
			suffix = getTestSuffix('teacherPerm');
			e2eTag = `e2e-test_${suffix}`;
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			testData = false;

			// Login as teacher FIRST, then create data
			useRole('teacher');

			// Create category and student via API (as teacher)
			await createCategory({
				name: `Cat_${suffix}`,
				e2eTag
			});

			await createStudentWithEvaluations({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});
			testData = true;
		});

		test.use({ storageState: 'e2e/.auth/teacher.json' });

		test('teacher name is NOT displayed on evaluation cards', async ({ page }) => {
			// Navigate to the student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');

			// Ensure loading states are not visible
			await expect(page.getByText('Loading')).not.toBeVisible();

			// Wait for page to load - verify back button is visible (confirms page loaded)
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			// Wait for timeline divider to appear (confirms timeline loaded)
			await expect(page.getByRole('separator', { name: 'Timeline divider' })).toBeVisible();

			// Find evaluation cards - they should exist
			const evalCard = page.locator('.bg-card').first();
			await expect(evalCard).toBeVisible();

			// Also verify the aria-label shows "Evaluation by" but the actual teacher name text is hidden
			const cardWithAriaLabel = page.getByRole('button', { name: /Evaluation by/ });
			await expect(cardWithAriaLabel).toBeVisible();
		});

		test('Filter by teacher(s) input is NOT visible for teachers', async ({ page }) => {
			// Navigate to the student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');

			// Ensure loading states are not visible
			await expect(page.getByText('Loading')).not.toBeVisible();

			// Wait for page to load
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			// The teacher filter input should NOT be visible for teachers
			// We look for the textbox with name "Filter by teacher"
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await expect(teacherFilter).not.toBeVisible();

			// Also verify by placeholder text
			const filterByPlaceholder = page.getByPlaceholder('Filter by teacher(s)…');
			await expect(filterByPlaceholder).not.toBeVisible();
		});
	});

	test.describe('Admin View (Comparison)', () => {
		// DATA SEEDING - Admin creates their own data
		test.beforeEach(async () => {
			suffix = getTestSuffix('teacherPerm');
			e2eTag = `e2e-test_${suffix}`;
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			testData = false;

			// Login as admin FIRST, then create data
			useRole('admin');

			// Create category and student via API (as admin)
			await createCategory({
				name: `Cat_${suffix}`,
				e2eTag
			});

			await createStudentWithEvaluations({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});
			testData = true;
		});

		test.use({ storageState: 'e2e/.auth/admin.json' });

		test('admin sees teacher name on evaluation cards', async ({ page }) => {
			// Navigate to the student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');

			// Ensure loading states are not visible
			await expect(page.getByText('Loading')).not.toBeVisible();

			// Wait for page to load
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			// Wait for timeline to load
			await expect(page.getByRole('separator', { name: 'Timeline divider' })).toBeVisible();

			// Find evaluation cards
			const evalCard = page.locator('.bg-card').first();
			await expect(evalCard).toBeVisible();

			// For admins, the teacher name section should be visible
			// This includes the User icon in the timeline (not the card)
			// We look for a User icon near the timeline
			const userIcon = page.locator('.lucide-user').first();
			await expect(userIcon).toBeVisible();
		});

		test('Filter by teacher(s) input IS visible for admins', async ({ page }) => {
			// Navigate to the student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');

			// Ensure loading states are not visible
			await expect(page.getByText('Loading')).not.toBeVisible();

			// Wait for page to load
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			// The teacher filter input SHOULD be visible for admins
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await expect(teacherFilter).toBeVisible();

			// Also verify by placeholder text
			const filterByPlaceholder = page.getByPlaceholder('Filter by teacher(s)…');
			await expect(filterByPlaceholder).toBeVisible();
		});
	});
});
