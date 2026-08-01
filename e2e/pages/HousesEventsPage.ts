import { expect, type Page } from '@playwright/test';

export class HousesEventsPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/houses');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('houses.new-event-button')).toBeVisible();
	}

	async startAddEvent() {
		await this.page.getByTestId('houses.new-event-button').click();
		await expect(this.page.getByTestId('houses.event-dialog')).toBeVisible();
	}

	async fillEventForm(data: {
		title: string;
		startDate: string;
		endDate: string;
		points?: Record<string, string>;
	}) {
		await this.page.getByTestId('houses.event-dialog.title-input').fill(data.title);
		await this.page.getByTestId('houses.event-dialog.start-date').fill(data.startDate);
		await this.page.getByTestId('houses.event-dialog.end-date').fill(data.endDate);

		if (data.points) {
			for (const [house, points] of Object.entries(data.points)) {
				await this.page.getByTestId(`houses.event-dialog.points-${house}`).fill(points);
			}
		}
	}

	async submitEvent() {
		await this.page.getByTestId('houses.event-dialog.submit').click();
		await expect(this.page.getByTestId('houses.event-dialog')).not.toBeVisible();
	}

	async cancelEvent() {
		await this.page.getByTestId('houses.event-dialog.cancel').click();
	}

	async editEvent(title: string) {
		await this.page.getByTestId(`houses.event-card.${title}.edit`).click();
		await expect(this.page.getByTestId('houses.event-dialog')).toBeVisible();
	}

	async deleteEvent(title: string) {
		await this.page.getByTestId(`houses.event-card.${title}.delete`).click();
		await expect(this.page.getByTestId('houses.delete-dialog')).toBeVisible();
		await this.page.getByTestId('houses.delete-dialog.delete').click();
		await expect(this.page.getByTestId('houses.delete-dialog')).not.toBeVisible();
	}

	async expectEventVisible(title: string) {
		await expect(this.page.getByTestId(`houses.event-card.${title}`)).toBeVisible();
	}

	async expectEventNotVisible(title: string) {
		await expect(this.page.getByTestId(`houses.event-card.${title}`)).not.toBeVisible();
	}
}
