import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent, getAuthenticatedUser } from './auth';
import type { Id } from './_generated/dataModel';

// Core infrastructure users that should not be deleted during test teardowns
// because they are shared across parallel tests and have valid storageState.
const PROTECTED_EMAILS = new Set(['teacher@hwis.test', 'admin@hwis.test', 'super@hwis.test']);

export const cleanupAllTestUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		// Get all Better Auth users
		const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as {
			id: string;
			email?: string;
		}[];
		const validAuthIds = new Set(baUsers.map((u) => u.id));

		// Delete all users in Convex users table whose authId is not in Better Auth
		const allUsers = await ctx.db.query('users').collect();
		let deleted = 0;
		for (const user of allUsers) {
			// Skip if authId is a real Better Auth user
			if (user.authId && validAuthIds.has(user.authId)) continue;

			// Delete orphaned users (e2e_*, test_*, etc.)
			await ctx.db.delete(user._id);
			deleted++;
		}

		// Also clean up test Better Auth users
		for (const u of baUsers) {
			if (
				u.email &&
				(u.email.includes('test') || u.email.includes('hwis.test')) &&
				!PROTECTED_EMAILS.has(u.email)
			) {
				await adapter.deleteMany({ model: 'session', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'account', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: u.id }] });
			}
		}

		return { deletedOrphanedUsers: deleted };
	}
});

export const cleanupAuditLogs = mutation({
	args: { authId: v.optional(v.id('users')), authIdString: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const auditLogs = await ctx.db.query('audit_logs').collect();
		let deleted = 0;

		// Find the default_user performer ID
		const defaultUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', 'default_user'))
			.first();

		// Find user by authIdString if provided
		let targetUserId: Id<'users'> | undefined;
		if (args.authIdString) {
			const user = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', args.authIdString))
				.first();
			if (user) targetUserId = user._id;
		}

		for (const log of auditLogs) {
			// If specific IDs provided, delete only matching logs
			if (args.authId) {
				if (log.performerId === args.authId) {
					await ctx.db.delete(log._id);
					deleted++;
				}
			} else if (targetUserId) {
				if (log.performerId === targetUserId) {
					await ctx.db.delete(log._id);
					deleted++;
				}
			} else {
				// Delete all seeded audit logs without e2eTag OR created by default_user
				if (!log.e2eTag || (defaultUser && log.performerId === defaultUser._id)) {
					await ctx.db.delete(log._id);
					deleted++;
				}
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

		const TEST_USERS_REQUIRING_AUTHENTICATION = [
			'test-user-id',
			'test_admin',
			'default_user',
			'e2e_teacher1',
			'e2e_teacher2'
		];

		// Clean up test users
		try {
			const users = await ctx.db.query('users').collect();
			const adapter = await authComponent.adapter(ctx)({
				user: { fields: undefined }
			});
			for (const user of users) {
				// Safety check: Don't delete users who have a protected email in Better Auth
				if (user.authId) {
					const baUser = (await adapter.findOne({
						model: 'user',
						where: [{ field: 'id', value: user.authId }]
					})) as { email?: string } | null;
					if (baUser?.email && PROTECTED_EMAILS.has(baUser.email)) {
						continue;
					}
				}

				if (
					TEST_USERS_REQUIRING_AUTHENTICATION.includes(user.authId || '') ||
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

		const adapterUsers = (await adapter.findMany({ model: 'user', where: [] })) as {
			id: string;
			email?: string;
		}[];
		const validAuthIds = new Set(adapterUsers.map((u) => u.id));

		// Clean up test Better Auth users
		for (const u of adapterUsers) {
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
				user.authId === 'default_user' ||
				user.authId === 'e2e_teacher1' ||
				user.authId === 'e2e_teacher2' ||
				(user.authId && TEST_PREFIXES.some((p) => user.authId?.startsWith(p))) ||
				(user.authId && !validAuthIds.has(user.authId))
			) {
				await ctx.db.delete(user._id);
				totalDeleted++;
			}
		}

		return { deleted: totalDeleted };
	}
});

export const cleanupByTag = mutation({
	args: {
		dataType: v.union(
			v.literal('students'),
			v.literal('categories'),
			v.literal('evaluations'),
			v.literal('all')
		),
		e2eTag: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Validate test token for cloud Convex compatibility
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) {
			throw new Error('Not authenticated for cleanupByTag');
		}

		let totalDeleted = 0;

		// Collect student IDs and category names with matching e2eTag (for cascade cleanup)
		const studentIdsWithTag: Id<'students'>[] = [];
		const categoryNamesWithTag: string[] = [];

		if (args.dataType === 'students' || args.dataType === 'all') {
			const students = await ctx.db.query('students').collect();
			for (const student of students) {
				if (student.e2eTag === args.e2eTag) {
					ctx.db.delete(student._id);
					totalDeleted++;
					studentIdsWithTag.push(student._id);
				}
			}
		}

		if (args.dataType === 'categories' || args.dataType === 'all') {
			const categories = await ctx.db.query('point_categories').collect();
			for (const cat of categories) {
				if (cat.e2eTag === args.e2eTag) {
					ctx.db.delete(cat._id);
					totalDeleted++;
					categoryNamesWithTag.push(cat.name);
				}
			}
		}

		if (args.dataType === 'evaluations' || args.dataType === 'all') {
			const evaluations = await ctx.db.query('evaluations').collect();
			for (const evalItem of evaluations) {
				// Delete evaluations that have matching e2eTag OR reference a student/category with matching e2eTag
				if (
					evalItem.e2eTag === args.e2eTag ||
					studentIdsWithTag.includes(evalItem.studentId) ||
					categoryNamesWithTag.includes(evalItem.category)
				) {
					ctx.db.delete(evalItem._id);
					totalDeleted++;
				}
			}
		}

		// Collect test user IDs for audit log cleanup
		const testUserIds: Id<'users'>[] = [];
		if (args.dataType === 'all') {
			const users = await ctx.db.query('users').collect();
			for (const user of users) {
				if (
					user.authId === 'test-user-id' ||
					user.authId === 'test_admin' ||
					user.authId === 'e2e_teacher1' ||
					user.authId === 'e2e_teacher2' ||
					(user.authId && (user.authId.startsWith('e2e_') || user.authId.startsWith('test_')))
				) {
					testUserIds.push(user._id);
				}
			}
		}

		// Clean up audit logs for deleted students, evaluations, and user modifications
		if (
			args.dataType === 'students' ||
			args.dataType === 'evaluations' ||
			args.dataType === 'all'
		) {
			const auditLogs = await ctx.db.query('audit_logs').collect();
			for (const log of auditLogs) {
				if (
					// Audit logs with matching e2eTag (most reliable method)
					log.e2eTag === args.e2eTag ||
					// Evaluation audit logs (fallback: match by category name)
					(log.targetTable === 'evaluations' &&
						categoryNamesWithTag.includes(log.newValue?.category || '')) ||
					// Student audit logs (fallback: match by targetId as string)
					(log.targetTable === 'students' &&
						studentIdsWithTag.some((id) => id.toString() === log.targetId)) ||
					// User modification audit logs (by performer)
					(args.dataType === 'all' && testUserIds.includes(log.performerId))
				) {
					ctx.db.delete(log._id);
					totalDeleted++;
				}
			}
		}

		return { deleted: totalDeleted };
	}
});
