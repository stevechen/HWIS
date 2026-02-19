import { mutation } from './_generated/server';
import { v } from 'convex/values';
import {
	requireAdminRole,
	getAuthenticatedUser,
	requireUserProfile,
	EXCEPTION_EMAILS,
	authComponent
} from './auth';

type BetterAuthUser = {
	email?: string;
};

export const ensureUserProfile = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);

		if (!authUser) {
			throw new Error('Not authenticated');
		}

		const authId =
			authUser.authId ||
			(typeof authUser._id === 'string' ? authUser._id : undefined);
		if (!authId) {
			throw new Error('Missing authId');
		}

		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: authUser.name
			});
			return {
				created: false,
				role: existing.role ?? 'teacher',
				status: existing.status ?? 'pending'
			};
		}

		// Get email directly from Better Auth (not from profile, which doesn't have email field)
		const betterAuthUser = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
		const userEmail = betterAuthUser?.email;

		const isExceptionEmail = userEmail && EXCEPTION_EMAILS.includes(userEmail);

		const role = isExceptionEmail ? 'super' : 'teacher';
		const status = isExceptionEmail ? 'active' : 'pending';

		await ctx.db.insert('users', {
			authId: authId,
			name: authUser.name,
			role,
			status
		});
		return { created: true, role, status };
	}
});

export const setMyRole = mutation({
	args: {
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx, args.testToken);

		await ctx.db.patch(userDoc._id, {
			role: args.role,
			status: args.status
		});
		return { created: false };
	}
});

export const createUserProfile = mutation({
	args: {
		authId: v.string(),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();

		if (!existing) {
			await ctx.db.insert('users', {
				authId: args.authId,
				role: args.role ?? 'teacher',
				status: args.status ?? 'active'
			});
			return { created: true };
		}
		await ctx.db.patch(existing._id, {
			role: args.role,
			status: args.status
		});
		return { created: false };
	}
});

export const deleteAllUserProfiles = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const allUsers = await ctx.db.query('users').collect();
		for (const user of allUsers) {
			await ctx.db.delete(user._id);
		}
		return { deleted: allUsers.length };
	}
});

export const updateUserName = mutation({
	args: {
		authId: v.string(),
		name: v.string()
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();

		if (!existing) {
			await ctx.db.insert('users', {
				authId: args.authId,
				name: args.name,
				role: 'teacher',
				status: 'active'
			});
			return { created: true };
		}

		await ctx.db.patch(existing._id, {
			name: args.name
		});
		return { created: false };
	}
});
