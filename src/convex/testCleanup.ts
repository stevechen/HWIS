import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent, requireAdminForSensitiveOperation } from './auth';
import type { Id } from './_generated/dataModel';

// Core infrastructure users that should not be deleted during test teardowns
// because they are shared across parallel tests and have valid storageState.
const PROTECTED_EMAILS = new Set(['teacher@hwis.test', 'admin@hwis.test', 'super@hwis.test']);
const TEST_AUTH_ID_PREFIXES = ['e2e_', 'e2e-', 'test_', 'eval_', 'e2e-test_'];

export const cleanupAllTestUsers = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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
	args: {
		authId: v.optional(v.id('users')),
		authIdString: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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

		// If we're cleaning by authId string for a temporary test performer,
		// also remove the corresponding user record.
		if (
			args.authIdString &&
			TEST_AUTH_ID_PREFIXES.some((prefix) => args.authIdString?.startsWith(prefix))
		) {
			const user = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', args.authIdString))
				.first();
			if (user) {
				await ctx.db.delete(user._id);
			}
		}

		return { deleted };
	}
});

export const cleanupAllTestData = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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
					(log.performerId &&
						TEST_AUTH_ID_PREFIXES.some((prefix) => log.performerId?.startsWith(prefix)))
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
					(user.authId && TEST_AUTH_ID_PREFIXES.some((prefix) => user.authId?.startsWith(prefix)))
				) {
					await ctx.db.delete(user._id);
					usersDeleted++;
				}
			}
		} catch (e) {
			console.log('users table error:', e);
		}

		// Clean up orphaned classes (classes with no students)
		try {
			const classes = await ctx.db.query('classes').collect();
			for (const cls of classes) {
				const studentsInClass = await ctx.db
					.query('students')
					.withIndex('by_classId', (q) => q.eq('classId', cls._id))
					.take(1);
				if (studentsInClass.length === 0) {
					await ctx.db.delete(cls._id);
					totalDeleted++;
				}
			}
		} catch (e) {
			console.log('classes table error:', e);
		}

		return { deletedData: totalDeleted, deletedUsers: usersDeleted };
	}
});

export const cleanupAll = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

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
				(log.performerId &&
					TEST_AUTH_ID_PREFIXES.some((prefix) => log.performerId?.startsWith(prefix)))
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
				(user.authId && TEST_AUTH_ID_PREFIXES.some((prefix) => user.authId?.startsWith(prefix))) ||
				(user.authId && !validAuthIds.has(user.authId))
			) {
				await ctx.db.delete(user._id);
				totalDeleted++;
			}
		}

		// Clean up orphaned classes (classes with no students)
		const classes = await ctx.db.query('classes').collect();
		for (const cls of classes) {
			const studentsInClass = await ctx.db
				.query('students')
				.withIndex('by_classId', (q) => q.eq('classId', cls._id))
				.take(1);
			if (studentsInClass.length === 0) {
				await ctx.db.delete(cls._id);
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
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		let totalDeleted = 0;

		// Collect student IDs and category names with matching e2eTag (for cascade cleanup)
		const studentIdsWithTag: Id<'students'>[] = [];
		const categoryNamesWithTag: string[] = [];

		// Use indexed queries to avoid full table scans and reduce conflicts
		if (args.dataType === 'students' || args.dataType === 'all') {
			const students = await ctx.db
				.query('students')
				.withIndex('by_e2eTag', (q) => q.eq('e2eTag', args.e2eTag))
				.collect();
			for (const student of students) {
				await ctx.db.delete(student._id);
				totalDeleted++;
				studentIdsWithTag.push(student._id);
			}
		}

		if (args.dataType === 'categories' || args.dataType === 'all') {
			const categories = await ctx.db
				.query('point_categories')
				.withIndex('by_e2eTag', (q) => q.eq('e2eTag', args.e2eTag))
				.collect();
			for (const cat of categories) {
				await ctx.db.delete(cat._id);
				totalDeleted++;
				categoryNamesWithTag.push(cat.name);
			}
		}

		// Collect evaluation IDs for cascade cleanup of audit logs
		const evaluationIdsToDelete: string[] = [];

		if (args.dataType === 'evaluations' || args.dataType === 'all') {
			// First delete evaluations with matching e2eTag (indexed query)
			const evaluations = await ctx.db
				.query('evaluations')
				.withIndex('by_e2eTag', (q) => q.eq('e2eTag', args.e2eTag))
				.collect();
			for (const evalItem of evaluations) {
				evaluationIdsToDelete.push(evalItem._id);
				await ctx.db.delete(evalItem._id);
				totalDeleted++;
			}

			// Also cascade delete evaluations for students with matching e2eTag
			// This handles evaluations created via UI that don't have e2eTag set
			for (const studentId of studentIdsWithTag) {
				const studentEvaluations = await ctx.db
					.query('evaluations')
					.withIndex('by_studentId', (q) => q.eq('studentId', studentId))
					.collect();
				for (const evalItem of studentEvaluations) {
					evaluationIdsToDelete.push(evalItem._id);
					await ctx.db.delete(evalItem._id);
					totalDeleted++;
				}
			}
		}

		// Clean up audit logs with matching e2eTag using indexed query
		if (
			args.dataType === 'students' ||
			args.dataType === 'evaluations' ||
			args.dataType === 'all'
		) {
			const auditLogs = await ctx.db
				.query('audit_logs')
				.withIndex('by_e2eTag', (q) => q.eq('e2eTag', args.e2eTag))
				.collect();
			for (const log of auditLogs) {
				await ctx.db.delete(log._id);
				totalDeleted++;
			}

			// Also cascade delete audit logs for evaluations that were just deleted
			// This handles audit logs created via UI that don't have e2eTag set
			for (const evalId of evaluationIdsToDelete) {
				const evalAuditLogs = await ctx.db
					.query('audit_logs')
					.withIndex('by_target', (q) => q.eq('targetTable', 'evaluations').eq('targetId', evalId))
					.collect();
				for (const log of evalAuditLogs) {
					await ctx.db.delete(log._id);
					totalDeleted++;
				}
			}
		}

		return { deleted: totalDeleted };
	}
});

