import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { verifyJWT } from 'better-auth/crypto';
import {
	requireAdminForSensitiveOperation,
	requireSuperForSensitiveOperation,
	getAuthenticatedUser,
	authComponent
} from './auth';
import { isStudentEmailAddress, resolveStudentFromEmail } from './shared/student';
import type { Id } from './_generated/dataModel';

type BetterAuthUser = {
	_id?: string;
	id?: string;
	email?: string;
	name?: string;
	image?: string | null;
};

function stripCJK(name: string): string {
	return name.replace(/[\u3400-\u4DB5\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F]/g, '');
}

async function invalidateUserSessions(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
	const sessions = await ctx.db
		.query('sessions')
		.filter((q) => q.eq(q.field('userId'), userId))
		.collect();
	for (const session of sessions) {
		await ctx.db.delete(session._id);
	}
}

type Status = 'pending' | 'active';

/**
 * Returns the partial row update that keeps the deactivation timestamp in sync with a
 * status transition: active->pending stamps `deactivatedAt`; any transition to active
 * clears it. Non-status changes yield no timestamp update.
 */
function statusTimestampUpdates(
	nextStatus: Status | undefined,
	currentStatus: Status | undefined
): Partial<Record<'deactivatedAt', number | undefined>> {
	if (nextStatus === 'pending' && currentStatus !== 'pending') return { deactivatedAt: Date.now() };
	if (nextStatus === 'active') return { deactivatedAt: undefined };
	return {};
}

export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const authUser = await getAuthenticatedUser(ctx);
		if (!authUser) return null;

		// Check if this is the mock Super Admin from dev mode
		// We use a specific email/role check to avoid DB lookup for the fake user
		const auth = authUser as { email?: string; role?: string };
		if (auth.email === 'super@hwis.test' && auth.role === 'super') {
			return {
				...authUser,
				authId: 'super@hwis.test',
				role: 'super' as const,
				status: 'active' as const
			};
		}

		// Student path: students have no user profile. Their identity and record
		// are derived from their Google email on every read.
		const email = auth.email?.toLowerCase();
		if (isStudentEmailAddress(email)) {
			const student = await resolveStudentFromEmail(email, ctx);
			return {
				...authUser,
				authId: undefined,
				role: 'student' as const,
				status: 'active' as const,
				profileExists: true,
				studentRecordId: student?._id,
				studentId: student?.studentId,
				enrollmentStatus: student?.status,
				englishName: student?.englishName,
				chineseName: student?.chineseName,
				house: student?.house
			};
		}

		const authIdLookup =
			(authUser as { authId?: string; id?: string; _id?: string }).authId ||
			(authUser as { id?: string }).id ||
			(authUser as { _id?: string })._id;

		if (!authIdLookup) {
			return null;
		}
		const dbUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authIdLookup))
			.first();

		if (!dbUser) {
			return {
				...authUser,
				authId: undefined,
				role: undefined,
				status: undefined,
				profileExists: false
			};
		}

		return {
			...authUser,
			authId: dbUser.authId,
			role: dbUser.role ?? 'teacher',
			status: dbUser.status ?? 'pending',
			profileExists: true
		};
	}
});

export const list = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);

		const allUsers = await ctx.db.query('users').take(200);

		// Enrich with email and avatar image from Better Auth (Google profile picture)
		const baUserLookup: Record<string, { email?: string; image?: string | null }> = {};
		try {
			const adapter = await authComponent.adapter(ctx)({
				user: { fields: undefined }
			});
			const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as BetterAuthUser[];
			for (const u of baUsers) {
				const entry = { email: u.email, image: u.image };
				if (u._id) baUserLookup[u._id] = entry;
				if (u.id) baUserLookup[u.id] = entry;
				if (u.email) baUserLookup[u.email.toLowerCase()] = entry;
			}
		} catch (e) {
			console.error('users.list: BetterAuth user lookup failed', e);
		}

		// Filter out students - only show staff (teachers, admins, super)
		return allUsers
			.filter((u) => u.role !== 'student')
			.map((u) => {
				const ba = u.authId ? baUserLookup[u.authId] : undefined;
				return {
					...u,
					role: u.role ?? 'teacher',
					status: u.status ?? 'active',
					email: ba?.email,
					image: ba?.image
				};
			})
			.sort((a, b) => stripCJK(a.name || '').localeCompare(stripCJK(b.name || '')));
	}
});

// Optimized query to fetch only teachers and admins (for class assignment)
export const getTeachers = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);

		const allUsers = await ctx.db.query('users').take(200);
		// Filter to only teachers, admins, and super users
		const teachers = allUsers
			.filter((u) => u.role === 'teacher' || u.role === 'admin' || u.role === 'super')
			.map((u) => ({
				...u,
				role: u.role ?? 'teacher',
				status: u.status ?? 'active'
			}))
			.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

		return teachers;
	}
});

