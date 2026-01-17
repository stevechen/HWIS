import { mutation } from './_generated/server';
import { authComponent } from './auth';

export const cleanupAllTestUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		// Get all Better Auth users
		const baUsers = await adapter.findMany({ model: 'user', where: [] });
		const validAuthIds = new Set(baUsers.map((u: any) => u.id));

		// Delete all users in Convex users table whose authId is not in Better Auth
		const allUsers = await ctx.db.query('users').collect();
		let deleted = 0;
		for (const user of allUsers) {
			// Skip if authId is a real Better Auth user
			if (validAuthIds.has(user.authId)) continue;

			// Delete orphaned users (e2e_*, test_*, etc.)
			await ctx.db.delete(user._id);
			deleted++;
		}

		// Also clean up test Better Auth users
		for (const u of baUsers as any[]) {
			if (u.email && (u.email.includes('test') || u.email.includes('hwis.test'))) {
				await adapter.deleteMany({ model: 'session', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'account', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: u.id }] });
			}
		}

		return { deletedOrphanedUsers: deleted };
	}
});
