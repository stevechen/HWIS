import type { Page } from '@playwright/test';

export type TestRole = 'admin' | 'super' | 'teacher';

const COOKIE_OPTIONS = {
	domain: 'localhost',
	path: '/',
	expires: -1,
	httpOnly: false,
	secure: false,
	sameSite: 'Lax' as const
};

export async function setTestAuth(page: Page, role: TestRole) {
	await page.context().addCookies([
		{
			name: 'hwis_test_auth',
			value: role,
			...COOKIE_OPTIONS
		}
	]);
}

export async function clearTestAuth(page: Page) {
	const cookies = await page.context().cookies();
	for (const cookie of cookies) {
		if (cookie.name === 'hwis_test_auth') {
			await page.context().clearCookies({ name: 'hwis_test_auth' });
			break;
		}
	}
}

export async function setTestAuthFromStorageState(page: Page) {
	await page.context().addCookies([
		{
			name: 'hwis_test_auth',
			value: 'true',
			...COOKIE_OPTIONS
		}
	]);
}

export function getTestRoleFromStorageState(storageState: string): TestRole {
	if (storageState.includes('super')) return 'super';
	if (storageState.includes('admin')) return 'admin';
	return 'teacher';
}
