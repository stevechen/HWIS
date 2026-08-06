import { expect, type Page } from '@playwright/test';

export class HouseEventsDisplayPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/house-events/display');
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
