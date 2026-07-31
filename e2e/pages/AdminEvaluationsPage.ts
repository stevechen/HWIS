import { Page, expect } from '@playwright/test';

export class AdminEvaluationsPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/evaluations');
		await this.page.waitForSelector('body.hydrated');
		await this.expectTimelineOrEmptyVisible();
	}

	async expectTimelineVisible() {
		await expect(this.page.getByTestId('admin-evaluations.timeline')).toBeVisible();
	}

	async expectTimelineOrEmptyVisible() {
		const timeline = this.page.getByTestId('admin-evaluations.timeline');
		const emptyState = this.page.getByText('No evaluations found.');
		await expect(timeline.or(emptyState)).toBeVisible();
	}

	async expectLoadingHidden() {
		await expect(this.page.getByTestId('admin-evaluations.loading')).toBeHidden();
	}

	async expectErrorHidden() {
		await expect(this.page.getByTestId('admin-evaluations.error')).toBeHidden();
	}

	async expectNoMoreVisible() {
		await expect(this.page.getByTestId('admin-evaluations.no-more')).toBeVisible();
	}

	async expectEmptyStateVisible() {
		await expect(this.page.getByTestId('admin-evaluations.empty')).toBeVisible();
	}

	async fillStudentFilter(query: string) {
		await this.page.getByTestId('admin-evaluations.filter-student').fill(query);
	}

	async fillTeacherFilter(query: string) {
		await this.page.getByTestId('admin-evaluations.filter-teacher').fill(query);
	}

	getAllCards() {
		return this.page.locator('[data-testid^="admin-evaluations.card-"]');
	}

	async expectFirstCardVisible() {
		await expect(this.getAllCards().first()).toBeVisible();
	}

	async expectSecondCardVisible() {
		await expect(this.getAllCards().nth(1)).toBeVisible();
	}

	async expectCardCount(count: number) {
		await expect(this.getAllCards()).toHaveCount(count);
	}

	async expectCardNotVisible() {
		await expect(this.getAllCards().first()).not.toBeVisible();
	}

	async clickSortButton() {
		await this.page.getByTestId('admin-evaluations.sort').click();
	}

	async expectSortButton(text: string) {
		await expect(this.page.getByTestId('admin-evaluations.sort')).toHaveAttribute(
			'aria-label',
			text
		);
	}

	async scrollToBottom() {
		await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	}

	async waitForNoMore() {
		await expect(this.page.getByTestId('admin-evaluations.no-more')).toBeVisible();
	}
}