export const update = mutation({
	args: {
		id: v.id('users'),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active')))
	},
	handler: async (ctx, args) => {
		const targetUser = await ctx.db.get(args.id);
		if (!targetUser) throw new Error('User not found');

		let currentUser;
		if (args.role === 'super' && targetUser.role !== 'super') {
			currentUser = await requireSuperForSensitiveOperation(ctx);
		} else {
			currentUser = await requireAdminForSensitiveOperation(ctx);
		}

		const { id, ...updates } = args;

		const timestampUpdates = statusTimestampUpdates(args.status, targetUser.status);

		await ctx.db.patch(id, { ...updates, ...timestampUpdates });

		if (args.status === 'pending' || args.role !== undefined) {
			await invalidateUserSessions(ctx, id);
		}

		const performerId = currentUser?._id;
		// Skip audit logs for test users (both admin and super test tokens)
		const isTestUser = performerId === 'test-user-id' || performerId === 'test-super-user-id';
		if (performerId && !isTestUser) {
			if (args.role !== undefined && args.role !== targetUser.role) {
				await ctx.db.insert('audit_logs', {
					action: 'update_user_role',
					performerId,
					targetTable: 'users',
					targetId: id.toString(),
					oldValue: { role: targetUser.role },
					newValue: { role: args.role },
					timestamp: Date.now()
				});
			}

			if (args.status !== undefined && args.status !== targetUser.status) {
				await ctx.db.insert('audit_logs', {
					action: 'update_user_status',
					performerId,
					targetTable: 'users',
					targetId: id.toString(),
					oldValue: { status: targetUser.status },
					newValue: { status: args.status },
					timestamp: Date.now()
				});
			}
		}
	}
});

export const seedTestAdmin = mutation({
	args: {
		userId: v.id('users')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const existing = await ctx.db.get(args.userId);
		if (!existing) {
			await ctx.db.insert('users', {
				role: 'admin',
				status: 'active',
				createdAt: Date.now()
			});
		} else {
			await ctx.db.patch(args.userId, {
				role: 'admin',
				status: 'active'
			});
		}
	}
});

export const setUserRole = mutation({
	args: {
		userId: v.id('users'),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active')))
	},
	handler: async (ctx, args) => {
		// First fetch the target user to check their current role
		const targetUser = await ctx.db.get(args.userId);
		if (!targetUser) throw new Error('User not found');

		// If promoting to super role, require super role
		if (args.role === 'super' && targetUser.role !== 'super') {
			await requireSuperForSensitiveOperation(ctx);
		} else {
			await requireAdminForSensitiveOperation(ctx);
		}

		await ctx.db.patch(args.userId, {
			role: args.role,
			status: args.status
		});

		if (args.status === 'pending' || args.role !== undefined) {
			await invalidateUserSessions(ctx, args.userId);
		}
	}
});

export const setRoleByEmail = mutation({
	args: {
		email: v.string(),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active')))
	},
	handler: async (ctx, args) => {
		// First find the user to check their current role
		const user = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.email))
			.first();
		if (!user) {
			throw new Error(`User not found for email: ${args.email}`);
		}

		// If promoting to super role, require super role
		if (args.role === 'super' && user.role !== 'super') {
			await requireSuperForSensitiveOperation(ctx);
		} else {
			await requireAdminForSensitiveOperation(ctx);
		}

		await ctx.db.patch(user._id, {
			role: args.role,
			status: args.status
		});

		if (args.status === 'pending' || args.role !== undefined) {
			await invalidateUserSessions(ctx, user._id);
		}

		return { success: true, userId: user._id, role: args.role };
	}
});

export const setRoleByToken = mutation({
	args: {
		token: v.string(),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active')))
	},
	handler: async (ctx, args) => {
		try {
			const secret = process.env.BETTER_AUTH_SECRET;
			if (!secret) {
				throw new Error('BETTER_AUTH_SECRET is not configured');
			}

			const decodedToken = decodeURIComponent(args.token);
			const verified = await verifyJWT(decodedToken, secret);
			if (!verified) {
				throw new Error('Invalid or expired token');
			}
			const authId = verified.sub ?? verified.userId ?? verified.email;
			if (!authId) {
				throw new Error('Could not extract user ID from token');
			}

			const user = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', authId))
				.first();

			if (!user) {
				throw new Error(`User not found for authId: ${authId}`);
			}

			// If promoting to super role, require super role
			if (args.role === 'super' && user.role !== 'super') {
				await requireSuperForSensitiveOperation(ctx);
			} else {
				await requireAdminForSensitiveOperation(ctx);
			}

			await ctx.db.patch(user._id, {
				role: args.role,
				status: args.status
			});

			if (args.status === 'pending' || args.role !== undefined) {
				await invalidateUserSessions(ctx, user._id);
			}

			return { success: true, userId: user._id, role: args.role, authId };
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : 'Unknown error';
			throw new Error(`Failed to set role: ${errorMessage}`);
		}
	}
});
