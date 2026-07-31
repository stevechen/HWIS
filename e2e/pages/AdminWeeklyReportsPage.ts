import { Page, expect } from '@playwright/test';
import { NewEvaluationPage } from './NewEvaluationPage';

export class AdminWeeklyReportsPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/admin/weekly-reports');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('weekly-reports.root')).toBeVisible();
	}

	async waitForReportsToLoad() {
		await expect(this.page.getByTestId('weekly-reports.loading')).toBeHidden();
	}

	async expectTableVisible() {
		await expect(this.page.getByTestId('weekly-reports.table')).toBeVisible();
	}

	async getRowCount(): Promise<number> {
		const rows = this.page.locator('tbody tr');
		return await rows.count();
	}

	async openFirstReport() {
		await this.expectTableVisible();
		await this.page.locator('[data-testid^="weekly-reports.row."]').first().click();
		await expect(this.page.getByTestId('weekly-reports.dialog')).toBeVisible();
		await expect(this.page.getByTestId('weekly-reports.dialog.loading')).toBeHidden();
	}

	async expectDialogVisible() {
		await expect(this.page.getByTestId('weekly-reports.dialog')).toBeVisible();
	}

	async expectDialogHidden() {
		await expect(this.page.getByTestId('weekly-reports.dialog')).not.toBeVisible();
	}

	async fillFilterId(id: string) {
		await this.page.getByTestId('weekly-reports.dialog.filter-id').fill(id);
	}

	async fillFilterName(name: string) {
		await this.page.getByTestId('weekly-reports.dialog.filter-name').fill(name);
	}

	async selectFilterGrade(grade: string) {
		await this.page.getByTestId('weekly-reports.dialog.filter-grade').selectOption(grade);
	}

	async sortByName() {
		await this.page.getByTestId('weekly-reports.dialog.sort-name').click();
	}

	async sortByGrade() {
		await this.page.getByTestId('weekly-reports.dialog.sort-grade').click();
	}

	async sortByStudentId() {
		await this.page.getByTestId('weekly-reports.dialog.sort-id').click();
	}

	async exportToCsv() {
		await this.page.getByTestId('weekly-reports.dialog.export-button').click();
	}

	async closeWithXButton() {
		await this.page.getByTestId('weekly-reports.dialog.close-x').click();
	}

	async closeWithCloseButton() {
		await this.page.getByTestId('weekly-reports.dialog.close-button').click();
	}

	async closeWithEscape() {
		await this.page.keyboard.press('Escape');
	}

	async expectStudentNameColumnVisible() {
		await expect(this.page.getByTestId('weekly-reports.dialog.sort-name')).toBeVisible();
	}

	// Navigate to evaluation form to create an evaluation
	async gotoNewEvaluation() {
		await this.page.goto('/evaluations/new');
		await this.page.waitForSelector('body.hydrated');
		return new NewEvaluationPage(this.page);
	}

	async expectLoadingHidden() {
		await expect(this.page.getByTestId('weekly-reports.loading')).toBeHidden();
	}
}
