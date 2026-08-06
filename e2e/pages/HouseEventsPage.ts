import { expect, type Page } from '@playwright/test';

export class HouseEventsPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/house-events');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('house-events.new-event-button')).toBeVisible();
	}

	async startAddEvent() {
		await this.page.getByTestId('house-events.new-event-button').click();
		await expect(this.page.getByTestId('house-events.event-dialog')).toBeVisible();
	}

	async expectCreateMode() {
		await expect(this.page.getByTestId('house-events.event-dialog')).toBeVisible();
		await expect(this.page.getByRole('heading', { name: 'New House Event' })).toBeVisible();
		await expect(this.page.getByTestId('house-events.event-dialog.title-input')).toHaveValue('');
		await expect(this.page.getByTestId('house-events.event-dialog.start-date')).toHaveValue('');
		await expect(this.page.getByTestId('house-events.event-dialog.end-date')).toHaveValue('');
	}

	async fillEventForm(data: {
		title: string;
		startDate: string;
		endDate: string;
		points?: Record<string, string>;
	}) {
		await this.page.getByTestId('house-events.event-dialog.title-input').fill(data.title);
		await this.page.getByTestId('house-events.event-dialog.start-date').fill(data.startDate);
		await this.page.getByTestId('house-events.event-dialog.end-date').fill(data.endDate);

		if (data.points) {
			for (const [house, points] of Object.entries(data.points)) {
				await this.page.getByTestId(`house-events.event-dialog.points-${house}`).fill(points);
			}
		}
	}

	async submitEvent() {
		await this.page.getByTestId('house-events.event-dialog.submit').click();
		await expect(this.page.getByTestId('house-events.event-dialog')).not.toBeVisible();
	}

	async cancelEvent() {
		await this.page.getByTestId('house-events.event-dialog.cancel').click();
	}

	async editEvent(title: string) {
		await this.page.getByTestId(`house-events.event-card.${title}.edit`).click();
		await expect(this.page.getByTestId('house-events.event-dialog')).toBeVisible();
	}

	async deleteEvent(title: string) {
		await this.page.getByTestId(`house-events.event-card.${title}.delete`).click();
		await expect(this.page.getByTestId('house-events.delete-dialog')).toBeVisible();
		await this.page.getByTestId('house-events.delete-dialog.delete').click();
		await expect(this.page.getByTestId('house-events.delete-dialog')).not.toBeVisible();
	}

	async expectEventVisible(title: string) {
		await expect(this.page.getByTestId(`house-events.event-card.${title}`)).toBeVisible();
	}

	async expectEventNotVisible(title: string) {
		await expect(this.page.getByTestId(`house-events.event-card.${title}`)).not.toBeVisible();
	}
}
