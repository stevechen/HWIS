import { test, expect } from '../fixtures';
import { getTestSuffix } from '../helpers';
import { cleanupByTag, createCategory, createHouseEvent } from '../convex-client';
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

		// The board renders RadarChart only while `getHouseStats().categories`
		// is non-empty ({#if categories.length > 0}); those names come from
		// point_categories, so seed two axes for the charts to draw.
		await createCategory({ name: `TestCat_${suffix}`, e2eTag });
		await createCategory({ name: `EvalCat_${suffix}`, e2eTag });

		// Seed house points via a house event: the display board aggregates
		// per-house points from house_events (fetchHouseStats), giving every
		// house a distinct, non-zero total (a student evaluation alone never
		// reaches the board — students without a house are skipped).
		await createHouseEvent({
			title: `Display Points ${suffix}`,
			startDate: Date.now() - 24 * 60 * 60 * 1000,
			endDate: Date.now() + 24 * 60 * 60 * 1000,
			housePoints: { Heracles: 10, Wukong: 8, Ixbalam: 6, Setna: 4 },
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

	test('verifies radar chart renders with categories', async ({ page }) => {
		await displayPage.expectArticleCount(4);

		const radarCharts = page.getByTestId('radar-chart');

		// Wait for Convex data to propagate and all house charts to render.
		await expect(radarCharts).toHaveCount(4, { timeout: 15_000 });

		const radarSvgs = radarCharts.locator('svg');
		await expect(radarSvgs).toHaveCount(4, { timeout: 15_000 });

		for (const article of await displayPage.getArticles().all()) {
			// RadarChart exposes a test id; use a descendant selector so the
			// assertion survives wrapper elements inside the container.
			const chartContainer = article.getByTestId('radar-chart');
			await expect(chartContainer).toBeVisible();

			const chart = chartContainer.locator('svg').first();
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
