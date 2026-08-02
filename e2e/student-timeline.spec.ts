import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import {
	createStudentWithEvaluations,
	createCategory,
	cleanupByTag,
	useRole
} from './convex-client';
import { StudentTimelinePage } from './pages';

test.describe('Student Timeline Long-Press @timeline-longpress @sequential', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;
	let timelinePage: StudentTimelinePage;

	test.beforeEach(async ({ page }) => {
		timelinePage = new StudentTimelinePage(page);
		useRole('teacher');
		suffix = getTestSuffix('timelineLongpress');
		studentId = `STU_${suffix}`;
		englishName = `Student_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;

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

		await timelinePage.goto(studentId);
		await timelinePage.waitForLoading();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('page header displays student name', async () => {
		// Verify the header contains the student name, not the generic "My Evaluation"
		await timelinePage.expectHeaderContains(englishName);
		await timelinePage.expectHeaderContains('Evaluations');
		// Ensure it doesn't show the fallback "My Evaluation" text
		await expect(timelinePage.page.getByTestId('layout.header-title')).not.toContainText(
			'My Evaluation'
		);
	});

	test('long-press on evaluation card opens edit dialog', async () => {
		await timelinePage.longPressFirstCard();
		await timelinePage.expectEditDialogVisible();
	});
});

test.describe('Student Timeline Long-Press Admin @timeline-longpress @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;
	let timelinePage: StudentTimelinePage;

	test.beforeEach(async ({ page }) => {
		timelinePage = new StudentTimelinePage(page);
		useRole('admin');
		suffix = getTestSuffix('timelineLongpressAdmin');
		studentId = `STU_${suffix}`;
		englishName = `Student_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;

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

		await timelinePage.goto(studentId);
		await timelinePage.waitForLoading();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('admin can long-press on own evaluations', async () => {
		await timelinePage.longPressFirstCard();
		await timelinePage.expectEditDialogVisible();
	});

	test('can navigate away during long-press if not held long enough', async () => {
		await timelinePage.shortPressFirstCard();
		await timelinePage.expectEditDialogHidden();
	});
});

test.describe('Student Timeline Edit Dialog @timeline-longpress @sequential', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;
	let timelinePage: StudentTimelinePage;

	test.beforeEach(async ({ page }) => {
		timelinePage = new StudentTimelinePage(page);
		useRole('teacher');
		suffix = getTestSuffix('timelineEdit');
		studentId = `STU_${suffix}`;
		englishName = `Student_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;

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

		await timelinePage.goto(studentId);
		await timelinePage.waitForLoading();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('can edit evaluation details', async () => {
		await timelinePage.longPressFirstCard();
		await timelinePage.expectEditDialogVisible();
		await timelinePage.clickPointButton(2);
		await timelinePage.clickSave();
		await timelinePage.expectEditDialogHidden();
	});

	test('can delete evaluation via long-press', async () => {
		await timelinePage.longPressFirstCard();
		await timelinePage.expectEditDialogVisible();
		await timelinePage.clickDeleteInEditDialog();

		await timelinePage.expectDeleteDialogVisible();
		await timelinePage.clickDeleteInDeleteDialog();

		await timelinePage.expectDeleteDialogHidden();
		await expect(timelinePage.getFirstEvaluationCard()).not.toBeVisible();
	});
});

test.describe('Score Tally Bar @score-tally @sequential', () => {
	// Use admin auth to see all evaluations (not just teacher's own)
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;
	let timelinePage: StudentTimelinePage;

	test.beforeEach(async ({ page }) => {
		timelinePage = new StudentTimelinePage(page);
		useRole('admin');
		suffix = getTestSuffix('scoreTally');
		studentId = `STU_${suffix}`;
		englishName = `Student_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;

		await createCategory({
			name: `Cat_${suffix}`,
			e2eTag
		});

		// Create 4 evaluations to get expected tally: +5, -3, +10, +15 = +27/-3
		await createStudentWithEvaluations({
			studentId,
			englishName,
			chineseName: '學生',
			grade: 10,
			status: 'Enrolled',
			evaluationCount: 4, // Create 4 evaluations for the tally
			e2eTag
		});
		testData = true;

		await timelinePage.goto(studentId);
		await timelinePage.waitForLoading();
		await timelinePage.expectTimelineVisible();

		// Wait for evaluations to load - admin can see all evaluations
		await expect(timelinePage.getFirstEvaluationCard()).toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('displays score tally bar with correct totals', async () => {
		// Wait for the score tally bar to be visible with evaluations count
		// Note: Each evaluation has value=1, so 4 evaluations = +4 positive tally
		// ScoreTallyBar only shows non-zero tallies, so we only check for +4
		await timelinePage.expectScoreTally('+4');
	});

	test('score tally updates when filter is applied', async () => {
		// Initial totals should show +4 (4 evaluations with value=1 each)
		await timelinePage.expectScoreTally('+4');

		// Apply a filter that excludes all evaluations
		await timelinePage.fillTeacherFilter('NonExistentTeacher');

		// When filter excludes all evaluations, the tally bar shows nothing
		// because both positive and negative totals are 0 (hasScores = false)
		await timelinePage.expectScoreTallyNotVisible();
	});
});
