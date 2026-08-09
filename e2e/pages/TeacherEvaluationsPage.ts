import { expect, type Page } from '@playwright/test';

export class TeacherEvaluationsPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/evaluations');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('evaluations.filter-student')).toBeVisible();
	}

	async filterByStudent(text: string) {
		await this.page.getByTestId('evaluations.filter-student').fill(text);
	}

	async clickNewButton() {
		await this.page.getByTestId('evaluations.new-button').click();
	}

	async waitForCard(name: string) {
		await expect(this.page.locator(`[aria-label="Evaluation for ${name}"]`)).toBeVisible();
	}

	async editEvaluation(studentName: string) {
		const card = this.page.locator(`[aria-label="Evaluation for ${studentName}"]`);
		await expect(card).toBeVisible();

		await this.page.waitForFunction(() => {
			const el = document.querySelector('[data-current-user-id]');
			const val = el?.getAttribute('data-current-user-id');
			return val && val !== 'undefined' && val !== '';
		});
		await expect(this.page.locator('[data-capabilities-ready="true"]')).toBeAttached();

		// Long-press the card by dispatching mousedown directly on the element.
		// The timeline's onmouseleave cancels the long-press timer, and the
		// reactive list re-sorts as parallel workers insert evaluations, so a
		// pointer held at fixed coordinates can slide off the card mid-hold and
		// cancel the gesture. Dispatching on the element is immune to re-ordering.
		await card.dispatchEvent('mousedown', { button: 0 });
		// The dialog assertion (not a fixed sleep) waits out the 500ms threshold.
		await expect(this.page.getByTestId('evaluations.edit-dialog')).toBeVisible();
		await card.dispatchEvent('mouseup').catch(() => undefined);
	}

	async deleteEvaluation() {
		await this.page.getByTestId('evaluations.edit-dialog.delete').click();
		await expect(this.page.getByTestId('evaluations.delete-dialog')).toBeVisible();
		await this.page.getByTestId('evaluations.delete-dialog.delete').click();
		await expect(this.page.getByTestId('evaluations.delete-dialog')).not.toBeVisible();
	}

	async isEditDialogVisible() {
		await expect(this.page.getByTestId('evaluations.edit-dialog')).toBeVisible();
	}

	async selectCategory(name: string) {
		await this.page.getByTestId('evaluations.edit-dialog.category').click();
		await expect(this.page.getByRole('option').first()).toBeVisible();
		await this.page.getByRole('option', { name }).click();
	}

	async selectPoint(value: string | number) {
		await this.page.getByTestId(`evaluations.edit-dialog.point-${value}`).click();
	}

	async fillDetails(text: string) {
		await this.page.getByTestId('evaluations.edit-dialog.details').fill(text);
	}

	async clickSave() {
		await this.page.getByTestId('evaluations.edit-dialog.save').click();
	}

	async clickCancel() {
		await this.page.getByTestId('evaluations.edit-dialog.cancel').click();
	}

	async clickDelete() {
		await this.page.getByTestId('evaluations.edit-dialog.delete').click();
	}

	async isDeleteDialogVisible() {
		await expect(this.page.getByTestId('evaluations.delete-dialog')).toBeVisible();
	}

	async clickDeleteConfirm() {
		await this.page.getByTestId('evaluations.delete-dialog.delete').click();
	}

	async clickDeleteCancel() {
		await this.page.getByTestId('evaluations.delete-dialog.cancel').click();
	}
}
