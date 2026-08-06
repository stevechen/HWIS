import { expect, type Page } from '@playwright/test';

export class AdminStudentsPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/students');
		await this.page.waitForSelector('body.hydrated');
		// Wait for either the search input (admin) or the page content (teacher)
		await this.page.waitForSelector(
			'[data-testid="admin-students.search-input"], [data-testid="admin-students"]',
			{
				state: 'visible'
			}
		);
	}

	async addStudent(data: { studentId: string; englishName: string; chineseName: string }) {
		await this.page.getByTestId('admin-students.add-button').click();
		await expect(this.page.getByTestId('admin-students.dialog.root')).toBeVisible();

		await this.page.getByTestId('admin-students.dialog.student-id').fill(data.studentId);
		await this.page.getByTestId('admin-students.dialog.english-name').fill(data.englishName);
		await this.page.getByTestId('admin-students.dialog.chinese-name').fill(data.chineseName);

		// Wait for grade/class select options to load (dynamic async data from Convex)
		const gradeClassSelect = this.page.getByTestId('admin-students.dialog.grade-class');
		await gradeClassSelect.waitFor({ state: 'visible' });

		// Wait for actual options to be populated using web-first assertion
		await expect(async () => {
			const options = await gradeClassSelect.locator('option:not([disabled])').all();
			if (options.length <= 1) {
				throw new Error('Options not loaded yet');
			}
		}).toPass();

		await gradeClassSelect.selectOption('7-1');

		await this.page.getByTestId('admin-students.dialog.create-button').click();

		// Dialog should close on successful mutation
		await expect(this.page.getByTestId('admin-students.dialog.root')).not.toBeVisible();
	}

	async expectStudentVisible(studentId: string, name: string) {
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await expect(row).toBeVisible();
		await expect(row).toContainText(name);
	}

	async editStudent(
		studentId: string,
		updates: Partial<{ englishName: string; chineseName: string }>
	) {
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await row.getByTestId(`admin-students.student-row-${studentId}.edit`).click();
		await expect(this.page.getByTestId('admin-students.dialog.root')).toBeVisible();

		if (updates.englishName) {
			await this.page.getByTestId('admin-students.dialog.english-name').fill(updates.englishName);
		}
		if (updates.chineseName) {
			await this.page.getByTestId('admin-students.dialog.chinese-name').fill(updates.chineseName);
		}

		await this.page.getByTestId('admin-students.dialog.create-button').click();

		// Wait for updated student to appear in the list
		await expect(this.page.locator(`[data-student-id="${studentId}"]`)).toContainText(
			updates.englishName || ''
		);

		// Dialog should now be closed
		await expect(this.page.getByTestId('admin-students.dialog.root')).toHaveCount(0);
	}

	async deleteStudent(studentId: string) {
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await row.getByTestId(`admin-students.student-row-${studentId}.delete`).click();
		await expect(this.page.getByTestId('admin-students.delete-dialog')).toBeVisible();

		await this.page.getByTestId('admin-students.delete-dialog.delete').click();
		await expect(this.page.getByTestId('admin-students.delete-dialog')).toHaveCount(0);

		await expect(this.page.locator(`[data-student-id="${studentId}"]`)).not.toBeVisible();
	}

	async deleteStudentWithCascade(studentId: string) {
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await row.getByTestId(`admin-students.student-row-${studentId}.delete`).click();
		await expect(this.page.getByTestId('admin-students.delete-dialog')).toBeVisible();

		// Wait for cascade UI to appear
		await expect(this.page.getByTestId('admin-students.delete-dialog.delete-anyway')).toBeVisible();

		await this.page.getByTestId('admin-students.delete-dialog.delete-anyway').click();
		await expect(this.page.getByTestId('admin-students.delete-dialog')).toHaveCount(0);

		await expect(this.page.locator(`[data-student-id="${studentId}"]`)).not.toBeVisible();
	}

	async setStudentStatusViaDialog(studentId: string, status: string) {
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await row.getByTestId(`admin-students.student-row-${studentId}.edit`).click();
		await expect(this.page.getByTestId('admin-students.dialog.root')).toBeVisible();

		await this.page.getByTestId('admin-students.dialog.status').selectOption(status);
		await this.page.getByTestId('admin-students.dialog.create-button').click();

		// Wait for dialog to close
		await expect(this.page.getByTestId('admin-students.dialog.root')).toHaveCount(0);
	}

	async toggleStudentStatus(studentId: string) {
		await this.page
			.getByTestId(`admin-students.student-row-${studentId}.status`)
			.click({ force: true });
	}

	async expectLoadingHidden() {
		await expect(this.page.getByText('Loading students...')).not.toBeVisible();
	}

	async clearFilters() {
		const gradeFilter = this.page.getByTestId('admin-students.filter-grade');
		if (await gradeFilter.isVisible()) {
			await gradeFilter.selectOption('');
		}
		const houseFilter = this.page.getByTestId('admin-students.filter-house');
		if (await houseFilter.isVisible()) {
			await houseFilter.selectOption('');
		}
		const statusFilter = this.page.getByTestId('admin-students.filter-status');
		if (await statusFilter.isVisible()) {
			await statusFilter.selectOption('');
		}
		await this.page.getByTestId('admin-students.search-input').fill('');
	}

	async expectStudentRowNotVisible(studentId: string) {
		await expect(this.page.locator(`[data-student-id="${studentId}"]`)).not.toBeVisible();
	}

	async expectAddButtonVisible() {
		await expect(this.page.getByTestId('admin-students.add-button')).toBeVisible();
	}

	async expectImportButtonVisible() {
		await expect(this.page.getByTestId('admin-students.import-button')).toBeVisible();
	}

	async expectAddButtonHidden() {
		await expect(this.page.getByTestId('admin-students.add-button')).not.toBeVisible();
	}

	async expectImportButtonHidden() {
		await expect(this.page.getByTestId('admin-students.import-button')).not.toBeVisible();
	}

	async expectDeleteButtonHidden() {
		await expect(
			this.page.locator('[data-testid^="admin-students.student-row-"].delete')
		).not.toBeVisible();
	}

	async expectNotEnrolledButtonHidden() {
		await expect(
			this.page.locator('[data-testid^="admin-students.student-row-"].delete')
		).not.toBeVisible();
	}

	async fillSearch(query: string) {
		await this.page.getByTestId('admin-students.search-input').fill(query);
	}

	async expectStudentRowVisible(studentId: string) {
		await expect(this.page.locator(`[data-student-id="${studentId}"]`)).toBeVisible();
	}

	async expectStudentStatus(studentId: string, status: string) {
		await expect(
			this.page.getByTestId(`admin-students.student-row-${studentId}.status`)
		).toHaveAttribute('aria-label', status);
	}

	async filterByStatus(status: string) {
		await this.page.getByRole('combobox', { name: /filter by status/i }).selectOption(status);
	}

	async filterByGrade(grade: string) {
		await this.page.getByRole('combobox', { name: /filter by grade/i }).selectOption(grade);
	}

	async expectStudentNameVisible(name: string) {
		await expect(this.page.getByText(name)).toBeVisible();
	}

	async expectStudentNameNotVisible(name: string) {
		await expect(this.page.getByText(name)).not.toBeVisible();
	}
}
