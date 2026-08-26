import { test, expect } from './fixtures';
import { AdminUsersPage } from './pages';

test.describe('Users Page @users', () => {
	test.use({ role: 'admin' });

	let usersPage: AdminUsersPage;

	test.beforeEach(async ({ page }) => {
		usersPage = new AdminUsersPage(page);
		await usersPage.goto();
		await expect(usersPage.page.getByRole('tab', { name: /Active/i }).first()).toBeVisible();
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

	test('renders staff emails instead of "No email" fallback', async () => {
		await usersPage.goToTab('Active');
		// Seeded staff users (e2e/setup.spec.ts) carry BetterAuth emails; the Admin
		// Users page should enrich and render them rather than falling back to "No email".
		// Regression guard for #57 (email BA-join keyed only on id).
		await expect(usersPage.page.getByText('super@hwis.test')).toBeVisible();
		await expect(usersPage.page.getByText('No email')).toHaveCount(0);
	});
});

test.describe('Users Page - Super User @users', () => {
	test.use({ role: 'super' });

	let usersPage: AdminUsersPage;

	test.beforeEach(async ({ page }) => {
		usersPage = new AdminUsersPage(page);
		await usersPage.goto();
		await expect(usersPage.page.getByRole('tab', { name: /Active/i }).first()).toBeVisible();
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
