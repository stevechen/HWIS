import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
// The board's layout lives in Tailwind utility classes, which normally reach the
// page through the root layout (`app.css`). Rendering the route in isolation would
// leave every utility inert, so pull the stylesheet in before measuring geometry.
import '$src/app.css';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: {
			houses: [
				{
					house: 'Heracles',
					totalPoints: 100,
					rank: 1,
					pointsByCategory: { Creativity: 40 },
					topContributors: [
						{ studentId: 'S1', englishName: 'Alice', totalPoints: 110 },
						{ studentId: 'S2', englishName: 'Bob', totalPoints: 100 },
						{ studentId: 'S3', englishName: 'Carol', totalPoints: 90 },
						{ studentId: 'S4', englishName: 'Dave', totalPoints: 80 },
						{ studentId: 'S5', englishName: 'Erin', totalPoints: 70 },
						{ studentId: 'S6', englishName: 'Frank', totalPoints: 60 },
						{ studentId: 'S7', englishName: 'Grace', totalPoints: 50 },
						{ studentId: 'S8', englishName: 'Heidi', totalPoints: 40 },
						{ studentId: 'S9', englishName: 'Ivan', totalPoints: 30 },
						{ studentId: 'S10', englishName: 'Judy', totalPoints: 20 },
						// An 11th row exercises the card's own cap: the backend exposes
						// at most 10 contributors, so Karl must never render.
						{ studentId: 'S11', englishName: 'Karl', totalPoints: 10 }
					],
					growthOpportunities: []
				}
			],
			categories: ['Creativity']
		},
		isLoading: false,
		error: undefined
	})),
	useConvexClient: vi.fn(() => ({ mutation: vi.fn(), query: vi.fn() }))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test' } }
	}))
}));

vi.mock('$lib/viewer.svelte', async () => {
	const actual = await vi.importActual('$lib/viewer.svelte');
	return {
		...actual,
		useViewer: vi.fn(() => ({
			status: 'active',
			isApproved: true,
			isAdmin: true,
			viewer: { role: 'admin' }
		}))
	};
});

vi.mock('$lib/components/RadarChart.svelte', async () => {
	const Mock = await import('../../mocks/MockRadarChart.svelte');
	return { default: Mock.default };
});
vi.mock('$lib/components/LogoHeracles.svelte', async () => {
	const Mock = await import('../../mocks/MockLogoHeracles.svelte');
	return { default: Mock.default };
});
vi.mock('$lib/components/LogoWukong.svelte', async () => {
	const Mock = await import('../../mocks/MockLogoWukong.svelte');
	return { default: Mock.default };
});
vi.mock('$lib/components/LogoIxbalam.svelte', async () => {
	const Mock = await import('../../mocks/MockLogoIxbalam.svelte');
	return { default: Mock.default };
});
vi.mock('$lib/components/LogoSetna.svelte', async () => {
	const Mock = await import('../../mocks/MockLogoSetna.svelte');
	return { default: Mock.default };
});

import HousesPage from '$src/routes/leaderboard/houses/+page.svelte';

