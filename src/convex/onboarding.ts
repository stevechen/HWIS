import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';

async function requireAuthenticatedUser(ctx: any) {
	const authUser = await authComponent.getAuthUser(ctx);
	if (!authUser?._id) {
		throw new Error('Unauthorized');
	}
	return authUser;
}

async function requireAdminRole(ctx: any) {
	const authUser = await requireAuthenticatedUser(ctx);
	const userDoc = await ctx.db
		.query('users')
		.withIndex('by_authId', (q: any) => q.eq('authId', authUser._id))
		.first();
	const role = userDoc?.role;
	if (role !== 'admin' && role !== 'super') {
		throw new Error('Forbidden: Admin or super role required');
	}
	return authUser;
}

export const ensureUserProfile = mutation({
	args: {},
	handler: async (ctx) => {
		const authUser = await authComponent.getAuthUser(ctx);

		if (!authUser || !authUser._id) {
			throw new Error('Not authenticated - no _id found');
		}

		const authId = authUser._id;

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

		await ctx.db.insert('users', {
			authId: authId,
			name: authUser.name,
			role: 'teacher',
			status: 'pending'
		});
		return { created: true, role: 'teacher', status: 'pending' };
	}
});

export const setMyRole = mutation({
	args: {
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated')))
	},
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);

		if (!authUser || !authUser._id) {
			throw new Error('Not authenticated');
		}

		const authId = authUser._id;

		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!existing) {
			await ctx.db.insert('users', {
				authId: authId,
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

export const createUserProfile = mutation({
	args: {
		authId: v.string(),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated')))
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx);
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
	args: {},
	handler: async (ctx) => {
		await requireAdminRole(ctx);
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

export const setUserRoleByAuthId = mutation({
	args: {
		authId: v.string(),
		name: v.optional(v.string()),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated')))
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();

		const updates: Record<string, unknown> = {};
		if (args.role) updates.role = args.role;
		if (args.status) updates.status = args.status;
		if (args.name) updates.name = args.name;

		if (!existing) {
			await ctx.db.insert('users', {
				authId: args.authId,
				name: args.name,
				role: args.role ?? 'teacher',
				status: args.status ?? 'active'
			});
			return { created: true };
		}

		await ctx.db.patch(existing._id, updates);
		return { created: false };
	}
});
