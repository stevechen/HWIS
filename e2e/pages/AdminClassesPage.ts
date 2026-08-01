import { expect, type Page } from '@playwright/test';

export class AdminClassesPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/classes');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('admin-classes.grade-7.add-button')).toBeVisible();
	}

	async ensureGradeVisible(grade: number) {
		const checkbox = this.page.locator(`label:has-text("${grade}") input[type="checkbox"]`);
		await expect(checkbox).toBeVisible();
		if (!(await checkbox.isChecked())) {
			await checkbox.check();
		}
	}

	async addClass(grade: number) {
		await this.page.getByTestId(`admin-classes.grade-${grade}.add-button`).click();
		// The add dialog is a native <dialog> with form method="dialog" and type="submit"
		// The Add Class button has type="submit" and onclick preventDefault + handleAdd()
		await this.page.getByTestId('admin-classes.add-dialog.submit').click();
		await expect(this.page.getByTestId('admin-classes.add-dialog.root')).not.toBeVisible();
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

	getDraggableStudent(studentName: string) {
		return this.page
			.locator('[role="button"][aria-label*="Move"]')
			.filter({ hasText: studentName });
	}

	getClassRegion(name: string) {
		return this.page.getByRole('region', { name });
	}

	async simulateDragAndDrop(sourceLabel: string, targetLabel: string) {
		return this.page.evaluate(
			({ sourceLabel, targetLabel }: { sourceLabel: string; targetLabel: string }) => {
				const source = Array.from(document.querySelectorAll('[role="button"]')).find(
					(el) =>
						el.textContent?.includes(sourceLabel) && el.getAttribute('aria-label')?.includes('Move')
				) as HTMLElement | undefined;
				const target = Array.from(document.querySelectorAll('[role="region"]')).find(
					(el) => el.getAttribute('aria-label') === targetLabel
				) as HTMLElement | undefined;
				if (!source || !target) return false;

				const dt = new DataTransfer();

				source.dispatchEvent(
					new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })
				);

				target.dispatchEvent(
					new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })
				);

				target.dispatchEvent(
					new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
				);

				target.dispatchEvent(
					new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
				);

				source.dispatchEvent(
					new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt })
				);

				return true;
			},
			{ sourceLabel, targetLabel }
		);
	}
}
