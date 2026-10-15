import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent, requireAdminForSensitiveOperation } from './auth';
import { resolveDepartmentRoles, type DepartmentRole } from './shared/authorization';

interface TestUser {
	id: string;
	email: string;
	name: string;
}

// Core infrastructure users that should not be deleted during test teardowns
// because they are shared across parallel tests and have valid storageState.
const PROTECTED_EMAILS = new Set([
	'teacher@hwis.test',
	'admin@hwis.test',
	'super@hwis.test',
	'esladmin@hwis.test'
]);

export const setupTestUsers = mutation({
	args: {
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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
		// The ESL department's own administrator. `/esl/admin` refuses anyone
		// without `departmentRoles.esl`, and the only mutation that grants it
		// requires an existing ESL admin — so the role has to be provisioned here,
		// or no e2e test can reach the department's pages at all.
		const eslAdminUser = await findOrCreate('esladmin@hwis.test', 'Test ESL Admin');

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

		const existingEslAdmin = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', eslAdminUser.id))
			.first();

		// `departmentRoles` is set on the patch as well as the insert, so a user who
		// once held a different department role does not keep it: a stale grant
		// would silently widen what a test can reach.
		if (!existingEslAdmin) {
			await ctx.db.insert('users', {
				authId: eslAdminUser.id,
				name: 'Test ESL Admin',
				role: 'admin',
				status: 'active',
				departmentRoles: { esl: 'admin' }
			});
		} else {
			await ctx.db.patch(existingEslAdmin._id, {
				role: 'admin',
				status: 'active',
				departmentRoles: { esl: 'admin' }
			});
		}

		const teacherSessionToken = `test_teacher_session_${Date.now()}`;
		const adminSessionToken = `test_admin_session_${Date.now()}`;
		const superSessionToken = `test_super_session_${Date.now()}`;
		const eslAdminSessionToken = `test_esladmin_session_${Date.now()}`;
		const expiresAt = new Date(now + 24 * 60 * 60 * 1000);

		await adapter.deleteMany({
			model: 'session',
			where: [{ field: 'userId', value: teacherUser.id }]
		});
		await adapter.deleteMany({
			model: 'session',
			where: [{ field: 'userId', value: adminUser.id }]
		});
		await adapter.deleteMany({
			model: 'session',
			where: [{ field: 'userId', value: superUser.id }]
		});

		await adapter.create({
			model: 'session',
			data: {
				userId: teacherUser.id,
				token: teacherSessionToken,
				ipAddress: '127.0.0.1',
				userAgent: 'Playwright E2E',
				expiresAt,
				createdAt: new Date(now),
				updatedAt: new Date(now)
			}
		});

		await adapter.create({
			model: 'session',
			data: {
				userId: adminUser.id,
				token: adminSessionToken,
				ipAddress: '127.0.0.1',
				userAgent: 'Playwright E2E',
				expiresAt,
				createdAt: new Date(now),
				updatedAt: new Date(now)
			}
		});

		await adapter.create({
			model: 'session',
			data: {
				userId: superUser.id,
				token: superSessionToken,
				ipAddress: '127.0.0.1',
				userAgent: 'Playwright E2E',
				expiresAt,
				createdAt: new Date(now),
				updatedAt: new Date(now)
			}
		});

		await adapter.deleteMany({
			model: 'session',
			where: [{ field: 'userId', value: eslAdminUser.id }]
		});

		await adapter.create({
			model: 'session',
			data: {
				userId: eslAdminUser.id,
				token: eslAdminSessionToken,
				ipAddress: '127.0.0.1',
				userAgent: 'Playwright E2E',
				expiresAt,
				createdAt: new Date(now),
				updatedAt: new Date(now)
			}
		});

		return {
			teacherUserId: teacherUser.id,
			adminUserId: adminUser.id,
			superUserId: superUser.id,
			eslAdminUserId: eslAdminUser.id,
			teacherSessionToken,
			adminSessionToken,
			superSessionToken,
			eslAdminSessionToken,
			expiresAt: expiresAt.getTime()
		};
	}
});

/**
 * Test-only: grant (or clear) a user's ESL department role by email.
 *
 * E2E's seeded users are International staff by construction, so an ESL flow
 * needs one of them promoted before it can touch `requireEslAdmin` writes.
 * Behind `requireAdminForSensitiveOperation` like every other test-only write
 * — reachable from the authenticated Convex HTTP client in specs, never from
 * the app UI. Preserves the user's International assignment, mirroring
 * `esl/staff.setEslRole` (which refuses self-edits; this one does not, since
 * the caller is the admin session, not the target).
 */
export const setEslRoleByEmail = mutation({
	args: {
		email: v.string(),
		eslRole: v.union(v.literal('admin'), v.literal('teacher'), v.null()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});
		const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as Array<{
			id: string;
			email?: string;
		}>;
		const baUser = baUsers.find((u) => u.email?.toLowerCase() === args.email.toLowerCase());
		if (!baUser) {
			throw new Error(`Test user not found for email: ${args.email}`);
		}

		const profile = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', baUser.id))
			.first();
		if (!profile) {
			throw new Error(`User profile not found for email: ${args.email}`);
		}
		if (profile.role === 'student') {
			throw new Error('Students cannot hold ESL roles');
		}

		const current = resolveDepartmentRoles(profile);
		const next: { international?: DepartmentRole; esl?: DepartmentRole } = {};
		if (current.international) next.international = current.international;
		if (args.eslRole) next.esl = args.eslRole;

		await ctx.db.patch(profile._id, {
			departmentRoles: Object.keys(next).length > 0 ? next : undefined
		});

		return { success: true, userId: profile._id, eslRole: args.eslRole };
	}
});
