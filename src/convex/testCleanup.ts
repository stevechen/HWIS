import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';

export const cleanupAllTestUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		// Get all Better Auth users
		const baUsers = await adapter.findMany({ model: 'user', where: [] });
		const validAuthIds = new Set(baUsers.map((u: any) => u.id));

		// Delete all users in Convex users table whose authId is not in Better Auth
		const allUsers = await ctx.db.query('users').collect();
		let deleted = 0;
		for (const user of allUsers) {
			// Skip if authId is a real Better Auth user
			if (validAuthIds.has(user.authId)) continue;

			// Delete orphaned users (e2e_*, test_*, etc.)
			await ctx.db.delete(user._id);
			deleted++;
		}

		// Also clean up test Better Auth users
		for (const u of baUsers as any[]) {
			if (u.email && (u.email.includes('test') || u.email.includes('hwis.test'))) {
				await adapter.deleteMany({ model: 'session', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'account', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: u.id }] });
			}
		}

		return { deletedOrphanedUsers: deleted };
	}
});

export const cleanupAuditLogs = mutation({
	args: { authId: v.optional(v.id('users')) },
	handler: async (ctx, args) => {
		const auditLogs = await ctx.db.query('audit_logs').collect();
		let deleted = 0;

		for (const log of auditLogs) {
			if (args.authId && log.performerId === args.authId) {
				await ctx.db.delete(log._id);
				deleted++;
			}
		}

		return { deleted };
	}
});

export const cleanupAllTestData = mutation({
	args: {},
	handler: async (ctx) => {
		const TEST_PREFIXES = ['e2e_', 'test_', 'eval_', 'e2e-test_'];

		let totalDeleted = 0;
		let usersDeleted = 0;

		// Clean up students with e2eTag
		try {
			const students = await ctx.db.query('students').collect();
			for (const student of students) {
				if (student.e2eTag) {
					await ctx.db.delete(student._id);
					totalDeleted++;
				}
			}
		} catch (e) {
			console.log('students table error:', e);
		}

		// Clean up evaluations with e2eTag
		try {
			const evaluations = await ctx.db.query('evaluations').collect();
			for (const evalItem of evaluations) {
				if (evalItem.e2eTag) {
					await ctx.db.delete(evalItem._id);
					totalDeleted++;
				}
			}
		} catch (e) {
			console.log('evaluations table error:', e);
		}

		// Clean up categories with e2eTag
		try {
			const categories = await ctx.db.query('point_categories').collect();
			for (const cat of categories) {
				if (cat.e2eTag) {
					await ctx.db.delete(cat._id);
					totalDeleted++;
				}
			}
		} catch (e) {
			console.log('point_categories table error:', e);
		}

		// Clean up audit logs with e2eTag or test performerId
		try {
			const auditLogs = await ctx.db.query('audit_logs').collect();
			for (const log of auditLogs) {
				if (
					log.e2eTag ||
					(log.performerId && TEST_PREFIXES.some((p) => log.performerId?.startsWith(p)))
				) {
					await ctx.db.delete(log._id);
					totalDeleted++;
				}
			}
		} catch (e) {
			console.log('audit_logs table error:', e);
		}

		// Clean up test users
		try {
			const users = await ctx.db.query('users').collect();
			for (const user of users) {
				if (
					user.authId === 'test-user-id' ||
					user.authId === 'test_admin' ||
					user.authId === 'e2e_teacher1' ||
					user.authId === 'e2e_teacher2' ||
					(user.authId && TEST_PREFIXES.some((p) => user.authId?.startsWith(p)))
				) {
					await ctx.db.delete(user._id);
					usersDeleted++;
				}
			}
		} catch (e) {
			console.log('users table error:', e);
		}

		return { deletedData: totalDeleted, deletedUsers: usersDeleted };
	}
});

export const cleanupAll = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const TEST_PREFIXES = ['e2e_', 'test_', 'eval_', 'e2e-test_'];
		let totalDeleted = 0;

		const adapterUsers = await adapter.findMany({ model: 'user', where: [] });
		const validAuthIds = new Set((adapterUsers as any[]).map((u) => u.id));

		// Clean up test Better Auth users
		for (const u of adapterUsers as any[]) {
			if (u.email && (u.email.includes('test') || u.email.includes('hwis.test'))) {
				await adapter.deleteMany({ model: 'session', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'account', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: u.id }] });
			}
		}

		// Clean up students with e2eTag
		const students = await ctx.db.query('students').collect();
		for (const student of students) {
			if (student.e2eTag) {
				await ctx.db.delete(student._id);
				totalDeleted++;
			}
		}

		// Clean up evaluations with e2eTag
		const evaluations = await ctx.db.query('evaluations').collect();
		for (const evalItem of evaluations) {
			if (evalItem.e2eTag) {
				await ctx.db.delete(evalItem._id);
				totalDeleted++;
			}
		}

		// Clean up categories with e2eTag
		const categories = await ctx.db.query('point_categories').collect();
		for (const cat of categories) {
			if (cat.e2eTag) {
				await ctx.db.delete(cat._id);
				totalDeleted++;
			}
		}

		// Clean up audit logs with e2eTag
		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			if (
				log.e2eTag ||
				(log.performerId && TEST_PREFIXES.some((p) => log.performerId?.startsWith(p)))
			) {
				await ctx.db.delete(log._id);
				totalDeleted++;
			}
		}

		// Clean up Convex users with test authIds
		const convexUsers = await ctx.db.query('users').collect();
		for (const user of convexUsers) {
			if (
				user.authId === 'test-user-id' ||
				user.authId === 'test_admin' ||
				user.authId === 'e2e_teacher1' ||
				user.authId === 'e2e_teacher2' ||
				(user.authId && TEST_PREFIXES.some((p) => user.authId?.startsWith(p))) ||
				!validAuthIds.has(user.authId)
			) {
				await ctx.db.delete(user._id);
				totalDeleted++;
			}
		}

		return { deleted: totalDeleted };
	}
});
