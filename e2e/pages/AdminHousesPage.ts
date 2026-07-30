import { Page, expect } from '@playwright/test';

export class AdminHousesPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/admin/houses');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('admin-houses.root')).toBeVisible({ timeout: 10000 });
	}

	async getHouseColumn(house: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna') {
		return this.page.getByTestId(`admin-houses.house-${house}`);
	}

	async getOrphanedColumn() {
		return this.page.getByTestId('admin-houses.orphaned');
	}

	async expectHouseVisible(house: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna') {
		await expect(this.getHouseColumn(house)).toBeVisible();
	}

	async expectStudentInHouse(
		studentName: string,
		house: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna'
	) {
		await expect(
			this.getHouseColumn(house).getByTestId(`admin-houses.student-${studentName}`)
		).toBeVisible();
	}

	async expectStudentInOrphaned(studentName: string) {
		await expect(
			this.getOrphanedColumn().getByTestId(`admin-houses.student-${studentName}`)
		).toBeVisible();
	}

	async enterSelectionMode() {
		await this.page.getByTestId('admin-houses.select-toggle').click();
		await expect(this.page.getByTestId('admin-houses.bulk-targets')).toBeVisible();
	}

	async exitSelectionMode() {
		await this.page.getByTestId('admin-houses.select-toggle').click();
		await expect(this.page.getByTestId('admin-houses.bulk-targets')).not.toBeVisible();
	}

	async selectStudent(studentName: string) {
		const student = this.page.getByTestId(`admin-houses.student-${studentName}`);
		const checkbox = student.getByTestId(`admin-houses.student-${studentName}.checkbox`);
		await checkbox.check();
	}

	async bulkMoveToHouse(
		studentNames: string[],
		targetHouse: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna' | 'Unassigned'
	) {
		await this.enterSelectionMode();
		for (const name of studentNames) {
			await this.selectStudent(name);
		}
		const targetTestId =
			targetHouse === 'Unassigned'
				? 'admin-houses.bulk-target-orphaned'
				: `admin-houses.bulk-target-${targetHouse}`;
		await this.page.getByTestId(targetTestId).click();
	}

	async dragStudentToHouse(
		studentName: string,
		targetHouse: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna'
	) {
		const sourceStudent = this.page.getByTestId(`admin-houses.student-${studentName}`);
		const targetHouseEl = this.getHouseColumn(targetHouse);
		await sourceStudent.dragTo(targetHouseEl);
	}

	async expectMoveDialogVisible() {
		await expect(this.page.getByTestId('admin-houses.move-dialog.root')).toBeVisible();
		await expect(this.page.getByTestId('admin-houses.move-dialog.content')).toBeVisible();
	}

	async clickMoveDialogTarget(house: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna') {
		await this.page
			.getByTestId('admin-houses.move-dialog.content')
			.getByRole('button', { name: house })
			.click();
	}

	async clickMoveDialogCancel() {
		await this.page
			.getByTestId('admin-houses.move-dialog.content')
			.getByRole('button', { name: 'Cancel' })
			.click();
	}
}
