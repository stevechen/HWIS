import { test, expect } from './fixtures';
import { getTestSuffix, getStudentId } from './helpers';
import { createStudent, createCategory, cleanupByTag, useRole } from './convex-client';
import { AdminStudentsPage, NewEvaluationPage } from './pages';

test.describe('Bulk Operations @bulk @sequential', () => {
	test.describe('Bulk Evaluation Creation', () => {
		test.use({ storageState: 'e2e/.auth/teacher.json' });

		const suffix = getTestSuffix('bulkEval');
		const e2eTag = `e2e-test_${suffix}`;
		const categoryName = `BulkTest_${suffix}`;
		let testDataCreated = false;
		let evalsPage: NewEvaluationPage;

		test.beforeEach(async ({ page }) => {
			evalsPage = new NewEvaluationPage(page);
			useRole('teacher');

			for (let i = 1; i <= 3; i++) {
				await createStudent({
					studentId: getStudentId(`BULK${i}_${suffix}`),
					englishName: `BulkStudent${i}_${suffix}`,
					chineseName: `大量${i}`,
					grade: 9 + i,
					status: 'Enrolled',
					e2eTag
				});
			}

			await createCategory({
				name: categoryName,
				e2eTag
			});

			testDataCreated = true;

			await evalsPage.goto();
		});

		test.afterEach(async () => {
			if (testDataCreated) await cleanupByTag('all', e2eTag);
		});

		test('can select multiple students for bulk evaluation', async () => {
			await expect(evalsPage.page.getByText('1. Select Students')).toBeVisible();

			const searchInput = evalsPage.page.getByRole('textbox', { name: 'Search students' });
			await expect(searchInput).toBeVisible();

			await searchInput.clear();

			// Wait for at least one student row to appear (Convex data load)
			await expect(
				evalsPage.page.locator('[data-testid^="evaluations-new.student-row-"]').first()
			).toBeVisible();

			const studentRows = evalsPage.page.locator('[data-testid^="evaluations-new.student-row-"]');
			const count = await studentRows.count();

			expect(count).toBeGreaterThanOrEqual(3);
		});

		test('can create evaluation for all selected students', async () => {
			const searchInput = evalsPage.page.getByRole('textbox', { name: 'Search students' });
			await searchInput.clear();

			// Add all filtered results via the sticky header button
			await evalsPage.selectAll();

			await expect(evalsPage.page.getByText(/selected$/)).toBeVisible();

			const continueButton = evalsPage.page.getByRole('button', { name: /continue|next/i });
			if (await continueButton.isVisible()) {
				await continueButton.click();
			}

			await evalsPage.selectCategory(categoryName);

			await evalsPage.fillDetails('Great work on homework!');

			await evalsPage.selectPoint(2);

			await evalsPage.submit();

			await expect(evalsPage.page).toHaveURL(/evaluations|admin/);
		});
	});

	test.describe('Bulk Status Change', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		const suffix = getTestSuffix('bulkStatus');
		const e2eTag = `e2e-status_${suffix}`;
		let testDataCreated = false;
		let studentsPage: AdminStudentsPage;

		test.beforeEach(async ({ page }) => {
			studentsPage = new AdminStudentsPage(page);
			useRole('admin');

			for (let i = 1; i <= 3; i++) {
				await createStudent({
					studentId: getStudentId(`STAT${i}_${suffix}`),
					englishName: `StatusStudent${i}_${suffix}`,
					chineseName: `狀態${i}`,
					grade: 9 + i,
					status: 'Not Enrolled',
					e2eTag
				});
			}
			testDataCreated = true;

			await studentsPage.goto();
		});

		test.afterEach(async () => {
			if (testDataCreated) {
				await cleanupByTag('students', e2eTag);
			}
		});

		test('can filter students by status', async () => {
			await studentsPage.expectStudentNameVisible(`StatusStudent1_${suffix}`);

			await studentsPage.filterByStatus('Enrolled');

			await studentsPage.expectStudentNameNotVisible(`StatusStudent1_${suffix}`);
		});

		test('can filter students by grade', async () => {
			await studentsPage.expectLoadingHidden();

			await studentsPage.filterByGrade('11');

			await studentsPage.expectStudentNameNotVisible(`StatusStudent1_${suffix}`);
			await studentsPage.expectStudentNameVisible(`StatusStudent2_${suffix}`);
			await studentsPage.expectStudentNameNotVisible(`StatusStudent3_${suffix}`);
		});
	});

	test.describe('Bulk Selection in UI', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		const suffix = getTestSuffix('bulkSelect');
		const e2eTag = `e2e-select_${suffix}`;
		let testDataCreated = false;
		let studentsPage: AdminStudentsPage;

		test.beforeEach(async ({ page }) => {
			studentsPage = new AdminStudentsPage(page);
			useRole('admin');

			for (let i = 1; i <= 5; i++) {
				await createStudent({
					studentId: getStudentId(`SEL${i}_${suffix}`),
					englishName: `SelectStudent${i}_${suffix}`,
					chineseName: `選擇${i}`,
					grade: 9,
					status: 'Enrolled',
					e2eTag
				});
			}
			testDataCreated = true;

			await studentsPage.goto();
		});

		test.afterEach(async () => {
			if (testDataCreated) {
				await cleanupByTag('students', e2eTag);
			}
		});

		test('can search for students', async () => {
			await studentsPage.fillSearch(`SelectStudent2_${suffix}`);

			await studentsPage.expectStudentNameVisible(`SelectStudent2_${suffix}`);
			await studentsPage.expectStudentNameNotVisible(`SelectStudent1_${suffix}`);
		});
	});
});
