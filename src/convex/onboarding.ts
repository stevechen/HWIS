import { mutation } from './_generated/server';
import { v } from 'convex/values';
import {
	requireAdminRole,
	getAuthenticatedUser,
	requireUserProfile,
	getAllowlistedRole,
	authComponent,
	requireAdminForSensitiveOperation
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

		// Get email directly from Better Auth (not from profile, which doesn't have email field)
		const betterAuthUser = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
		const userEmail = betterAuthUser?.email?.toLowerCase();
		const allowlistedRole = getAllowlistedRole(userEmail);

		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (existing) {
			// Self-heal privileged owner accounts that may have been created as pending previously.
			const role = allowlistedRole ?? (existing.role ?? 'teacher');
			const status = allowlistedRole ? 'active' : (existing.status ?? 'pending');
			await ctx.db.patch(existing._id, {
				name: authUser.name,
				role,
				status
			});
			return {
				created: false,
				role,
				status
			};
		}

		const role = allowlistedRole ?? 'teacher';
		const status = allowlistedRole ? 'active' : 'pending';

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
		const desiredRole = args.role ?? userDoc.role;
		const desiredStatus = args.status ?? userDoc.status;

		const allUsers = await ctx.db.query('users').collect();
		const hasPrivilegedUser = allUsers.some((user) => user.role === 'admin' || user.role === 'super');

		if (!hasPrivilegedUser) {
			const betterAuthUser = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
			const userEmail = betterAuthUser?.email?.toLowerCase();
			const allowlistedRole = getAllowlistedRole(userEmail);
			if (!allowlistedRole) {
				throw new Error('Bootstrap is restricted to allowlisted owner emails.');
			}
			if (desiredRole !== 'admin' && desiredRole !== 'super') {
				throw new Error('Initial bootstrap role must be admin or super.');
			}
			if (allowlistedRole === 'teacher') {
				throw new Error('This allowlisted account cannot bootstrap privileged roles.');
			}
			if (allowlistedRole === 'admin' && desiredRole === 'super') {
				throw new Error('This allowlisted account can bootstrap admin but not super.');
			}

			await ctx.db.patch(userDoc._id, {
				role: desiredRole,
				status: desiredStatus
			});
			return { created: false, bootstrap: true };
		}

		await requireAdminRole(ctx, args.testToken);

		await ctx.db.patch(userDoc._id, {
			role: desiredRole,
			status: desiredStatus
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
		name: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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
