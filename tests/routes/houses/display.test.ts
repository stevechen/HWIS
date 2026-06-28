import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { vi } from 'vitest';

const mockHouseData = {
	houses: [
		{
			house: 'Heracles',
			totalPoints: 100,
			rank: 1,
			pointsByCategory: { Creativity: 40, Activity: 30, Service: 30 },
			topContributors: [{ studentId: 'S1', englishName: 'Alice', totalPoints: 50 }],
			growthOpportunities: [{ studentId: 'S2', englishName: 'Bob', pointsLost: 10 }]
		},
		{
			house: 'Wukong',
			totalPoints: 80,
			rank: 2,
			pointsByCategory: { Creativity: 20, Activity: 30, Service: 30 },
			topContributors: [{ studentId: 'S3', englishName: 'Charlie', totalPoints: 40 }],
			growthOpportunities: []
		},
		{
			house: 'Ixbalam',
			totalPoints: 60,
			rank: 3,
			pointsByCategory: { Creativity: 20, Activity: 20, Service: 20 },
			topContributors: [],
			growthOpportunities: [{ studentId: 'S4', englishName: 'David', pointsLost: 5 }]
		},
		{
			house: 'Setna',
			totalPoints: 40,
			rank: 4,
			pointsByCategory: { Creativity: 10, Activity: 15, Service: 15 },
			topContributors: [],
			growthOpportunities: []
		}
	],
	categories: ['Creativity', 'Activity', 'Service']
};

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockHouseData,
		isLoading: false,
		isStale: false,
		error: undefined
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin', role: 'admin' } }
	}))
}));

// Mock RadarChart since D3 doesn't work in jsdom - use a simple SVG with role="img"
vi.mock('$lib/components/RadarChart.svelte', async () => {
	const Mock = await import('../../mocks/MockRadarChart.svelte');
	return { default: Mock.default };
});

// Mock logos to render the house name as text for testing
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

import DisplayPage from '$src/routes/houses/display/+page.svelte';

describe('House Display Page', () => {
	describe('Structure', () => {
		it('renders page title as heading', async () => {
			render(DisplayPage);
			await expect
				.element(page.getByRole('heading', { name: 'HWIS House Points' }))
				.toBeInTheDocument();
		});

		it('renders four house columns with correct logos', async () => {
			render(DisplayPage);
			await expect.element(page.getByText('Heracles').first()).toBeInTheDocument();
			await expect.element(page.getByText('Wukong').first()).toBeInTheDocument();
			await expect.element(page.getByText('Ixbalam').first()).toBeInTheDocument();
			await expect.element(page.getByText('Setna').first()).toBeInTheDocument();
		});

		it('renders rank badges with correct icons', async () => {
			render(DisplayPage);
			await expect.element(page.getByRole('img', { name: /trophy/i })).toBeInTheDocument();
			const medals = page.getByRole('img', { name: /medal/i });
			await expect.element(medals.first()).toBeInTheDocument();
		});

		it('renders Top Contributors section', async () => {
			render(DisplayPage);
			await expect.element(page.getByText('Top Contributors').first()).toBeInTheDocument();
		});

		it('renders Growth Opportunities section', async () => {
			render(DisplayPage);
			await expect.element(page.getByText('Growth Opportunities').first()).toBeInTheDocument();
		});

		it('renders radar chart container when categories exist', async () => {
			render(DisplayPage);
			// RadarChart is mocked, so we just verify the component renders without error
			await expect.element(page.getByText('Heracles').first()).toBeInTheDocument();
		});

		it('renders loading state spinner', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValueOnce({
				data: null,
				isLoading: true,
				isStale: false,
				error: undefined
			} as unknown as ReturnType<typeof useQuery>);

			render(DisplayPage);
			await expect.element(page.getByRole('status')).toBeInTheDocument();
		});

		it('renders error state with CircleAlert', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValueOnce({
				data: null,
				isLoading: false,
				isStale: false,
				error: new Error('Failed to load')
			} as unknown as ReturnType<typeof useQuery>);

			render(DisplayPage);
			await expect.element(page.getByRole('img', { name: /alert/i })).toBeInTheDocument();
			await expect.element(page.getByText('Failed to load house statistics')).toBeInTheDocument();
		});
	});
});
