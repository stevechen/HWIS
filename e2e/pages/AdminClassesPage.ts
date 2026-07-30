import { Page, expect } from '@playwright/test';

export class AdminClassesPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/admin/classes');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('admin-classes.grade-7.add-button')).toBeVisible({
			timeout: 10000
		});
	}

	async ensureGradeVisible(grade: number) {
		const checkbox = this.page.locator(`label:has-text("${grade}") input[type="checkbox"]`);
		await expect(checkbox).toBeVisible();
		if (!(await checkbox.isChecked())) {
			await checkbox.check();
			await this.page.waitForTimeout(300);
		}
	}

	async addClass(grade: number) {
		await this.page.getByTestId(`admin-classes.grade-${grade}.add-button`).click();
		// The add dialog is a native <dialog> with form method="dialog" and type="submit"
		// The Add Class button has type="submit" and onclick preventDefault + handleAdd()
		await this.page.getByTestId('admin-classes.add-dialog.submit').click();
		await expect(this.page.getByTestId('admin-classes.add-dialog.root')).not.toBeVisible({
			timeout: 10000
		});
	}

	async deleteClass(grade: number, className: string) {
		const classTestId = `admin-classes.grade-${grade}.class-${className}`;
		await this.page.getByTestId(`${classTestId}.delete`).click();
		await expect(this.page.getByTestId('admin-classes.warning-dialog')).toBeVisible();
		await this.page.getByTestId('admin-classes.warning-dialog.delete').click();
		await expect(this.page.getByTestId('admin-classes.warning-dialog')).not.toBeVisible();
	}

	async expectClassVisible(grade: number, className: string) {
		await expect(
			this.page.getByTestId(`admin-classes.grade-${grade}.class-${className}`)
		).toBeVisible();
	}

	async expectNoDeleteButton(grade: number, className: string) {
		await expect(
			this.page.getByTestId(`admin-classes.grade-${grade}.class-${className}.delete`)
		).not.toBeVisible();
	}

	async openWarningDialog(grade: number, className: string) {
		const classTestId = `admin-classes.grade-${grade}.class-${className}`;
		await this.page.getByTestId(`${classTestId}.delete`).click();
		await expect(this.page.getByTestId('admin-classes.warning-dialog')).toBeVisible();
	}

	async closeWarningDialog() {
		await this.page.getByTestId('admin-classes.warning-dialog.ok').click();
		await expect(this.page.getByTestId('admin-classes.warning-dialog')).not.toBeVisible();
	}

	async confirmDeleteInWarningDialog() {
		await this.page.getByTestId('admin-classes.warning-dialog.delete').click();
		await expect(this.page.getByTestId('admin-classes.warning-dialog')).not.toBeVisible();
	}

	async selectGrade(grade: number) {
		await this.page.getByTestId(`admin-classes.grade-${grade}.select-toggle`).click();
	}

	async expectStudentInClass(grade: number, className: string, studentName: string) {
		await expect(
			this.page.getByTestId(
				`admin-classes.grade-${grade}.class-${className}.student-${studentName}`
			)
		).toBeVisible();
	}

	async getDragHandle(grade: number, className: string, studentName: string) {
		return this.page.getByTestId(
			`admin-classes.grade-${grade}.class-${className}.student-${studentName}.drag-handle`
		);
	}

	async getDropZone(grade: number, className: string) {
		return this.page.getByTestId(`admin-classes.grade-${grade}.class-${className}`);
	}

	async expectCrossGradeDialog() {
		await expect(this.page.getByTestId('admin-classes.cross-grade-dialog')).toBeVisible();
		await this.page.getByTestId('admin-classes.cross-grade-dialog.ok').click();
		await expect(this.page.getByTestId('admin-classes.cross-grade-dialog')).not.toBeVisible();
	}
}
