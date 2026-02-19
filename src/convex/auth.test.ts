import { describe, it, expect } from 'vitest';
import {
	isAllowedDomain,
	isExceptionEmail,
	getAuthenticatedUser,
	requireUserProfile,
	requireAuthenticatedUser,
	requireAdminRole
} from './auth';

describe('auth helpers', () => {
	it('isExceptionEmail returns true for configured exception', () => {
		expect(isExceptionEmail('steve.stevechen@gmail.com')).toBe(true);
	});

	it('isExceptionEmail returns false for non-exception email', () => {
		expect(isExceptionEmail('teacher@hwhs.tc.edu.tw')).toBe(false);
	});

	it('isAllowedDomain returns true for school domain', () => {
		expect(isAllowedDomain('teacher@hwhs.tc.edu.tw')).toBe(true);
	});

	it('isAllowedDomain returns false for non-school domain', () => {
		expect(isAllowedDomain('teacher@example.com')).toBe(false);
	});
});

describe('auth context helpers', () => {
	it('getAuthenticatedUser returns test admin for unit-test-token', async () => {
		const user = await getAuthenticatedUser({} as never, 'unit-test-token');
		expect(user).toMatchObject({
			authId: 'test_admin',
			role: 'admin',
			status: 'active'
		});
	});

	it('getAuthenticatedUser returns null when no auth context is available', async () => {
		const user = await getAuthenticatedUser({} as never);
		expect(user).toBeNull();
	});

	it('requireUserProfile returns test admin profile for unit-test-token', async () => {
		const user = await requireUserProfile({} as never, 'unit-test-token');
		expect(user.role).toBe('admin');
		expect(user.status).toBe('active');
	});

	it('requireAuthenticatedUser returns test admin profile for unit-test-token', async () => {
		const user = await requireAuthenticatedUser({} as never, 'unit-test-token');
		expect(user.role).toBe('admin');
	});

	it('requireAdminRole returns user for unit-test-token', async () => {
		const user = await requireAdminRole({} as never, 'unit-test-token');
		expect(user.role).toBe('admin');
	});

	it('requireAdminRole throws unauthorized without auth', async () => {
		await expect(requireAdminRole({} as never)).rejects.toThrowError('Unauthorized');
	});
});
