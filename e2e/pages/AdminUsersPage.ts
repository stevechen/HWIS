import { Page, expect } from '@playwright/test';

export class AdminUsersPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/users');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('admin-users.root')).toBeVisible();
	}

	async expectUserVisible(userId: string, name: string) {
		await expect(this.page.getByTestId(`admin-users.row-${userId}`)).toBeVisible();
		await expect(this.page.getByTestId(`admin-users.row-${userId}`)).toContainText(name);
	}

	async expectUserNotVisible(userId: string) {
		await expect(this.page.getByTestId(`admin-users.row-${userId}`)).not.toBeVisible();
	}

	async updateUserRole(userId: string, role: 'super' | 'admin' | 'teacher') {
		await this.page.getByTestId(`admin-users.role-select-${userId}`).click();
		await this.page.getByRole('option', { name: role }).click();
	}

	async approveUser(userId: string) {
		await this.page.getByTestId(`admin-users.approve-${userId}`).click();
	}

	async removeUserAccess(userId: string) {
		await this.page.getByTestId(`admin-users.remove-access-${userId}`).click();
	}

	async expectUserRole(userId: string, role: string) {
		await expect(this.page.getByTestId(`admin-users.role-select-${userId}`)).toContainText(role);
	}

	async expectUserStatus(userId: string, status: 'active' | 'pending') {
		const badge = this.page.getByTestId(`admin-users.row-${userId}`).getByRole('status').first();
		await expect(badge).toContainText(status);
	}
}
