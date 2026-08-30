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
import {
	getEvaluationCapabilities,
	noEvaluationCapabilities,
	isStaff,
	type AuthorizationActor
} from './shared/authorization';
import type { Id } from './_generated/dataModel';
import { displayStaffName, normalizeStaffName } from './shared/staff_name';

type BetterAuthUser = {
	_id?: string;
	id?: string;
	email?: string;
	name?: string;
	image?: string | null;
};

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

export const profile = query({
	args: {},
	handler: async (ctx) => {
		const authUser = await getAuthenticatedUser(ctx);
		if (!authUser) {
			return {
				user: null,
				actor: { kind: 'anonymous' as const },
				capabilities: noEvaluationCapabilities
			};
		}

		const auth = authUser as { email?: string; role?: string };

		// Dev-mode super admin (matches the viewer special case)
		if (auth.email === 'super@hwis.test' && auth.role === 'super') {
			const userResult = {
				...authUser,
				authId: 'super@hwis.test' as const,
				role: 'super' as const,
				status: 'active' as const,
				profileExists: true
			};
			const actor: AuthorizationActor = {
				kind: 'staff',
				subject: { role: 'super' as const, status: 'active' as const }
			};
			return {
				user: userResult,
				actor,
				capabilities: getEvaluationCapabilities(actor)
			};
		}

		// Student path: email-derived identity (no user profile row)
		const email = auth.email?.toLowerCase();
		if (isStudentEmailAddress(email)) {
			const student = await resolveStudentFromEmail(email, ctx);

			const userResult = {
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

			const actor: AuthorizationActor =
				student && student.status === 'Enrolled'
					? { kind: 'student', studentId: student._id, enrollmentStatus: student.status }
					: { kind: 'anonymous' };

			return {
				user: userResult,
				actor,
				capabilities: getEvaluationCapabilities(actor)
			};
		}

		// Staff path: authUser already carries role/status (DB profile or test-token)
		if ('role' in authUser && authUser.role && authUser.status) {
			const actor: AuthorizationActor = {
				kind: 'staff',
				subject: { role: authUser.role, status: authUser.status }
			};
			if (typeof authUser._id === 'string') {
				actor.subject._id = authUser._id as Id<'users'>;
			}
			return {
				user: { ...authUser, profileExists: true },
				actor,
				capabilities: getEvaluationCapabilities(actor)
			};
		}

		// Staff path: resolve authId and look up DB profile (same as viewer)
		const authIdLookup =
			authUser.authId ||
			(authUser as { id?: string }).id ||
			(typeof authUser._id === 'string' ? authUser._id : undefined);

		if (!authIdLookup) {
			return {
				user: {
					...authUser,
					authId: undefined,
					role: undefined,
					status: undefined,
					profileExists: false
				},
				actor: { kind: 'anonymous' as const },
				capabilities: noEvaluationCapabilities
			};
		}

		const dbUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authIdLookup))
			.first();

		if (!dbUser) {
			return {
				user: {
					...authUser,
					authId: undefined,
					role: undefined,
					status: undefined,
					profileExists: false
				},
				actor: { kind: 'anonymous' as const },
				capabilities: noEvaluationCapabilities
			};
		}

		const userResult = {
			...authUser,
			authId: dbUser.authId,
			role: dbUser.role ?? 'teacher',
			status: dbUser.status ?? 'pending',
			profileExists: true
		};

		const actor: AuthorizationActor = {
			kind: 'staff',
			subject: { role: dbUser.role, status: dbUser.status, _id: dbUser._id }
		};

		return {
			user: userResult,
			actor,
			capabilities: getEvaluationCapabilities(actor)
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
					name: displayStaffName(u.name),
					role: u.role ?? 'teacher',
					status: u.status ?? 'active',
					email: ba?.email,
					image: ba?.image
				};
			})
			.sort((a, b) => normalizeStaffName(a.name).localeCompare(normalizeStaffName(b.name)));
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
			.filter((u) => isStaff(u))
			.map((u) => ({
				...u,
				name: displayStaffName(u.name),
				role: u.role ?? 'teacher',
				status: u.status ?? 'active'
			}))
			.sort((a, b) => normalizeStaffName(a.name).localeCompare(normalizeStaffName(b.name)));

		return teachers;
	}
});

export const getPendingCount = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const users = await ctx.db.query('users').collect();
		return users.filter((u) => u.role !== 'student' && u.status === 'pending' && !u.deactivatedAt)
			.length;
	}
});

export const normalizeStaffNames = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const users = await ctx.db.query('users').collect();
		let updated = 0;
		for (const user of users) {
			if (user.role === 'student') continue;
			const name = normalizeStaffName(user.name);
			if (name !== user.name) {
				await ctx.db.patch(user._id, { name });
				updated++;
			}
		}
		return { updated };
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

export const seedPendingUser = mutation({
	args: {
		name: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const name = args.name ?? 'Mock Pending Teacher';
		const id = await ctx.db.insert('users', {
			name,
			role: 'teacher',
			status: 'pending',
			createdAt: Date.now()
		});
		return { success: true, id, name };
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

const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;

export const deleteUserAfter5Years = mutation({
	args: {
		userId: v.id('users')
	},
	handler: async (ctx, args) => {
		await requireSuperForSensitiveOperation(ctx);

		const user = await ctx.db.get(args.userId);
		if (!user) throw new Error('User not found');

		if (!user.deactivatedAt) {
			throw new Error('User is not disabled');
		}

		const elapsed = Date.now() - user.deactivatedAt;
		if (elapsed < FIVE_YEARS_MS) {
			const yearsRemaining = ((FIVE_YEARS_MS - elapsed) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(
				1
			);
			throw new Error(
				`User must be disabled for 5 years before deletion. ${yearsRemaining} years remaining.`
			);
		}

		if (user.authId) {
			try {
				const adapter = await authComponent.adapter(ctx)({
					user: { fields: undefined }
				});
				const baUser = (await adapter.findMany({
					model: 'user',
					where: [{ field: 'email', value: user.authId }]
				})) as { id: string }[];
				if (baUser.length > 0) {
					const baId = baUser[0].id;
					await adapter.deleteMany({
						model: 'session',
						where: [{ field: 'userId', value: baId }]
					});
					await adapter.deleteMany({
						model: 'account',
						where: [{ field: 'userId', value: baId }]
					});
					await adapter.deleteMany({
						model: 'user',
						where: [{ field: 'id', value: baId }]
					});
				}
			} catch (e) {
				console.error('deleteUserAfter5Years: BetterAuth cleanup failed', e);
			}
		}

		await ctx.db.delete(args.userId);

		return { success: true, message: 'User and linked auth account permanently deleted' };
	}
});
