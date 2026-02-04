import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

describe('users.update', () => {
	it('updates user status to active', async () => {
		const t = convexTest(schema, modules);

		// Create a pending user
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				email: 'test@example.com',
				name: 'Test User',
				role: 'teacher',
				status: 'pending'
			});
		});

		// Update user to active
		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			status: 'active',
			testToken: 'admin-token'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.status).toBe('active');
	});

	it('updates user role to admin', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				email: 'teacher@example.com',
				name: 'Teacher User',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			role: 'admin',
			testToken: 'admin-token'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.role).toBe('admin');
	});

	it('throws error when user not found', async () => {
		const t = convexTest(schema, modules);

		const fakeId = '000000000000000000000000' as Id<'users'>;

		await expect(async () => {
			await t.mutation(api.users.update, {
				id: fakeId,
				status: 'active',
				testToken: 'admin-token'
			});
		}).rejects.toThrowError('User not found');
	});
});

describe('users.setUserRole', () => {
	it('sets user role to teacher', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				email: 'newteacher@example.com',
				name: 'New Teacher',
				role: 'student',
				status: 'active'
			});
		});

		await t.mutation(api.users.setUserRole, {
			userId: userId as Id<'users'>,
			role: 'teacher',
			status: 'active',
			testToken: 'admin-token'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.role).toBe('teacher');
		expect(user?.status).toBe('active');
	});

	it('deactivates a user', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				email: 'deactivate@example.com',
				name: 'Deactivate Me',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.mutation(api.users.setUserRole, {
			userId: userId as Id<'users'>,
			role: 'teacher',
			status: 'deactivated',
			testToken: 'admin-token'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.status).toBe('deactivated');
	});
});

describe('users.setRoleByEmail', () => {
	it('sets user role by email', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				email: 'findme@example.com',
				name: 'Find Me User',
				role: 'student',
				status: 'active'
			});
		});

		await t.mutation(api.users.setRoleByEmail, {
			email: 'findme@example.com',
			role: 'admin',
			testToken: 'admin-token'
		});

		const users = await t.run(async (ctx) => {
			return await ctx.db.query('users').collect();
		});

		const updatedUser = users.find((u) => u.email === 'findme@example.com');
		expect(updatedUser?.role).toBe('admin');
	});

	it('throws error when user not found by email', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.users.setRoleByEmail, {
				email: 'nonexistent@example.com',
				role: 'admin',
				testToken: 'admin-token'
			});
		}).rejects.toThrowError('User not found for email: nonexistent@example.com');
	});
});
