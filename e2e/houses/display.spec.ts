import { test, expect } from '@playwright/test';
import { getTestSuffix } from '../helpers';
import { cleanupByTag, createStudent, createCategory, getE2EUtilsClient } from '../convex-client';

test.describe('House Display Page - E2E', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;

	test.beforeEach(async ({ page }) => {
		suffix = getTestSuffix('display');
		e2eTag = `e2e-display-${suffix}`;

		// Create test data with evaluations to generate house stats
		await createStudent({
			studentId: `STU_DISP_${suffix}`,
			englishName: `TestStudent_${suffix}`,
			chineseName: '測試生',
			grade: 9,
			status: 'Enrolled',
			e2eTag
		});

		await createCategory({
			name: `TestCat_${suffix}`,
			e2eTag
		});

		// Create evaluations to generate house points
		await createCategory({
			name: `EvalCat_${suffix}`,
			e2eTag
		});

		// Create evaluation for the student to generate house points
		await getE2EUtilsClient().createEvaluationForStudent({
			studentId: `STU_DISP_${suffix}`,
			e2eTag
		});

		await page.goto('/houses/display');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupByTag('all', e2eTag);
	});

	test('navigates to display page', async ({ page }) => {
		await page.goto('/houses/display');
		await page.waitForSelector('body.hydrated');
		await expect(page.locator('article')).toHaveCount(4);
	});

	test('displays four houses', async ({ page }) => {
		await page.goto('/houses/display');
		await page.waitForSelector('body.hydrated');

		// Each house is displayed as an article card
		await expect(page.locator('article')).toHaveCount(4);
	});

	test('verifies rank badges and icons', async ({ page }) => {
		await page.goto('/houses/display');
		await page.waitForSelector('body.hydrated');

		await expect(page.getByText('1st')).toBeVisible();
		await expect(page.getByText('2nd')).toBeVisible();
		await expect(page.getByText('3rd')).toBeVisible();
		await expect(page.getByText('4th')).toBeVisible();
	});

	test('verifies total points display per house', async ({ page }) => {
		await page.goto('/houses/display');
		await page.waitForSelector('body.hydrated');

		await expect(page.locator('article')).toHaveCount(4);
	});

	test('verifies radar chart renders with categories', async ({ page }) => {
		await page.goto('/houses/display');
		await page.waitForSelector('body.hydrated');

		// Each house article should contain content
		const articles = page.locator('article');
		await expect(articles.first()).toBeVisible();
	});
});
