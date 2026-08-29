import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { setTestAuthRole } from './testAuth';
import { authComponent } from './auth';

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
			status: 'active'
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
			role: 'admin'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.role).toBe('admin');
	});
});

describe('users.normalizeStaffNames', () => {
	it('normalizes existing staff names without changing student names or IDs', async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => ({
			teacherId: await ctx.db.insert('users', {
				authId: 'mixed-name',
				name: '  Amy 王  Smith  ',
				role: 'teacher',
				status: 'active'
			}),
			studentId: await ctx.db.insert('users', {
				authId: 'student-name',
				name: '學生 王',
				role: 'student',
				status: 'active'
			})
		}));

		await t.mutation(api.users.normalizeStaffNames, {});

		const users = await t.run((ctx) => ctx.db.query('users').collect());
		expect(users.find((user) => user._id === ids.teacherId)?.name).toBe('Amy Smith');
		expect(users.find((user) => user._id === ids.studentId)?.name).toBe('學生 王');
	});
});

describe('users.update access-removal / restore timestamps', () => {
	it('stamps deactivatedAt when an active user is moved to pending', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Active Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			status: 'pending'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.status).toBe('pending');
		expect(typeof user?.deactivatedAt).toBe('number');
	});

	it('clears deactivatedAt when a pending user is restored to active', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Deactivated Teacher',
				role: 'teacher',
				status: 'pending',
				deactivatedAt: 12345
			});
		});

		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			status: 'active'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.status).toBe('active');
		expect(user?.deactivatedAt).toBeUndefined();
	});

	it('does not stamp deactivatedAt for a role-only update', async () => {
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Active Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			role: 'admin'
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId as Id<'users'>);
		});

		expect(user?.deactivatedAt).toBeUndefined();
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
			status: 'active'
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
			status: 'pending'
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
			role: 'admin'
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
				role: 'admin'
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
		beforeEach(() => setTestAuthRole('super'));
		afterEach(() => setTestAuthRole('admin'));

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
				role: 'super'
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
				role: 'super'
			});

			const user = await t.run(async (ctx) => {
				return await ctx.db.get(adminId as Id<'users'>);
			});

			expect(user?.role).toBe('super');
		});
	});
});

describe('users.list', () => {
	it('includes email and image from Better Auth when available', async () => {
		const t = convexTest(schema, modules);

		const adapterMock = {
			findMany: vi.fn().mockResolvedValue([
				{
					id: 'ba-teacher-1',
					email: 'teacher@hwhs.tc.edu.tw',
					name: 'Test Teacher',
					image: 'https://lh3.googleusercontent.com/photo.jpg'
				}
			])
		};

		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(adapterMock)) as never;
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'ba-teacher-1',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const users = await t.query(api.users.list, {});
		const user = users.find((u: { name?: string }) => u.name === 'Test Teacher');
		expect(user).toBeDefined();
		expect(user?.email).toBe('teacher@hwhs.tc.edu.tw');
		expect(user?.image).toBe('https://lh3.googleusercontent.com/photo.jpg');

		vi.restoreAllMocks();
	});

	it('returns undefined email/image when Better Auth user is not found', async () => {
		const t = convexTest(schema, modules);

		const adapterMock = {
			findMany: vi.fn().mockResolvedValue([])
		};

		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(adapterMock)) as never;
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'orphan-auth-id',
				name: 'Orphan User',
				role: 'teacher',
				status: 'active'
			});
		});

		const users = await t.query(api.users.list, {});
		const user = users.find((u: { name?: string }) => u.name === 'Orphan User');
		expect(user).toBeDefined();
		expect(user?.email).toBeUndefined();
		expect(user?.image).toBeUndefined();

		vi.restoreAllMocks();
	});

	it('sorts users by name with CJK characters stripped from the sort key', async () => {
		const t = convexTest(schema, modules);

		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			const adapterMock = { findMany: vi.fn().mockResolvedValue([]) };
			return (() => Promise.resolve(adapterMock)) as never;
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'z-user',
				name: 'Zoe Zhang 張',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'a-user',
				name: 'Amy Wang 王',
				role: 'teacher',
				status: 'active'
			});
		});

		const users = await t.query(api.users.list, {});
		expect(users.map((u: { name?: string }) => u.name)).toEqual(['Amy Wang', 'Zoe Zhang']);

		vi.restoreAllMocks();
	});

	it('does not include students in the list', async () => {
		const t = convexTest(schema, modules);

		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			const adapterMock = { findMany: vi.fn().mockResolvedValue([]) };
			return (() => Promise.resolve(adapterMock)) as never;
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'teacher-1',
				name: 'Teacher One',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'student-1',
				name: 'Student One',
				role: 'student',
				status: 'active'
			});
		});

		const users = await t.query(api.users.list, {});
		expect(users).toHaveLength(1);
		expect(users[0]?.role).toBe('teacher');

		vi.restoreAllMocks();
	});

	it('resolves email when authId is stored as a bare email (BA id differs from authId)', async () => {
		const t = convexTest(schema, modules);

		// BA user has its own Convex-generated id; the app's `authId` was written
		// as the bare email (the #57 regression). Only the email-keyed lookup resolves it.
		const adapterMock = {
			findMany: vi.fn().mockResolvedValue([
				{
					id: 'ba-generated-id-xyz',
					email: 'staff@hwis.test',
					name: 'Staff Member',
					image: 'https://lh3.googleusercontent.com/staff.jpg'
				}
			])
		};

		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(adapterMock)) as never;
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'staff@hwis.test',
				name: 'Staff Member',
				role: 'teacher',
				status: 'active'
			});
		});

		const users = await t.query(api.users.list, {});
		const user = users.find((u: { name?: string }) => u.name === 'Staff Member');
		expect(user).toBeDefined();
		expect(user?.authId).toBe('staff@hwis.test');
		expect(user?.email).toBe('staff@hwis.test');
		expect(user?.image).toBe('https://lh3.googleusercontent.com/staff.jpg');

		vi.restoreAllMocks();
	});
});

