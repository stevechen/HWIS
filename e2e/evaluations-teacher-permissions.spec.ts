import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import { createStudentWithEvaluations, createCategory, cleanupByTag } from './convex-client';
import { StudentTimelinePage } from './pages';

test.describe('Teacher Role-Based UI - Student Timeline Page @teacher-permissions @sequential', () => {
	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let englishName: string;
	let testData = false;

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test.describe('Teacher View', () => {
		test.beforeEach(async () => {
			suffix = getTestSuffix('teacherPerm');
			e2eTag = `e2e-test_${suffix}`;
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			testData = false;

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
				evaluationCount: 2,
				e2eTag
			});
			testData = true;
		});

		test.use({ role: 'teacher' });

		test('teacher name is NOT displayed on evaluation cards', async ({ page }) => {
			const timelinePage = new StudentTimelinePage(page);
			await timelinePage.goto(studentId);

			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			await expect(page.getByRole('separator', { name: 'Timeline divider' })).toBeVisible();

			const evalCard = page.locator('.bg-card').first();
			await expect(evalCard).toBeVisible();

			const cardWithAriaLabel = page.getByRole('button', { name: /Evaluation by/ }).first();
			await expect(cardWithAriaLabel).toBeVisible();
		});

		test('Filter by teacher(s) input is NOT visible for teachers', async ({ page }) => {
			const timelinePage = new StudentTimelinePage(page);
			await timelinePage.goto(studentId);

			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await expect(teacherFilter).not.toBeVisible();

			const filterByPlaceholder = page.getByPlaceholder('Filter by teacher(s)…');
			await expect(filterByPlaceholder).not.toBeVisible();
		});
	});

	test.describe('Admin View (Comparison)', () => {
		test.beforeEach(async () => {
			suffix = getTestSuffix('teacherPerm');
			e2eTag = `e2e-test_${suffix}`;
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			testData = false;

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
				evaluationCount: 2,
				e2eTag
			});
			testData = true;
		});

		test.use({ role: 'admin' });

		test('admin sees teacher name on evaluation cards', async ({ page }) => {
			const timelinePage = new StudentTimelinePage(page);
			await timelinePage.goto(studentId);

			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			await expect(page.getByRole('separator', { name: 'Timeline divider' })).toBeVisible();

			const showTeacherToggle = page.getByRole('button', { name: 'Show teacher name' });
			await expect(showTeacherToggle).toBeVisible();
			await showTeacherToggle.click();

			const evalCard = page.locator('.bg-card').first();
			await expect(evalCard).toBeVisible();

			const userIcon = page.locator('.lucide-user').first();
			await expect(userIcon).toBeVisible();
		});

		test('Filter by teacher(s) input IS visible for admins', async ({ page }) => {
			const timelinePage = new StudentTimelinePage(page);
			await timelinePage.goto(studentId);

			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();

			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await expect(teacherFilter).toBeVisible();

			const filterByPlaceholder = page.getByPlaceholder('Filter by teacher(s)…');
			await expect(filterByPlaceholder).toBeVisible();
		});
	});
});
