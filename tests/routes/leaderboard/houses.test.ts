import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: {
			houses: [
				{
					house: 'Heracles',
					totalPoints: 100,
					rank: 1,
					pointsByCategory: { Creativity: 40 },
					topContributors: [{ studentId: 'S1', englishName: 'Alice', totalPoints: 50 }],
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
});
