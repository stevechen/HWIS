import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockMutation = vi.fn().mockResolvedValue({});

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [
			{ board: 'houses', enabled: true, theme: 'default', themes: {}, updatedAt: 0 },
			{ board: 'classes', enabled: false, theme: 'christmas', themes: {}, updatedAt: 0 }
		],
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/thumbnail', () => ({
	captureBoardThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,FAKE')
}));

import LeaderboardsPage from '$src/routes/admin/leaderboards/+page.svelte';
import { captureBoardThumbnail } from '$lib/thumbnail';
import { themeLabel, type LeaderboardThemeId } from '$lib/leaderboard-themes';
import { useQuery } from 'convex-svelte';

const THEME_IDS: LeaderboardThemeId[] = [
	'default',
	'thanksgiving-1',
	'thanksgiving-2',
	'christmas',
	'cny'
];

describe('Admin Leaderboards Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(LeaderboardsPage);
		await expect
			.element(page.getByRole('heading', { name: 'Leaderboard Management' }))
			.toBeInTheDocument();
	});

	it('shows back to admin link', async () => {
		render(LeaderboardsPage);
		await expect.element(page.getByRole('link', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('renders both board cards with merged toggle pills', async () => {
		render(LeaderboardsPage);
		await expect.element(page.getByTestId('admin-leaderboards.card-houses')).toBeInTheDocument();
		await expect.element(page.getByTestId('admin-leaderboards.card-classes')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('admin-leaderboards.toggle-houses'))
			.toHaveTextContent('Enabled');
		await expect
			.element(page.getByTestId('admin-leaderboards.toggle-classes'))
			.toHaveTextContent('Disabled');
	});

	it('renders theme tiles for every theme of both boards', async () => {
		render(LeaderboardsPage);
		for (const board of ['houses', 'classes']) {
			for (const theme of ['default', 'thanksgiving-1', 'thanksgiving-2', 'christmas', 'cny']) {
				await expect
					.element(page.getByTestId(`admin-leaderboards.theme-tile-${board}-${theme}`))
					.toBeInTheDocument();
			}
		}
	});

	it('renders open buttons', async () => {
		render(LeaderboardsPage);
		await expect.element(page.getByTestId('admin-leaderboards.open-houses')).toBeInTheDocument();
		await expect.element(page.getByTestId('admin-leaderboards.open-classes')).toBeInTheDocument();
	});

	it('auto-captures a screenshot for every theme of both boards', async () => {
		render(LeaderboardsPage);
		for (const theme of THEME_IDS) {
			await expect
				.element(page.getByRole('img', { name: `${themeLabel(theme)} theme preview` }).first())
				.toBeInTheDocument();
		}
		expect(captureBoardThumbnail).toHaveBeenCalledWith(
			'/leaderboard/houses?display=1&theme=christmas'
		);
		expect(captureBoardThumbnail).toHaveBeenCalledWith(
			'/leaderboard/classes?display=1&theme=default'
		);
		expect(captureBoardThumbnail).toHaveBeenCalledTimes(10);
	});

	it('persists each captured screenshot to the config', async () => {
		render(LeaderboardsPage);
		await expect
			.element(page.getByRole('img', { name: 'Chinese New Year theme preview' }).first())
			.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(mockMutation).toHaveBeenCalledWith(expect.anything(), {
				board: 'houses',
				themeScreenshot: { theme: 'cny', url: 'data:image/png;base64,FAKE' }
			});
		});
		expect(mockMutation).toHaveBeenCalledTimes(10);
	});

	it('renders stored screenshots without re-capturing them', async () => {
		vi.mocked(useQuery).mockReturnValueOnce({
			data: [
				{
					board: 'houses',
					enabled: true,
					theme: 'default',
					themes: Object.fromEntries(
						THEME_IDS.map((t) => [t, `data:image/png;base64,STORED_${t}`])
					)
				}
			],
			isLoading: false,
			error: null
		} as never);
		render(LeaderboardsPage);
		await expect
			.element(page.getByRole('img', { name: 'Christmas theme preview' }))
			.toBeInTheDocument();
		expect(captureBoardThumbnail).not.toHaveBeenCalled();
	});

	it('opens the TV display URL in a new window', async () => {
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
		try {
			render(LeaderboardsPage);
			await page.getByTestId('admin-leaderboards.open-classes').click();
			expect(openSpy).toHaveBeenCalledWith(
				'/leaderboard/classes?display=1',
				'_blank',
				'noopener,noreferrer'
			);
		} finally {
			openSpy.mockRestore();
		}
	});

	it('shows a fallback tile when a capture fails', async () => {
		vi.mocked(captureBoardThumbnail).mockRejectedValueOnce(new Error('boom'));
		render(LeaderboardsPage);
		await expect
			.element(page.getByText('Preview unavailable', { exact: true }).first())
			.toBeInTheDocument();
		expect(mockMutation).not.toHaveBeenCalled();
	});
});
