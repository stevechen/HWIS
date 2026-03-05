import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createStudentWithEvaluations,
	createCategory,
	cleanupByTag,
	useRole
} from './convex-client';

test.describe('Student Timeline Long-Press @timeline-longpress @sequential', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
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

		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading user data...')).not.toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('page header displays student name', async ({ page }) => {
		// Verify the header contains the student name, not the generic "My Evaluation"
		const header = page.locator('h1');
		await expect(header).toContainText(englishName);
		await expect(header).toContainText('Evaluations');
		// Ensure it doesn't show the fallback "My Evaluation" text
		await expect(header).not.toContainText('My Evaluation');
	});

	test('long-press on evaluation card opens edit dialog', async ({ page }) => {
		const evalCard = page.getByRole('button', { name: /Evaluation by/ });
		await expect(evalCard).toBeVisible();

		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
	});

	test('can navigate away during long-press if not held long enough', async ({ page }) => {
		const evalCard = page.getByRole('button', { name: /Evaluation by/ });
		await expect(evalCard).toBeVisible();

		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(200);
		await evalCard.dispatchEvent('mouseup');

		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).not.toBeVisible();
	});
});

test.describe('Student Timeline Long-Press Admin @timeline-longpress @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
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

		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading user data...')).not.toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('admin can long-press on own evaluations', async ({ page }) => {
		const evalCard = page.getByRole('button', { name: /Evaluation by/ });
		await expect(evalCard).toBeVisible();

		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
	});
});

test.describe('Student Timeline Edit Dialog @timeline-longpress @sequential', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
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

		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading user data...')).not.toBeVisible();
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('can edit evaluation details', async ({ page }) => {
		const evalCard = page.getByRole('button', { name: /Evaluation by/ }).first();
		await expect(evalCard).toBeVisible();

		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
		await page.getByRole('button', { name: /Award 2 points/i }).click();
		await page.getByRole('button', { name: /Save Changes/i }).click();
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('can delete evaluation via long-press', async ({ page }) => {
		const evalCard = page.getByRole('button', { name: /Evaluation by/i }).first();
		await expect(evalCard).toBeVisible();

		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
		await page.getByRole('button', { name: /Delete/i }).click();

		const dialog = page.getByRole('dialog', { name: /Delete Evaluation/i });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /Delete/i, exact: true }).click();

		await expect(page.getByRole('dialog', { name: /Delete Evaluation/i })).not.toBeVisible();
		await expect(evalCard).not.toBeVisible();
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

	test.beforeEach(async ({ page }) => {
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

		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading user data...')).not.toBeVisible();
		await expect(page.getByRole('region', { name: 'Evaluation' })).toBeVisible();

		// Wait for evaluations to load - admin can see all evaluations
		await expect(page.getByRole('button', { name: /Evaluation / }).first()).toBeVisible({
			timeout: 10000
		});
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('displays score tally bar with correct totals', async ({ page }) => {
		// Wait for evaluations to be fully loaded and stable
		// Use waitForFunction to ensure evaluations stay visible (not flash and disappear)
		// await page.waitForFunction(
		// 	() => {
		// 		const buttons = document.querySelectorAll('button');
		// 		return Array.from(buttons).some((b) => b.textContent?.includes('Evaluation by'));
		// 	},
		// 	{ timeout: 10000 }
		// );

		// Wait for the score tally bar to be visible with evaluations count
		// Note: Each evaluation has value=1, so 4 evaluations = +4 positive tally
		// ScoreTallyBar only shows non-zero tallies, so we only check for +4
		await expect(page.getByText('+4').first()).toBeVisible();
	});

	test('score tally updates when filter is applied', async ({ page }) => {
		// Wait for evaluations to be fully loaded and stable
		// await page.waitForFunction(
		// 	() => {
		// 		const buttons = document.querySelectorAll('button');
		// 		return Array.from(buttons).some((b) => b.textContent?.includes('Evaluation by'));
		// 	},
		// 	{ timeout: 10000 }
		// );

		// Initial totals should show +4 (4 evaluations with value=1 each)
		await expect(page.getByText('+4').first()).toBeVisible();

		// Apply a filter that excludes all evaluations
		const filterInput = page.getByPlaceholder('Filter by teacher(s)…');
		await filterInput.fill('NonExistentTeacher');

		// When filter excludes all evaluations, the tally bar shows nothing
		// because both positive and negative totals are 0 (hasScores = false)
		await expect(page.getByText('+4')).not.toBeVisible();
	});
});
