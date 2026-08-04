import { test, expect } from './fixtures';
import { AdminUsersPage } from './pages';

test.describe('Users Page @users', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let usersPage: AdminUsersPage;

	test.beforeEach(async ({ page }) => {
		usersPage = new AdminUsersPage(page);
		await usersPage.goto();
		await expect(usersPage.page.getByRole('tab', { name: /Pending/i }).first()).toBeVisible();
	});

	test('can open role dropdown', async () => {
		await usersPage.goToTab('Active');
		const roleDropdown = usersPage.enabledRoleDropdowns().first();
		await expect(roleDropdown).toBeVisible();

		await roleDropdown.click();

		await expect(usersPage.page.getByRole('option', { name: 'Admin' })).toBeVisible();
		await expect(usersPage.page.getByRole('option', { name: 'Teacher' })).toBeVisible();
	});

	test('super option is hidden for admin users', async () => {
		await usersPage.goToTab('Active');
		const roleDropdown = usersPage.enabledRoleDropdowns().first();
		await expect(roleDropdown).toBeVisible();

		await roleDropdown.click();

		await expect(usersPage.page.getByRole('option', { name: 'Super User' })).not.toBeVisible();
	});
});

test.describe('Users Page - Super User @users', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	let usersPage: AdminUsersPage;

	test.beforeEach(async ({ page }) => {
		usersPage = new AdminUsersPage(page);
		await usersPage.goto();
		await expect(usersPage.page.getByRole('tab', { name: /Pending/i }).first()).toBeVisible();
	});

	test('super option is visible for super users', async () => {
		await usersPage.goToTab('Active');
		const targetDropdown = usersPage.enabledRoleDropdowns().first();

		if ((await targetDropdown.count()) === 0) {
			test.skip();
			return;
		}

		await targetDropdown.click();

		await expect(usersPage.page.getByRole('option', { name: 'Super User' })).toBeVisible();
	});
});
