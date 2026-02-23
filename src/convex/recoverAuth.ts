import { mutation } from './_generated/server';
import { authComponent, getAllowlistedRole, requireAdminForSensitiveOperation } from './auth';
import { v } from 'convex/values';

type BetterAuthUser = {
	_id?: string;
	id: string;
	email: string;
	name?: string;
	role?: 'super' | 'admin' | 'teacher';
};

type RecoverAuthResult = {
	email: string;
	action: 'updated' | 'created';
	authId: string;
};

export const forceCreateUser = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as BetterAuthUser[];
		const results: RecoverAuthResult[] = [];

		for (const u of baUsers) {
			const authId = u._id || u.id;
			const email = u.email;

			const existing = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', authId))
				.first();

			if (existing) {
				await ctx.db.patch(existing._id, {
					name: u.name || email.split('@')[0],
					role: u.role || 'teacher',
					status: 'active'
				});
				results.push({ email, action: 'updated', authId });
			} else {
				await ctx.db.insert('users', {
					authId: authId,
					name: u.name || email.split('@')[0],
					role: getAllowlistedRole(email) ?? 'teacher',
					status: 'active'
				});
				results.push({ email, action: 'created', authId });
			}
		}

		return results;
	}
});
