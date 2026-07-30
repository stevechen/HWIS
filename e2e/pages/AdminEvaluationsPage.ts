import { Page, expect } from '@playwright/test';

export class AdminEvaluationsPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/admin/evaluations');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('admin-evaluations.filter-student')).toBeVisible();
	}

	async filterByStudent(text: string) {
		await this.page.getByTestId('admin-evaluations.filter-student').fill(text);
	}

	async filterByTeacher(text: string) {
		await this.page.getByTestId('admin-evaluations.filter-teacher').fill(text);
	}

	async toggleSort() {
		await this.page.getByTestId('admin-evaluations.sort').click();
	}

	async toggleShowUnenrolled() {
		await this.page.getByTestId('admin-evaluations.unenrolled').click();
	}

	async toggleShowDetails() {
		await this.page.getByTestId('admin-evaluations.details').click();
	}

	async toggleTeacherName() {
		await this.page.getByTestId('admin-evaluations.toggle-teacher-name').click();
	}

	async getStudentNames(): Promise<string[]> {
		const cards = this.page.getByTestId(/^admin-evaluations\.card-/);
		return cards.evaluateAll((elements) =>
			elements.map((el) => el.getAttribute('aria-label')?.replace('Evaluation for ', '') ?? '')
		);
	}

	async waitForCard(name: string) {
		await expect(this.page.getByRole('button', { name: `Evaluation for ${name}` })).toBeVisible();
	}

	async waitForNoMoreEvaluations() {
		await expect(this.page.getByTestId('admin-evaluations.no-more')).toBeVisible();
	}

	async scrollToBottom() {
		await this.page.getByTestId('admin-evaluations.sentinel').scrollIntoViewIfNeeded();
	}

	async expectCardVisible(name: string) {
		await expect(this.page.getByRole('button', { name: `Evaluation for ${name}` })).toBeVisible();
	}

	async expectCardNotVisible(name: string) {
		await expect(
			this.page.getByRole('button', { name: `Evaluation for ${name}` })
		).not.toBeVisible();
	}
}
