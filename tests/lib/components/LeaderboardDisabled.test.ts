import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LeaderboardDisabled from '$lib/components/LeaderboardDisabled.svelte';

describe('LeaderboardDisabled', () => {
	it('announces the witty message through a live status region', async () => {
		render(LeaderboardDisabled, { boardLabel: 'House Points', theme: 'default' });
		const status = page.getByTestId('leaderboard-disabled');
		await expect.element(status).toBeInTheDocument();
		const live = page.getByRole('status');
		await expect.element(live).toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'The Great Hall is taking a nap…' }))
			.toBeInTheDocument();
	});

	it('shows the board label as not ready', async () => {
		render(LeaderboardDisabled, { boardLabel: 'Class Leaderboard', theme: 'default' });
		await expect.element(page.getByText('Class Leaderboard · not ready yet')).toBeInTheDocument();
	});

	it.each([
		{ theme: 'default', title: 'The Great Hall is taking a nap…' },
		{ theme: 'thanksgiving', title: 'The turkeys ate the scoreboard…' },
		{ theme: 'christmas', title: 'Santa is checking the list… twice' },
		{ theme: 'cny', title: 'The lions are dancing past the scoreboard…' }
	] as const)('renders the $theme witty title', async ({ theme, title }) => {
		render(LeaderboardDisabled, { boardLabel: 'House Points', theme });
		await expect.element(page.getByRole('heading', { name: title })).toBeInTheDocument();
	});

	it('renders ambient motion hidden from assistive tech', async () => {
		render(LeaderboardDisabled, { boardLabel: 'House Points', theme: 'christmas' });
		await expect.element(page.getByTestId('leaderboard-disabled-motes')).toBeInTheDocument();
	});
});
