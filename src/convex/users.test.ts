import { describe, it, expect } from 'vitest';
import { convexTest, modules, SUPER_TEST_TOKEN } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

describe('users.update', () => {
	it('updates user status to active', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test User',
				role: 'teacher',
				status: 'pending'
			});
		});

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
});

describe('users.setUserRole', () => {
	it('sets user role to teacher', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'New Teacher',
				role: 'teacher',
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

	it('deactivates a user (sets to pending)', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Deactivate Me',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.mutation(api.users.setUserRole, {
			userId: userId as Id<'users'>,
			role: 'teacher',
			status: 'pending',
			testToken: 'admin-token'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.status).toBe('pending');
	});
});

describe('users.setRoleByEmail', () => {
	it('sets user role by authId (email)', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'findme@example.com',
				name: 'Find Me User',
				role: 'teacher',
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

		const updatedUser = users.find((u) => u.authId === 'findme@example.com');
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

describe('Role promotion constraint - super role requires super user', () => {
	describe('Admin user attempts', () => {
		it('admin cannot promote teacher to super', async () => {
			const t = convexTest(schema, modules);

			// Create a teacher user
			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					name: 'Teacher User',
					role: 'teacher',
					status: 'active'
				});
			});

			// Attempt to promote teacher to super as admin (default test token is admin)
			await expect(async () => {
				await t.mutation(api.users.update, {
					id: teacherId as Id<'users'>,
					role: 'super'
				});
			}).rejects.toThrowError('Forbidden: Super role required');
		});

		it('admin cannot promote admin to super', async () => {
			const t = convexTest(schema, modules);

			// Create another admin user
			const adminId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					name: 'Another Admin',
					role: 'admin',
					status: 'active'
				});
			});

			// Attempt to promote admin to super as admin (default test token is admin)
			await expect(async () => {
				await t.mutation(api.users.update, {
					id: adminId as Id<'users'>,
					role: 'super'
				});
			}).rejects.toThrowError('Forbidden: Super role required');
		});

		it('admin can still promote teacher to admin', async () => {
			const t = convexTest(schema, modules);

			// Create a teacher user
			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					name: 'Teacher User',
					role: 'teacher',
					status: 'active'
				});
			});

			// Promote teacher to admin as admin (should succeed)
			await t.mutation(api.users.update, {
				id: teacherId as Id<'users'>,
				role: 'admin'
			});

			const user = await t.run(async (ctx) => {
				return await ctx.db.get(teacherId as Id<'users'>);
			});

			expect(user?.role).toBe('admin');
		});

		it('admin can demote admin to teacher', async () => {
			const t = convexTest(schema, modules);

			// Create an admin user
			const adminId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					name: 'Admin To Demote',
					role: 'admin',
					status: 'active'
				});
			});

			// Demote admin to teacher as admin (should succeed)
			await t.mutation(api.users.update, {
				id: adminId as Id<'users'>,
				role: 'teacher'
			});

			const user = await t.run(async (ctx) => {
				return await ctx.db.get(adminId as Id<'users'>);
			});

			expect(user?.role).toBe('teacher');
		});
	});

	describe('Super user attempts', () => {
		it('super can promote teacher to super', async () => {
			const t = convexTest(schema, modules);

			// Create a teacher user
			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					name: 'Teacher User',
					role: 'teacher',
					status: 'active'
				});
			});

			// Promote teacher to super as super user
			await t.mutation(api.users.update, {
				id: teacherId as Id<'users'>,
				role: 'super',
				testToken: SUPER_TEST_TOKEN
			});

			const user = await t.run(async (ctx) => {
				return await ctx.db.get(teacherId as Id<'users'>);
			});

			expect(user?.role).toBe('super');
		});

		it('super can promote admin to super', async () => {
			const t = convexTest(schema, modules);

			// Create an admin user
			const adminId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					name: 'Admin User',
					role: 'admin',
					status: 'active'
				});
			});

			// Promote admin to super as super user
			await t.mutation(api.users.update, {
				id: adminId as Id<'users'>,
				role: 'super',
				testToken: SUPER_TEST_TOKEN
			});

			const user = await t.run(async (ctx) => {
				return await ctx.db.get(adminId as Id<'users'>);
			});

			expect(user?.role).toBe('super');
		});
	});
});
