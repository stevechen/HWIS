/* eslint-disable @typescript-eslint/no-explicit-any */
import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';

export const createUserByEmail = mutation({
	args: {
		email: v.string(),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated')))
	},
	handler: async (ctx, args) => {
		// Find the Better Auth user by email
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const baUsers = await adapter.findMany({ model: 'user', where: [] });
		const baUser = (baUsers as any[]).find((u) => u.email === args.email);

		if (!baUser) {
			throw new Error(`Better Auth user not found for email: ${args.email}`);
		}

		const authId = baUser._id || baUser.id;

		// Check if Convex user already exists
		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: baUser.name || args.email.split('@')[0],
				role: args.role ?? existing.role,
				status: args.status ?? existing.status
			});
			return { created: false, authId };
		}

		await ctx.db.insert('users', {
			authId: authId,
			name: baUser.name || args.email.split('@')[0],
			role: args.role ?? 'teacher',
			status: args.status ?? 'active'
		});
		return { created: true, authId };
	}
});
