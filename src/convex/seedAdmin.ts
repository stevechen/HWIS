import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';

export const seedAllUsersAsAdmin = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const allUsers = await ctx.db.query('users').collect();

		for (const user of allUsers) {
			await ctx.db.patch(user._id, {
				role: 'admin',
				status: 'active'
			});
		}

		return {
			message: `Updated ${allUsers.length} users`,
			users: allUsers.map((u) => ({
				id: u._id,
				role: 'admin',
				status: 'active'
			}))
		};
	}
});
