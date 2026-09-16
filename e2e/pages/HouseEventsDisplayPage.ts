import { expect, type Page } from '@playwright/test';
import type { LeaderboardThemeId } from '../../src/lib/leaderboard-themes';

export class HouseEventsDisplayPage {
	constructor(public page: Page) {}

	async goto(theme: LeaderboardThemeId = 'default') {
		await this.page.goto(`/leaderboard/houses?theme=${theme}`);
		await expect(this.page.locator('body')).toHaveClass(/\bhydrated\b/);
	}

	async expectArticleCount(count: number) {
		await expect(this.getArticles()).toHaveCount(count);
	}

	async expectRankVisible(rank: string) {
		await expect(this.page.getByText(rank, { exact: true })).toBeVisible();
	}

	getArticles() {
		return this.page.getByRole('application').getByRole('article');
	}
}
