import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupTestData } from './convex-client';
import { NewEvaluationPage, AdminStudentsPage } from './pages';

test.describe('Smoke Tests @smoke', () => {
	test.use({ role: 'teacher' });

	let testE2eTag: string | null = null;

	test.beforeEach(async () => {
		testE2eTag = null;
	});

	test.afterEach(async () => {
		try {
			if (testE2eTag) {
				await cleanupTestData(testE2eTag);
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	test('Teacher creates evaluation - full UI flow', async ({ page }) => {
		const evalsPage = new NewEvaluationPage(page);
		await evalsPage.goto();

		await expect(page.getByRole('heading', { name: 'New Evaluation' })).toBeVisible();
		await expect(page.getByText('1. Select Students')).toBeVisible();

		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		const filterInput = page.getByRole('textbox', { name: 'Search students' });
		await expect(filterInput).toBeVisible();

		await expect(page.getByText('2. Evaluation Details')).toBeVisible();
	});

	test('Teacher is redirected away from admin students page', async ({ page }) => {
		const suffix = getTestSuffix('smokeList');
		const studentId = `SL_${suffix}`;
		const englishName = `SmokeList_${suffix}`;
		testE2eTag = `e2e-test_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '列表測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		await page.waitForURL(/\/evaluations/);
		await expect(page).toHaveURL(/\/evaluations/);
		await expect(page).not.toHaveURL(/\/admin\/students/);
	});
});

test.describe('Student Table UI Tests @students', () => {
	test.use({ role: 'admin' });

	let testE2eTag: string | null = null;

	test.beforeEach(async () => {
		testE2eTag = null;
	});

	test.afterEach(async () => {
		try {
			if (testE2eTag) {
				await cleanupTestData(testE2eTag);
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	test('filters students by search term', async ({ page }) => {
		const studentsPage = new AdminStudentsPage(page);
		const suffix = getTestSuffix('smokeSearch');
		const studentId = `SS_${suffix}`;
		const englishName = `SmokeSearch_${suffix}`;
		testE2eTag = `e2e-test_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '搜尋測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});

		await studentsPage.goto();

		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		const searchInput = page.getByLabel('Search students');
		await searchInput.fill(englishName);

		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});

	test('filters students by grade', async ({ page }) => {
		const studentsPage = new AdminStudentsPage(page);
		const suffix = getTestSuffix('smokeGrade');
		const studentId = `SG_${suffix}`;
		const englishName = `SmokeGrade_${suffix}`;
		testE2eTag = `e2e-test_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			chineseName: '年級測試',
			grade: 10,
			status: 'Enrolled',
			e2eTag: testE2eTag
		});

		await studentsPage.goto();

		await page.waitForSelector('text=Loading students...', { state: 'detached' });

		const gradeFilter = page.getByLabel('Filter by grade');
		await gradeFilter.selectOption('10');

		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});
});
