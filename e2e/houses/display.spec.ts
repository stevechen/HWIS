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
		await displayPage.expectArticleCount(4);
		for (const article of await displayPage.getArticles().all()) {
			// RadarChart currently exposes no accessible name; scope its SVG to each card.
			const chart = article.locator('.radar-chart-container > svg');
			await expect(chart).toBeVisible();
			// A vertical SVG axis has a zero-width bounding box despite its visible stroke.
			await expect(chart.locator('line').first()).toBeAttached();
			await expect(
				chart
					.locator('text')
					.filter({ hasText: /^[A-Z]$/ })
					.first()
			).toBeVisible();
		}
	});

	test('displays four houses in the Lantern Row theme', async ({ page }) => {
		await displayPage.goto('cny');
		await expect(page.getByRole('heading', { name: 'Lantern Row', exact: true })).toBeVisible();
		const houses = page.getByRole('application').getByRole('img', {
			name: /^(Heracles|Wukong|Ixbalam|Setna): -?\d+ points, rank [1-4]$/
		});
		await expect(houses).toHaveCount(4);
		for (const house of ['Heracles', 'Wukong', 'Ixbalam', 'Setna']) {
			await expect(
				page.getByRole('application').getByRole('img', {
					name: new RegExp(`^${house}: -?\\d+ points, rank [1-4]$`)
				})
			).toBeVisible();
		}
	});
});
