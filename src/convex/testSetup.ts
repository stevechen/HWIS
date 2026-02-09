import { mutation } from './_generated/server';
import { authComponent } from './auth';

interface TestUser {
	id: string;
	email: string;
	name: string;
}

// Core infrastructure users that should not be deleted during test teardowns
// because they are shared across parallel tests and have valid storageState.
const PROTECTED_EMAILS = new Set(['teacher@hwis.test', 'admin@hwis.test', 'super@hwis.test']);

export const setupTestUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});
		const now = Date.now();

		const existingUsers = (await adapter.findMany({ model: 'user', where: [] })) as TestUser[];
		for (const user of existingUsers) {
			if (
				(user.email.includes('test') || user.email.includes('hwis.test')) &&
				!PROTECTED_EMAILS.has(user.email)
			) {
				await adapter.deleteMany({
					model: 'session',
					where: [{ field: 'userId', value: user.id }]
				});
				await adapter.deleteMany({
					model: 'account',
					where: [{ field: 'userId', value: user.id }]
				});
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: user.id }] });
			}
		}

		// Let's refine the logic to find existing protected users first.
		const findOrCreate = async (email: string, name: string) => {
			const existing = existingUsers.find((u) => u.email === email);
			if (existing) return existing;
			return await adapter.create({
				model: 'user',
				data: { name, email, emailVerified: true, createdAt: now, updatedAt: now }
			});
		};

		const teacherUser = await findOrCreate('teacher@hwis.test', 'Test Teacher');
		const adminUser = await findOrCreate('admin@hwis.test', 'Test Admin');
		const superUser = await findOrCreate('super@hwis.test', 'Test Super Admin');

		const existingTeacher = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', teacherUser.id))
			.first();

		if (!existingTeacher) {
			await ctx.db.insert('users', {
				authId: teacherUser.id,
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		} else {
			await ctx.db.patch(existingTeacher._id, { role: 'teacher', status: 'active' });
		}

		const existingAdmin = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', adminUser.id))
			.first();

		if (!existingAdmin) {
			await ctx.db.insert('users', {
				authId: adminUser.id,
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		} else {
			await ctx.db.patch(existingAdmin._id, { role: 'admin', status: 'active' });
		}

		const existingSuper = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', superUser.id))
			.first();

		if (!existingSuper) {
			await ctx.db.insert('users', {
				authId: superUser.id,
				name: 'Test Super Admin',
				role: 'super',
				status: 'active'
			});
		} else {
			await ctx.db.patch(existingSuper._id, { role: 'super', status: 'active' });
		}

		const teacherSessionToken = `test_teacher_session_${Date.now()}`;
		const adminSessionToken = `test_admin_session_${Date.now()}`;
		const superSessionToken = `test_super_session_${Date.now()}`;
		const expiresAt = now + 24 * 60 * 60 * 1000;

		await adapter.create({
			model: 'session',
			data: {
				userId: teacherUser.id,
				token: teacherSessionToken,
				expiresAt,
				createdAt: now,
				updatedAt: now
			}
		});

		await adapter.create({
			model: 'session',
			data: {
				userId: adminUser.id,
				token: adminSessionToken,
				expiresAt,
				createdAt: now,
				updatedAt: now
			}
		});

		await adapter.create({
			model: 'session',
			data: {
				userId: superUser.id,
				token: superSessionToken,
				expiresAt,
				createdAt: now,
				updatedAt: now
			}
		});

		return {
			teacherUserId: teacherUser.id,
			adminUserId: adminUser.id,
			superUserId: superUser.id,
			teacherSessionToken,
			adminSessionToken,
			superSessionToken,
			expiresAt
		};
	}
});

export const cleanupTestUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const existingUsers = (await adapter.findMany({ model: 'user', where: [] })) as TestUser[];
		let deleted = 0;
		for (const u of existingUsers) {
			if (
				(u.email.includes('test') || u.email.includes('hwis.test')) &&
				!PROTECTED_EMAILS.has(u.email)
			) {
				await adapter.deleteMany({ model: 'session', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'account', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: u.id }] });

				const hwisUser = await ctx.db
					.query('users')
					.withIndex('by_authId', (q) => q.eq('authId', u.id))
					.first();
				if (hwisUser) {
					await ctx.db.delete(hwisUser._id);
				}
				deleted++;
			}
		}

		return { deleted };
	}
});
