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
		const evalCard = page.getByRole('button', { name: /Evaluation by/ });
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
		const evalCard = page.getByRole('button', { name: /Evaluation by/i });
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