describe('users.getPendingCount', () => {
	it('returns 0 when there are no pending users', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'active-teacher',
				name: 'Active Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const count = await t.query(api.users.getPendingCount, {});
		expect(count).toBe(0);
	});

	it('counts only new pending staff registrations and ignores deactivated accounts and students', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			// New pending teacher (should count)
			await ctx.db.insert('users', {
				authId: 'new-teacher-1',
				name: 'New Teacher 1',
				role: 'teacher',
				status: 'pending'
			});
			// Another new pending staff (should count)
			await ctx.db.insert('users', {
				authId: 'new-teacher-2',
				name: 'New Teacher 2',
				status: 'pending'
			});
			// Deactivated teacher (should not count)
			await ctx.db.insert('users', {
				authId: 'deactivated-teacher',
				name: 'Deactivated Teacher',
				role: 'teacher',
				status: 'pending',
				deactivatedAt: Date.now() - 100000
			});
			// Pending student (should not count)
			await ctx.db.insert('users', {
				authId: 'student-pending',
				name: 'Student Pending',
				role: 'student',
				status: 'pending'
			});
			// Active teacher (should not count)
			await ctx.db.insert('users', {
				authId: 'active-teacher',
				name: 'Active Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const count = await t.query(api.users.getPendingCount, {});
		expect(count).toBe(2);
	});

	it('returns 0 when pending users are only deactivated staff or students', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'deactivated-staff',
				name: 'Deactivated Staff',
				role: 'teacher',
				status: 'pending',
				deactivatedAt: Date.now() - 50000
			});
			await ctx.db.insert('users', {
				authId: 'pending-student',
				name: 'Pending Student',
				role: 'student',
				status: 'pending'
			});
		});

		const count = await t.query(api.users.getPendingCount, {});
		expect(count).toBe(0);
	});
});

describe('users.seedPendingUser', () => {
	it('creates a new pending teacher and increases getPendingCount', async () => {
		const t = convexTest(schema, modules);

		const result = await t.mutation(api.users.seedPendingUser, { name: 'Test New Teacher' });
		expect(result.success).toBe(true);
		expect(result.name).toBe('Test New Teacher');

		const count = await t.query(api.users.getPendingCount, {});
		expect(count).toBe(1);
	});
});
