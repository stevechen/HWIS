import { expect, type Page } from '@playwright/test';

export class AdminUsersPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/users');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('admin-users.root')).toBeVisible();
	}

	async goToTab(tab: 'Pending' | 'Deactivated' | 'Active') {
		await this.page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
	}

	enabledRoleDropdowns() {
		return this.page.getByRole('button', { name: /select role for/i, disabled: false });
	}

	async expectUserVisible(userId: string, name: string) {
		await expect(this.page.getByTestId(`admin-users.card-${userId}`)).toBeVisible();
		await expect(this.page.getByTestId(`admin-users.card-${userId}`)).toContainText(name);
	}

	async expectUserNotVisible(userId: string) {
		await expect(this.page.getByTestId(`admin-users.card-${userId}`)).not.toBeVisible();
	}

	async updateUserRole(userId: string, role: 'super' | 'admin' | 'teacher') {
		await this.goToTab('Active');
		await this.page.getByTestId(`admin-users.role-select-${userId}`).click();
		await this.page.getByRole('option', { name: role }).click();
	}

	async approveUser(userId: string) {
		await this.goToTab('Pending');
		await this.page.getByTestId(`admin-users.approve-${userId}`).click();
	}

	async removeUserAccess(userId: string) {
		await this.goToTab('Active');
		await this.page.getByTestId(`admin-users.remove-access-${userId}`).click();
	}

	async expectUserRole(userId: string, role: string) {
		await this.goToTab('Active');
		await expect(this.page.getByTestId(`admin-users.role-select-${userId}`)).toContainText(role);
	}

	async expectUserStatus(userId: string, status: 'active' | 'pending') {
		await this.goToTab(status === 'active' ? 'Active' : 'Pending');
		await expect(this.page.getByTestId(`admin-users.card-${userId}`)).toBeVisible();
	}
}
