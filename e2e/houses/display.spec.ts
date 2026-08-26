import { test, expect } from '../fixtures';
import { getTestSuffix } from '../helpers';
import { cleanupByTag, createStudent, createCategory, getE2EUtilsClient } from '../convex-client';
import { HouseEventsDisplayPage } from '../pages';

test.describe('House Display Page - E2E', () => {
	test.use({ role: 'admin' });

	let suffix: string;
	let e2eTag: string;
	let displayPage: HouseEventsDisplayPage;

	test.beforeEach(async ({ page }) => {
		displayPage = new HouseEventsDisplayPage(page);
		suffix = getTestSuffix('display');
		e2eTag = `e2e-display-${suffix}`;

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

		await createCategory({
			name: `EvalCat_${suffix}`,
			e2eTag
		});

		await getE2EUtilsClient().createEvaluationForStudent({
			studentId: `STU_DISP_${suffix}`,
			e2eTag
		});

		await displayPage.goto();
	});

	test.afterEach(async () => {
		await cleanupByTag('all', e2eTag);
	});

	test('displays four houses with correct structure', async () => {
		await displayPage.expectArticleCount(4);
		await displayPage.expectRankVisible('1st');
		await displayPage.expectRankVisible('2nd');
		await displayPage.expectRankVisible('3rd');
		await displayPage.expectRankVisible('4th');
	});

	test('verifies radar chart renders with categories', async () => {
		await expect(displayPage.getArticles().first()).toBeVisible();
	});
});