describe('Leaderboard Houses Route', () => {
	beforeEach(() => vi.clearAllMocks());

	it('renders at /leaderboard/houses', async () => {
		render(HousesPage);
		await expect.element(page.getByText('Heracles').first()).toBeInTheDocument();
	});

	it('renders contributors in rank order, capped at the backend limit', async () => {
		render(HousesPage);
		await expect.element(page.getByText('Alice')).toBeVisible();

		// Scoped to the contributors list so the activity feed outside the card
		// cannot be picked up. Whitespace is stripped so the assertion does not
		// depend on Svelte's whitespace handling between the points and name spans.
		const contributorLines = Array.from(
			document.querySelectorAll('[data-testid="houses.top-contributors"] > li')
		).map((el) => (el.textContent ?? '').replace(/\s+/g, ''));

		expect(contributorLines).toEqual([
			'+110Alice',
			'+100Bob',
			'+90Carol',
			'+80Dave',
			'+70Erin',
			'+60Frank',
			'+50Grace',
			'+40Heidi',
			'+30Ivan',
			'+20Judy'
		]);
		// The 11th fixture row sits beyond the backend's cap.
		expect(contributorLines).not.toContain('+10Karl');
	});

	it('fills the card and keeps its top and bottom insets equal', async () => {
		// Measure at the wall-display size the board is designed for; the default
		// 414x896 browser viewport hides how tight the cards get at 1080p.
		const defaultViewport = { width: window.innerWidth, height: window.innerHeight };
		await page.viewport(1920, 1080);

		render(HousesPage);
		await expect.element(page.getByText('Alice')).toBeVisible();

		const heading = document.querySelector<HTMLElement>(
			'[data-testid="houses.top-contributors-title"]'
		);
		const list = document.querySelector<HTMLElement>('[data-testid="houses.top-contributors"]');
		const card = document.querySelector<HTMLElement>('article');
		const grid = card?.parentElement ?? null;
		const section = document.querySelector<HTMLElement>('section');
		const panel = heading?.parentElement ?? null;

		if (!heading || !list || !card || !grid || !section || !panel) {
			throw new Error('houses board markup changed: expected grid, card, panel and list');
		}

		// Rows animate in via `slideInUp` (translateY(20px) → 0), which shifts
		// getBoundingClientRect. Wait for those entrance animations to settle so
		// the measurements describe the final layout instead of a mid-flight frame.
		await Promise.all(
			Array.from(list.children)
				.flatMap((row) => row.getAnimations())
				.map((animation) => animation.finished.catch(() => undefined))
		);

		// One row of cards: a `grid-rows-[auto_auto_1fr]` template on this board
		// leaves two empty row tracks whose gaps push the bottom margin away from
		// the top margin.
		expect(getComputedStyle(grid).gridTemplateRows.split(' ')).toHaveLength(1);
		const cardBox = card.getBoundingClientRect();
		expect(Math.abs(cardBox.bottom - grid.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);

		// The space above and below the cards inside the section is the same, so the
		// board is not lopsided on a wall display.
		const sectionBox = section.getBoundingClientRect();
		const topInset = cardBox.top - sectionBox.top;
		const bottomInset = sectionBox.bottom - cardBox.bottom;
		expect(Math.abs(topInset - bottomInset)).toBeLessThanOrEqual(1);

		// The last of the ten rows stops on the panel's padding edge. Without it the
		// rows overflow the `justify-between` list, run under the card border and the
		// final row is clipped by `overflow-hidden`.
		const paddingBottom = parseFloat(getComputedStyle(panel).paddingBottom);
		const panelBox = panel.getBoundingClientRect();
		const lastRow = list.lastElementChild;
		if (!lastRow) throw new Error('houses board markup changed: expected contributor rows');
		const lastRowBottom = lastRow.getBoundingClientRect().bottom;
		expect(panelBox.bottom - lastRowBottom).toBeGreaterThanOrEqual(paddingBottom - 1);
		expect(Math.abs(panelBox.bottom - paddingBottom - lastRowBottom)).toBeLessThanOrEqual(1);

		// Every row fits inside the list, and the rows share the list height
		// (`flex-1` + `min-h-0`) instead of keeping their intrinsic height. Intrinsic
		// rows plus `justify-between` are what pushed the tenth row under the card
		// border, where `overflow-hidden` clipped it.
		expect(list.classList.contains('justify-between')).toBe(false);
		const listBox = list.getBoundingClientRect();
		for (const row of list.children) {
			expect(row.classList.contains('flex-1')).toBe(true);
			expect(row.classList.contains('min-h-0')).toBe(true);
			const rowBox = row.getBoundingClientRect();
			expect(rowBox.top).toBeGreaterThanOrEqual(listBox.top - 1);
			expect(rowBox.bottom).toBeLessThanOrEqual(listBox.bottom + 1);
		}

		await page.viewport(defaultViewport.width, defaultViewport.height);
	});

	it('keeps the star on the same line as the centred heading', async () => {
		render(HousesPage);
		await expect.element(page.getByText('Alice')).toBeVisible();

		const heading = document.querySelector<HTMLElement>(
			'[data-testid="houses.top-contributors-title"]'
		);
		expect(heading?.textContent).toContain('Top Contributors');

		// A single centred row: `flex-col` would stack the star above the label.
		expect(heading?.classList.contains('flex-col')).toBe(false);
		expect(heading?.classList.contains('flex')).toBe(true);
		expect(heading?.classList.contains('items-center')).toBe(true);
		expect(heading?.classList.contains('justify-center')).toBe(true);

		// Star first, then the label, both inline in that row.
		expect(heading?.firstElementChild?.getAttribute('aria-label')).toBe('Star');
	});
});
