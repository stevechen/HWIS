import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockPage = vi.hoisted(() => ({
	url: new URL('http://localhost/leaderboard/houses')
}));

vi.mock('$app/state', () => ({
	get page() {
		return mockPage;
	}
}));

import LeaderboardLayout from '$src/routes/leaderboard/+layout.svelte';

describe('Leaderboard TV shell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPage.url = new URL('http://localhost/leaderboard/houses');
	});

	it('shows the fullscreen toggle in normal mode', async () => {
		render(LeaderboardLayout);
		await expect
			.element(page.getByRole('button', { name: 'Enter fullscreen' }))
			.toBeInTheDocument();
	});

	it('hides all chrome in display mode', async () => {
		mockPage.url = new URL('http://localhost/leaderboard/houses?display=1');
		render(LeaderboardLayout);
		await expect
			.element(page.getByRole('button', { name: 'Enter fullscreen' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Exit fullscreen' }))
			.not.toBeInTheDocument();
	});
});
