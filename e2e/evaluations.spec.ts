import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import {
	createStudent,
	createStudentWithEvaluations,
	createCategory,
	cleanupByTag,
	useRole
} from './convex-client';
import { NewEvaluationPage, TeacherEvaluationsPage } from './pages';

test.describe('Evaluations - Select Student', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let studentName: string;
	let testStudent = false;
	let evalsPage: NewEvaluationPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new NewEvaluationPage(page);
		useRole('teacher');
		testStudent = false;
		suffix = getTestSuffix('selectStudent');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		studentName = `SelectMe_${suffix}`;

		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' seçme',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testStudent = true;

		await evalsPage.goto();
		await expect(evalsPage.page.getByText('Loading students...')).not.toBeVisible();
		await expect(evalsPage.page.getByRole('list', { name: 'Students' })).toBeVisible();
		await expect(evalsPage.page.getByText('1. Select Students')).toBeVisible();

		await evalsPage.searchStudent(studentName.toLowerCase());
		const studentRow = evalsPage.page.getByRole('button', {
			name: new RegExp(studentName, 'i')
		});
		await expect(studentRow).toBeVisible();
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', e2eTag);
	});

	test('allows selecting a student', async () => {
		const studentRow = evalsPage.page.getByRole('button', {
			name: new RegExp(studentName, 'i')
		});
		await expect(studentRow).toBeVisible();

		await studentRow.click();

		await evalsPage.expectStudentSelected(studentName);
	});
});

test.describe('Evaluations - No Category Error', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let studentName: string;
	let testStudent = false;
	let evalsPage: NewEvaluationPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new NewEvaluationPage(page);
		useRole('teacher');
		testStudent = false;
		suffix = getTestSuffix('noCat');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		studentName = `NoCat_${suffix}`;

		const createResult = await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' kategori',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		if (createResult && typeof createResult === 'object' && 'error' in createResult) {
			throw new Error(`Failed to create student: ${createResult.error}`);
		}
		testStudent = true;

		await evalsPage.goto();
		await expect(evalsPage.page.getByText('Loading students...')).not.toBeVisible();

		await evalsPage.searchStudent(studentName.toLowerCase());
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('all', e2eTag);
	});

	test('shows error without category', async () => {
		const studentRow = evalsPage.page.getByRole('button', {
			name: new RegExp(studentName, 'i')
		});
		await expect(studentRow).toBeVisible();
		await studentRow.click();

		const submitButton = evalsPage.page.getByRole('button', {
			name: 'Submit Evaluation'
		});
		await expect(submitButton).toBeVisible();

		await submitButton.click();

		await expect(evalsPage.page.getByText(/Please select a category/i)).toBeVisible();
	});
});

test.describe('Evaluations - Submit Success', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let categoryName: string;
	let studentName: string;
	let testData = false;
	let evalsPage: NewEvaluationPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new NewEvaluationPage(page);
		useRole('teacher');
		testData = false;
		suffix = getTestSuffix('submit');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `SE_${suffix}`;
		categoryName = `TestCategory_${suffix}`;
		studentName = `Submit_${suffix}`;

		await createCategory({
			name: categoryName,
			e2eTag
		});

		await createStudent({
			studentId,
			englishName: studentName,
			chineseName: ' gönder',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;

		await evalsPage.goto();
		await expect(evalsPage.page.getByText('Loading students...')).not.toBeVisible();

		await evalsPage.searchStudent(studentName.toLowerCase());
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('successfully submits evaluation', async () => {
		const studentRow = evalsPage.page.getByRole('button', { name: studentName });
		await studentRow.click();
		await evalsPage.expectStudentSelected(studentName);

		await evalsPage.page.getByRole('button', { name: 'Select category' }).click();

		await expect(evalsPage.page.getByRole('option').first()).toBeVisible();

		await expect(evalsPage.page.getByRole('option', { name: categoryName })).toBeVisible();
		await evalsPage.page.getByRole('option', { name: categoryName }).click();

		const submitButton = evalsPage.page.getByRole('button', {
			name: /Submit Evaluation/i
		});
		await submitButton.click();

		await expect(evalsPage.page).toHaveURL('/evaluations');
	});
});

test.describe('Evaluations - UI Controls @sequential', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let e2eTag: string;
	let studentId: string;
	let englishName: string;
	let testData = false;
	let evalsPage: TeacherEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new TeacherEvaluationsPage(page);
		useRole('teacher');
		testData = false;
		suffix = getTestSuffix('evalUI');
		e2eTag = `e2e-test_${suffix}`;
		studentId = `STU_${suffix}`;
		englishName = `UIName_${suffix}`;

		await createStudentWithEvaluations({
			studentId,
			englishName,
			chineseName: ' ogrenci',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;

		await evalsPage.goto();
		await expect(evalsPage.page.getByText('Loading history...')).not.toBeVisible();
		await expect(evalsPage.page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('can navigate to student detail by clicking card', async () => {
		const card = evalsPage.page.getByRole('button', {
			name: `Evaluation for ${englishName}`
		});
		await expect(card).toBeVisible();

		await card.click();

		await expect(evalsPage.page).toHaveURL(/.*evaluations\/student\/.*/);
	});
});