export const cleanupAllE2eTaggedData = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		let totalDeleted = 0;
		const studentIdsWithTag: Id<'students'>[] = [];
		const evaluationIdsToDelete = new Set<Id<'evaluations'>>();

		// Remove students with any e2eTag (collect IDs for cascade cleanup)
		const students = await ctx.db.query('students').collect();
		for (const student of students) {
			if (student.e2eTag) {
				await ctx.db.delete(student._id);
				totalDeleted++;
				studentIdsWithTag.push(student._id);
			}
		}

		// Remove categories with any e2eTag
		const categories = await ctx.db.query('point_categories').collect();
		for (const cat of categories) {
			if (cat.e2eTag) {
				await ctx.db.delete(cat._id);
				totalDeleted++;
			}
		}

		// Remove evaluations with any e2eTag
		const evaluations = await ctx.db.query('evaluations').collect();
		for (const evalItem of evaluations) {
			if (evalItem.e2eTag) {
				evaluationIdsToDelete.add(evalItem._id);
				await ctx.db.delete(evalItem._id);
				totalDeleted++;
			}
		}

		// Cascade delete evaluations for tagged students (UI-created evals may lack e2eTag)
		for (const studentId of studentIdsWithTag) {
			const studentEvaluations = await ctx.db
				.query('evaluations')
				.withIndex('by_studentId', (q) => q.eq('studentId', studentId))
				.collect();
			for (const evalItem of studentEvaluations) {
				if (!evaluationIdsToDelete.has(evalItem._id)) {
					evaluationIdsToDelete.add(evalItem._id);
					await ctx.db.delete(evalItem._id);
					totalDeleted++;
				}
			}
		}

		// Remove audit logs with any e2eTag or tied to deleted evaluations
		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			const isDeletedEvalLog =
				log.targetTable === 'evaluations' &&
				log.targetId &&
				evaluationIdsToDelete.has(log.targetId as Id<'evaluations'>);
			if (log.e2eTag || isDeletedEvalLog) {
				await ctx.db.delete(log._id);
				totalDeleted++;
			}
		}

		// Clean up orphaned classes (classes with no students)
		const classes = await ctx.db.query('classes').collect();
		for (const cls of classes) {
			const studentsInClass = await ctx.db
				.query('students')
				.withIndex('by_classId', (q) => q.eq('classId', cls._id))
				.take(1);
			if (studentsInClass.length === 0) {
				await ctx.db.delete(cls._id);
				totalDeleted++;
			}
		}

		return { deleted: totalDeleted };
	}
});
