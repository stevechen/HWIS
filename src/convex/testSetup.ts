import { mutation } from './_generated/server';
import { authComponent } from './auth';

interface TestUser {
	id: string;
	email: string;
	name: string;
}

export const setupTestUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});
		const now = Date.now();

		const existingUsers = (await adapter.findMany({ model: 'user', where: [] })) as TestUser[];
		for (const user of existingUsers) {
			if (user.email.includes('test') || user.email.includes('hwis.test')) {
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

		const teacherUser = await adapter.create({
			model: 'user',
			data: {
				name: 'Test Teacher',
				email: 'teacher@hwis.test',
				emailVerified: true,
				createdAt: now,
				updatedAt: now
			}
		});

		const adminUser = await adapter.create({
			model: 'user',
			data: {
				name: 'Test Admin',
				email: 'admin@hwis.test',
				emailVerified: true,
				createdAt: now,
				updatedAt: now
			}
		});

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

		const teacherSessionToken = `test_teacher_session_${Date.now()}`;
		const adminSessionToken = `test_admin_session_${Date.now()}`;
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

		return {
			teacherUserId: teacherUser.id,
			adminUserId: adminUser.id,
			teacherSessionToken,
			adminSessionToken,
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
			if (u.email.includes('test') || u.email.includes('hwis.test')) {
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
