import { expect, type Page } from '@playwright/test';

export class NewEvaluationPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/evaluations/new');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('evaluations-new.search-input')).toBeVisible();
	}

	async searchStudent(text: string) {
		await this.page.getByTestId('evaluations-new.search-input').fill(text);
	}

	async selectStudent(name: string) {
		await this.page.getByTestId(`evaluations-new.student-row-${name}`).click();
	}

	async selectAll() {
		await this.page.getByTestId('evaluations-new.select-all').click();
	}

	async expectStudentSelected(name: string) {
		await expect(this.page.getByRole('button', { name: `Deselect ${name}` })).toBeVisible();
	}

	async selectCategory(name: string) {
		await this.page.getByTestId('evaluations-new.category-trigger').click();
		const option = this.page.getByRole('option', { name }).first();
		await expect(option).toBeVisible();
		await option.click();
	}

	async selectPoint(value: number) {
		await this.page.getByTestId(`evaluations-new.point-${value}`).click();
	}

	async fillDetails(text: string) {
		await this.page.getByTestId('evaluations-new.details').fill(text);
	}

	async submit() {
		await this.page.getByTestId('evaluations-new.submit-button').click();
	}

	async getValidationErrors() {
		return this.page.getByTestId('evaluations-new.errors').textContent();
	}

	async expectSubmitSuccess() {
		await expect(this.page).toHaveURL(/\/evaluations$/);
	}
}
