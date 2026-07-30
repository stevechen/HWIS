import { Page, expect } from '@playwright/test';

export class AdminStudentsPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/admin/students');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('admin-students.search-input')).toBeVisible();
	}

	async addStudent(data: { studentId: string; englishName: string; chineseName: string }) {
		await this.page.getByTestId('admin-students.add-button').click();
		await expect(this.page.getByTestId('admin-students.dialog.root')).toBeVisible();

		await this.page.getByTestId('admin-students.dialog.student-id').fill(data.studentId);
		await this.page.getByTestId('admin-students.dialog.english-name').fill(data.englishName);
		await this.page.getByTestId('admin-students.dialog.chinese-name').fill(data.chineseName);

		// Wait for grade/class select options to load (dynamic async data from Convex)
		const gradeClassSelect = this.page.getByTestId('admin-students.dialog.grade-class');
		await gradeClassSelect.waitFor({ state: 'visible', timeout: 10000 });

		// Wait for actual options to be populated using web-first assertion
		await expect(async () => {
			const options = await gradeClassSelect.locator('option:not([disabled])').all();
			if (options.length <= 1) {
				throw new Error('Options not loaded yet');
			}
		}).toPass({ timeout: 20000 });

		await gradeClassSelect.selectOption('7-1');

		await this.page.getByTestId('admin-students.dialog.create-button').click();

		// Dialog should close on successful mutation
		await expect(this.page.getByTestId('admin-students.dialog.root')).not.toBeVisible({
			timeout: 20000
		});
	}

	async expectStudentVisible(studentId: string, name: string) {
		// Use data-student-id which uses the business key (studentId), not Convex _id
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await expect(row).toBeVisible();
		await expect(row).toContainText(name);
	}

	async editStudent(
		studentId: string,
		updates: Partial<{ englishName: string; chineseName: string }>
	) {
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await row.getByRole('button', { name: `Edit ${studentId}` }).click();
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
			updates.englishName || '',
			{ timeout: 20000 }
		);

		// Dialog should now be closed
		await expect(this.page.getByTestId('admin-students.dialog.root')).toHaveCount(0, {
			timeout: 5000
		});
	}

	async deleteStudent(studentId: string) {
		const row = this.page.locator(`[data-student-id="${studentId}"]`);
		await row.getByRole('button', { name: `Delete ${studentId}` }).click();
		await expect(this.page.getByRole('dialog')).toBeVisible();

		await this.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		await expect(this.page.getByRole('dialog')).toHaveCount(0);

		await expect(this.page.locator(`[data-student-id="${studentId}"]`)).not.toBeVisible();
	}
}
