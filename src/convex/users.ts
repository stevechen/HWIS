import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { authComponent } from './auth';

export const viewer = query({
	args: {},
	handler: async (ctx) => {
		let authUser;
		try {
			authUser = await authComponent.safeGetAuthUser(ctx);
		} catch {
			return null;
		}
		if (!authUser) return null;

		if (!authUser._id) {
			return {
				...authUser,
				authId: null,
				role: 'teacher',
				status: 'active'
			};
		}

		const dbUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authUser._id))
			.first();

		return {
			...authUser,
			authId: dbUser?.authId ?? null,
			role: dbUser?.role ?? 'teacher',
			status: dbUser?.status ?? 'active'
		};
	}
});

export const list = query({
	args: {},
	handler: async (ctx) => {
		let authUser;
		try {
			authUser = await authComponent.getAuthUser(ctx);
		} catch {
			throw new Error('Unauthorized');
		}
		if (!authUser._id) throw new Error('Unauthorized');

		const currentUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authUser._id))
			.first();

		const currentRole = currentUser?.role;
		if (currentRole !== 'admin' && currentRole !== 'super') {
			throw new Error('Unauthorized');
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
		status: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated')))
	},
	handler: async (ctx, args) => {
		let authUser;
		try {
			authUser = await authComponent.getAuthUser(ctx);
		} catch {
			throw new Error('Unauthorized');
		}
		if (!authUser._id) throw new Error('Unauthorized');

		const currentUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authUser._id))
			.first();

		const currentRole = currentUser?.role;
		if (currentRole !== 'admin' && currentRole !== 'super') {
			throw new Error('Unauthorized');
		}

		const { id, ...updates } = args;
		const targetUser = await ctx.db.get(id);
		if (!targetUser) throw new Error('User not found');

		await ctx.db.patch(id, updates);

		if (args.role !== undefined && args.role !== targetUser.role) {
			await ctx.db.insert('audit_logs', {
				action: 'update_user_role',
				performerId: currentUser!._id,
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
				performerId: currentUser!._id,
				targetTable: 'users',
				targetId: id.toString(),
				oldValue: { status: targetUser.status },
				newValue: { status: args.status },
				timestamp: Date.now()
			});
		}
	}
});

export const seedTestAdmin = mutation({
	args: {
		userId: v.id('users')
	},
	handler: async (ctx, args) => {
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
		status: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated')))
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.userId, {
			role: args.role,
			status: args.status
		});
	}
});
