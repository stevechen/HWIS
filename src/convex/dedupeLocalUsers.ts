import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';

export const dedupe = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		const allUsers = await ctx.db.query('users').collect();

		const byAuthId = new Map<string, (typeof allUsers)[0][]>();
		for (const user of allUsers) {
			const authId = user.authId;
			if (!authId) continue;
			const list = byAuthId.get(authId) ?? [];
			list.push(user);
			byAuthId.set(authId, list);
		}

		let deleted = 0;
		let kept = 0;
		for (const [, users] of byAuthId) {
			if (users.length <= 1) {
				kept++;
				continue;
			}
			users.sort((a, b) => a._creationTime - b._creationTime);
			const toKeep = users[0];
			kept++;
			for (const user of users.slice(1)) {
				await ctx.db.delete(user._id);
				deleted++;
			}
		}

		return { deleted, kept, totalUnique: byAuthId.size };
	}
});
