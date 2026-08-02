import { test, expect } from './fixtures';
import { AdminUsersPage } from './pages';

test.describe('Users Page @users', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let usersPage: AdminUsersPage;

	test.beforeEach(async ({ page }) => {
		usersPage = new AdminUsersPage(page);
		await usersPage.goto();
		await expect(
			usersPage.page
				.getByRole('row')
				.filter({ hasNot: usersPage.page.getByRole('columnheader') })
				.first()
		).toBeVisible();
	});

	test('can open role dropdown', async () => {
		const roleDropdown = usersPage.page.getByRole('button', { name: /select role for/i }).nth(1);
		await expect(roleDropdown).toBeVisible();

		await roleDropdown.click();

		await expect(usersPage.page.getByRole('option', { name: 'Admin' })).toBeVisible();
		await expect(usersPage.page.getByRole('option', { name: 'Teacher' })).toBeVisible();
	});

	test('super option is hidden for admin users', async () => {
		const roleDropdown = usersPage.page.getByRole('button', { name: /select role for/i }).nth(1);
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
		await expect(
			usersPage.page
				.getByRole('row')
				.filter({ hasNot: usersPage.page.getByRole('columnheader') })
				.first()
		).toBeVisible();
	});

	test('super option is visible for super users', async () => {
		const roleDropdowns = usersPage.page.getByRole('button', {
			name: /select role for/i
		});

		const count = await roleDropdowns.count();
		let targetDropdown = null;

		for (let i = 0; i < count; i++) {
			const dropdown = roleDropdowns.nth(i);
			const isDisabled = await dropdown.isDisabled();
			if (!isDisabled) {
				targetDropdown = dropdown;
				break;
			}
		}

		if (!targetDropdown) {
			test.skip();
			return;
		}

		await targetDropdown.click();

		await expect(usersPage.page.getByRole('option', { name: 'Super User' })).toBeVisible();
	});
});
