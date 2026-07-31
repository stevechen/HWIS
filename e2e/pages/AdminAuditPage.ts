import { Page, expect } from '@playwright/test';

export class AdminAuditPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/audit');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('audit.columns-control')).toBeVisible();
	}

	async resetColumnVisibility() {
		await this.page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});
	}

	async openColumnSelector() {
		await this.page.getByTestId('audit.columns-control').click();
		await expect(this.page.getByRole('menu', { name: 'Available columns' })).toBeVisible();
	}

	async closeColumnSelector() {
		await this.page.keyboard.press('Escape');
	}

	async toggleColumn(columnKey: string, visible: boolean) {
		const checkbox = this.page.getByTestId(`audit.column-toggle.${columnKey}`);
		const isChecked = await checkbox.isChecked();
		if (isChecked !== visible) {
			await checkbox.click();
		}
	}

	async expectColumnVisible(columnKey: string, visible: boolean) {
		const header = this.page.getByTestId(`audit.column-header.${columnKey}`);
		if (visible) {
			await expect(header).toBeVisible();
		} else {
			await expect(header).not.toBeVisible();
		}
	}

	async fillStudentFilter(name: string) {
		await this.page.getByTestId('audit.filter-student').fill(name);
	}

	async fillIdFilter(id: string) {
		await this.page.getByTestId('audit.filter-id').fill(id);
	}

	async fillTeacherFilter(teacher: string) {
		await this.page.getByTestId('audit.filter-teacher').fill(teacher);
	}

	async selectGradeFilter(grade: string) {
		await this.page.getByTestId('audit.filter-grade').selectOption(grade);
	}

	async clearFilters() {
		await this.page.getByTestId('audit.clear-filters').click();
	}

	async expectTableRowCount(count: number) {
		await expect(this.page.locator('tbody tr')).toHaveCount(count);
	}

	async expectLogVisible(text: string) {
		await expect(this.page.getByText(text)).toBeVisible();
	}
}
