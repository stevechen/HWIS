import { describe, it, expect, vi, afterEach } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import { authComponent } from './auth';

function mockAuthUser(user: { authId?: string; name?: string; email?: string } | null) {
	vi.spyOn(authComponent, 'getAuthUser').mockResolvedValue(user as never);
}

describe('onboarding.ensureUserProfile', () => {
	afterEach(() => vi.restoreAllMocks());

	it('throws when not authenticated', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser(null);

		await expect(t.mutation(api.onboarding.ensureUserProfile, {})).rejects.toThrow(
			'Not authenticated'
		);
	});

	it('creates a pending teacher profile for a non-allowlisted email', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({
			authId: 'teacher-email@example.com',
			name: 'New Teacher',
			email: 'teacher-email@example.com'
		});

		const result = await t.mutation(api.onboarding.ensureUserProfile, {});

		expect(result).toEqual({ created: true, role: 'teacher', status: 'pending' });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({
			authId: 'teacher-email@example.com',
			role: 'teacher',
			status: 'pending'
		});
	});

	it('creates an active super profile for an allowlisted email', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({
			authId: 'steve.stevechen@gmail.com',
			name: 'Steve',
			email: 'steve.stevechen@gmail.com'
		});

		const result = await t.mutation(api.onboarding.ensureUserProfile, {});

		expect(result).toEqual({ created: true, role: 'super', status: 'active' });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users[0]).toMatchObject({ role: 'super', status: 'active' });
	});

	it('self-heals an existing user profile with the allowlisted role', async () => {
		const t = convexTest(schema, modules);

		await t.run((ctx) =>
			ctx.db.insert('users', {
				authId: 'steve@hwhs.tc.edu.tw',
				name: 'Old Name',
				role: 'teacher',
				status: 'pending'
			})
		);

		mockAuthUser({
			authId: 'steve@hwhs.tc.edu.tw',
			name: 'Steve Updated',
			email: 'steve@hwhs.tc.edu.tw'
		});

		const result = await t.mutation(api.onboarding.ensureUserProfile, {});

		expect(result).toEqual({ created: false, role: 'admin', status: 'active' });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users[0]).toMatchObject({ role: 'admin', status: 'active' });
	});
});

describe('onboarding.createUserProfile', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates a new user profile', async () => {
		const t = convexTest(schema, modules);

		const result = await t.mutation(api.onboarding.createUserProfile, {
			authId: 'new-user-auth'
		});

		expect(result).toEqual({ created: true });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users[0]).toMatchObject({ authId: 'new-user-auth', role: 'teacher', status: 'active' });
	});

	it('updates an existing user profile instead of duplicating', async () => {
		const t = convexTest(schema, modules);

		const existingId = await t.run((ctx) =>
			ctx.db.insert('users', {
				authId: 'existing-auth',
				role: 'teacher',
				status: 'pending'
			})
		);

		const result = await t.mutation(api.onboarding.createUserProfile, {
			authId: 'existing-auth',
			role: 'admin',
			status: 'active'
		});

		expect(result).toEqual({ created: false });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]._id).toEqual(existingId);
		expect(users[0]).toMatchObject({ role: 'admin', status: 'active' });
	});
});

describe('onboarding.updateUserName', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates a user when none exists and sets the name', async () => {
		const t = convexTest(schema, modules);

		const result = await t.mutation(api.onboarding.updateUserName, {
			authId: 'name-user',
			name: 'Updated Name'
		});

		expect(result).toEqual({ created: true });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users[0]).toMatchObject({ authId: 'name-user', name: 'Updated Name' });
	});

	it('updates the name of an existing user', async () => {
		const t = convexTest(schema, modules);

		const existingId = await t.run((ctx) =>
			ctx.db.insert('users', {
				authId: 'name-user-2',
				name: 'Old Name',
				role: 'teacher',
				status: 'active'
			})
		);

		const result = await t.mutation(api.onboarding.updateUserName, {
			authId: 'name-user-2',
			name: 'New Name'
		});

		expect(result).toEqual({ created: false });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]._id).toEqual(existingId);
		expect(users[0].name).toBe('New Name');
	});
});

describe('onboarding.deleteAllUserProfiles', () => {
	afterEach(() => vi.restoreAllMocks());

	it('deletes all user profiles and reports the count', async () => {
		const t = convexTest(schema, modules);

		await t.run((ctx) => ctx.db.insert('users', { role: 'teacher', status: 'active' }));
		await t.run((ctx) => ctx.db.insert('users', { role: 'admin', status: 'active' }));

		const result = await t.mutation(api.onboarding.deleteAllUserProfiles, {});

		expect(result).toEqual({ deleted: 2 });

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(0);
	});
});
