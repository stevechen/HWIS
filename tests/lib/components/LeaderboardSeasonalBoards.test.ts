import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LeaderboardChristmasWorkshop from '$lib/components/LeaderboardChristmasWorkshop.svelte';
import LeaderboardCnyLanternRow from '$lib/components/LeaderboardCnyLanternRow.svelte';

// TEMPORARY validation for the promoted seasonal boards (deleted after use).
const CATEGORIES = ['Academics', 'Service', 'Athletics', 'Citizenship'];

const HOUSES = [
	{
		house: 'Heracles',
		rank: 2,
		totalPoints: 1730,
		pointsByCategory: { Academics: 596, Service: 470, Athletics: 404, Citizenship: 260 },
		topContributors: [{ studentId: 'h1', englishName: 'Maya Patel', totalPoints: 191 }],
		growthOpportunities: [{ studentId: 'h9', englishName: 'Ben Ortiz', pointsLost: 21 }]
	},
	{
		house: 'Wukong',
		rank: 1,
		totalPoints: 2431,
		pointsByCategory: { Academics: 812, Service: 640, Athletics: 590, Citizenship: 389 },
		topContributors: [{ studentId: 'w1', englishName: 'Emily Chen', totalPoints: 214 }],
		growthOpportunities: [{ studentId: 'w9', englishName: 'Liam Walsh', pointsLost: 32 }]
	}
];

describe('seasonal boards promoted from prototype', () => {
	it('Christmas workshop renders the ledger and drops the glyph row', async () => {
		render(LeaderboardChristmasWorkshop, { houses: HOUSES, categories: CATEGORIES });
		await expect
			.element(page.getByRole('heading', { name: 'Santa’s Workshop Ledger' }))
			.toBeInTheDocument();
		await expect.element(page.getByText('2431')).toBeInTheDocument();
		await expect.element(page.getByText('1730')).toBeInTheDocument();
		await expect.element(page.getByText('Academics').first()).toBeInTheDocument();
		await expect.element(page.getByText('Emily Chen')).toBeInTheDocument();
		await expect.element(page.getByText('Needs a nudge').first()).toBeInTheDocument();
		await expect.element(page.getByRole('img', { name: 'Wukong crest' })).toBeInTheDocument();
		await expect.element(page.getByText(/🦌/u)).not.toBeInTheDocument();
	});

	it('CNY lantern row drops the glyph row and the visible house name', async () => {
		render(LeaderboardCnyLanternRow, { houses: HOUSES });
		await expect.element(page.getByRole('heading', { name: 'Lantern Row' })).toBeInTheDocument();
		await expect.element(page.getByText('2431')).toBeInTheDocument();
		await expect.element(page.getByText('1730')).toBeInTheDocument();
		await expect.element(page.getByText('Emily')).toBeInTheDocument();
		await expect.element(page.getByText(/🏮|🧨/u)).not.toBeInTheDocument();
		await expect.element(page.getByText('Wukong')).not.toBeInTheDocument();
		// The crescent is gone visually, but the house must stay announced.
		await expect
			.element(page.getByRole('img', { name: /Wukong: 2431 points, rank 1/ }))
			.toBeInTheDocument();
	});
});
