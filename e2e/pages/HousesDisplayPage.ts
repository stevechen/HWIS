import { Page, expect } from '@playwright/test';

export class HousesDisplayPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/houses/display');
		await this.page.waitForSelector('body.hydrated');
	}

	async expectArticleCount(count: number) {
		await expect(this.page.locator('article')).toHaveCount(count);
	}

	async expectRankVisible(rank: string) {
		await expect(this.page.getByText(rank)).toBeVisible();
	}

	getArticles() {
		return this.page.locator('article');
	}
}
