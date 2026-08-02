import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isAllowedDomain,
	isExceptionEmail,
	getAllowlistedRole,
	getAuthenticatedUser,
	requireUserProfile,
	requireAuthenticatedUser,
	requireAdminRole,
	requireSuperRole
} from './auth';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import schema from './schema';

describe('auth helpers', () => {
	it('isExceptionEmail returns true for configured exception', () => {
		expect(isExceptionEmail('steve.stevechen@gmail.com')).toBe(true);
	});

	it('isExceptionEmail returns false for non-exception email', () => {
		expect(isExceptionEmail('teacher@hwhs.tc.edu.tw')).toBe(false);
	});

	it('getAllowlistedRole returns configured role per email', () => {
		expect(getAllowlistedRole('steve.stevechen@gmail.com')).toBe('super');
		expect(getAllowlistedRole('steve@hwhs.tc.edu.tw')).toBe('admin');
		expect(getAllowlistedRole('steve.homecook@gmail.com')).toBe('teacher');
		expect(getAllowlistedRole('teacher@hwhs.tc.edu.tw')).toBeNull();
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

describe('resolveAuthId resolution via getAuthenticatedUser', () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('resolves authId from the authId field when present', async () => {
		mockAuthUser({ authId: 'resolve-authid', name: 'AuthId User' });

		const user = await t.run((ctx) => getAuthenticatedUser(ctx));

		expect(user).toMatchObject({ authId: 'resolve-authid' });
	});

	it('falls back to the id field when authId is missing', async () => {
		const existingId = await seedUser(t, {
			authId: 'resolve-id',
			name: 'Id User',
			role: 'admin'
		});

		mockAuthUser({ id: 'resolve-id', name: 'Id User' });

		const user = await t.run((ctx) => getAuthenticatedUser(ctx));

		expect(user).toMatchObject({ _id: existingId, role: 'admin' });
	});

	it('falls back to a string _id when authId and id are missing', async () => {
		const existingId = await seedUser(t, {
			authId: 'resolve-string-id',
			name: 'StringId User',
			role: 'admin'
		});

		mockAuthUser({ _id: 'resolve-string-id', name: 'StringId User' });

		const user = await t.run((ctx) => getAuthenticatedUser(ctx));

		expect(user).toMatchObject({ _id: existingId, role: 'admin' });
	});

	it('returns the DB profile when an authId matches an existing user', async () => {
		const existingId = await seedUser(t, {
			authId: 'resolve-profile',
			name: 'Profile User',
			role: 'admin'
		});

		mockAuthUser({ authId: 'resolve-profile', name: 'Profile User' });

		const user = await t.run((ctx) => getAuthenticatedUser(ctx));

		expect(user).toMatchObject({
			_id: existingId,
			role: 'admin',
			status: 'active'
		});
	});

	it('returns the raw user object when no DB profile matches', async () => {
		mockAuthUser({ email: 'someone@example.com' });

		const user = await t.run((ctx) => getAuthenticatedUser(ctx));

		expect(user).toMatchObject({ email: 'someone@example.com' });
	});

	it('returns null when getAuthUser yields no user', async () => {
		mockAuthUser(null);

		const user = await t.run((ctx) => getAuthenticatedUser(ctx));

		expect(user).toBeNull();
	});
});

describe('role-gate denial paths', () => {
	afterEach(() => vi.restoreAllMocks());

	it('requireAdminRole throws for a teacher profile', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'teacher-role-test', name: 'Plain Teacher' });
		mockAuthUser({ authId: 'teacher-role-test', name: 'Plain Teacher' });

		await expect(t.run((ctx) => requireAdminRole(ctx))).rejects.toThrow(
			'Forbidden: Admin or super role required'
		);
	});

	it('requireSuperRole throws for an admin profile', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-role-test', name: 'Plain Admin', role: 'admin' });
		mockAuthUser({ authId: 'admin-role-test', name: 'Plain Admin' });

		await expect(t.run((ctx) => requireSuperRole(ctx))).rejects.toThrow(
			'Forbidden: Super role required'
		);
	});

	it('requireSuperRole throws for a teacher profile', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'teacher-super-test', name: 'Plain Teacher' });
		mockAuthUser({ authId: 'teacher-super-test', name: 'Plain Teacher' });

		await expect(t.run((ctx) => requireSuperRole(ctx))).rejects.toThrow(
			'Forbidden: Super role required'
		);
	});

	it('requireAdminRole passes for an admin profile', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-pass-test', name: 'Real Admin', role: 'admin' });
		mockAuthUser({ authId: 'admin-pass-test', name: 'Real Admin' });

		const user = await t.run((ctx) => requireAdminRole(ctx));
		expect(user).toMatchObject({ authId: 'admin-pass-test', role: 'admin' });
	});
});
