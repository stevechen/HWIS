import { test, type Page } from '@playwright/test';
import { NewEvaluationPage, TeacherEvaluationsPage } from '../pages';
import { getTestSuffix } from '../helpers';
import { createStudent, createCategory, useRole } from '../convex-client';

test.describe('Evaluations page (prototype)', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	const suffix = getTestSuffix('eval');
	const categoryName = `EvalCat_${suffix}`;

	test.beforeEach(async () => {
		useRole('teacher');
		await createCategory({ name: categoryName, e2eTag: `e2e-test_${suffix}` });
	});

	async function createEvaluationViaUi(page: Page, studentName: string) {
		const studentId = `EV_${studentName}`;
		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: '評估',
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});
		const newEvalPage = new NewEvaluationPage(page);
		await newEvalPage.goto();
		await newEvalPage.searchStudent(studentName);
		await newEvalPage.selectStudent(studentName);
		await newEvalPage.selectCategory(categoryName);
		await newEvalPage.selectPoint(1);
		await newEvalPage.fillDetails('Prototype test evaluation');
		await newEvalPage.submit();
		await newEvalPage.expectSubmitSuccess();
	}

	test('creates an evaluation', async ({ page }) => {
		await createEvaluationViaUi(page, `Create_${suffix}`);

		const teacherPage = new TeacherEvaluationsPage(page);
		await teacherPage.waitForCard(`Create_${suffix}`);
	});
});
