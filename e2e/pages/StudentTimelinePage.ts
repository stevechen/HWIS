import { expect, type Page } from '@playwright/test';

export class StudentTimelinePage {
	constructor(public page: Page) {}

	async goto(studentId: string) {
		await this.page.goto(`/evaluations/student/${studentId}`);
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByText('Loading')).not.toBeVisible();
	}

	async waitForLoading() {
		await expect(this.page.getByTestId('evaluations-student.loading')).toBeHidden();
	}

	async expectHeaderContains(text: string) {
		await expect(this.page.getByTestId('layout.header-title')).toContainText(text);
	}

	getFirstEvaluationCard() {
		return this.page.locator('[data-testid^="evaluations-student.card-"]').first();
	}

	async longPressFirstCard() {
		const card = await this.getFirstEvaluationCard();
		await card.dispatchEvent('mousedown');
		await this.page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');
	}

	async shortPressFirstCard() {
		const card = await this.getFirstEvaluationCard();
		await card.dispatchEvent('mousedown');
		await this.page.waitForTimeout(200);
		await card.dispatchEvent('mouseup');
	}

	async expectEditDialogVisible() {
		await expect(this.page.getByTestId('evaluations-student.edit-dialog')).toBeVisible();
	}

	async expectEditDialogHidden() {
		await expect(this.page.getByTestId('evaluations-student.edit-dialog')).not.toBeVisible();
	}

	async expectDeleteDialogVisible() {
		await expect(this.page.getByTestId('evaluations-student.delete-dialog')).toBeVisible();
	}

	async expectDeleteDialogHidden() {
		await expect(this.page.getByTestId('evaluations-student.delete-dialog')).not.toBeVisible();
	}

	async clickPointButton(points: 1 | 2 | -1 | -2) {
		await this.page.getByTestId(`evaluations-student.edit-dialog.point-${points}`).click();
	}

	async clickSave() {
		await this.page.getByTestId('evaluations-student.edit-dialog.save').click();
	}

	async clickDeleteInEditDialog() {
		await this.page.getByTestId('evaluations-student.edit-dialog.delete').click();
	}

	async clickDeleteInDeleteDialog() {
		await this.page.getByTestId('evaluations-student.delete-dialog.delete').click();
	}

	async expectTimelineVisible() {
		await expect(this.page.getByTestId('evaluations-student.timeline')).toBeVisible();
	}

	async fillTeacherFilter(text: string) {
		await this.page.getByTestId('evaluations-student.filter-teacher').fill(text);
	}

	async expectScoreTally(text: string) {
		await expect(this.page.getByTestId('score-tally-bar').first()).toContainText(text);
	}

	async expectScoreTallyNotVisible() {
		await expect(this.page.getByTestId('score-tally-bar').first()).toBeHidden();
	}
}
