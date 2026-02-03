import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { requireAdminRole, getAuthenticatedUser } from './auth';

export const viewer = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
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

		return {
			...authUser,
			authId: dbUser?.authId ?? authIdLookup,
			role: dbUser?.role ?? 'teacher',
			status: dbUser?.status ?? 'pending'
		};
	}
});

export const list = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		const typedUser = user as { role?: string; email?: string } | null;
		if (
			!typedUser ||
			(typedUser.role !== 'admin' &&
				typedUser.role !== 'super' &&
				typedUser.email !== 'super@hwis.test')
		) {
			return [];
		}

		const allUsers = await ctx.db.query('users').collect();
		return allUsers.map((u) => ({
			...u,
			role: u.role ?? 'teacher',
			status: u.status ?? 'active'
		}));
	}
});

export const update = mutation({
	args: {
		id: v.id('users'),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(
			v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated'))
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const currentUser = await requireAdminRole(ctx, args.testToken);

		const { id, ...updates } = args;
		const targetUser = await ctx.db.get(id);
		if (!targetUser) throw new Error('User not found');

		await ctx.db.patch(id, updates);

		// Record audit log if user doc exists (relevant for performers with actual DB IDs)
		const performerId = currentUser?._id;
		if (performerId && performerId !== 'test-user-id') {
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
		userId: v.id('users'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const existing = await ctx.db.get(args.userId);
		if (!existing) {
			await ctx.db.insert('users', {
				role: 'admin',
				status: 'active'
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
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(
			v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated'))
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		await ctx.db.patch(args.userId, {
			role: args.role,
			status: args.status
		});
	}
});

export const setRoleByEmail = mutation({
	args: {
		email: v.string(),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(
			v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated'))
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const allUsers = await ctx.db.query('users').collect();
		const user = allUsers.find((u) => u.authId === args.email);
		if (!user) {
			throw new Error(`User not found for email: ${args.email}`);
		}
		await ctx.db.patch(user._id, {
			role: args.role,
			status: args.status
		});
		return { success: true, userId: user._id, role: args.role };
	}
});

export const setRoleByToken = mutation({
	args: {
		token: v.string(),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(
			v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated'))
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		try {
			const decodedToken = decodeURIComponent(args.token);
			const parts = decodedToken.split('.');
			if (parts.length !== 2) {
				throw new Error('Invalid token format');
			}
			const payload = parts[1];
			const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
			const decoded = JSON.parse(json);
			const authId = decoded.sub || decoded.userId || decoded.email;
			if (!authId) {
				throw new Error('Could not extract user ID from token');
			}

			const allUsers = await ctx.db.query('users').collect();
			const user = allUsers.find((u) => u.authId === authId);

			if (!user) {
				throw new Error(`User not found for authId: ${authId}`);
			}

			await ctx.db.patch(user._id, {
				role: args.role,
				status: args.status
			});
			return { success: true, userId: user._id, role: args.role, authId };
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : 'Unknown error';
			throw new Error(`Failed to set role: ${errorMessage}`);
		}
	}
});
