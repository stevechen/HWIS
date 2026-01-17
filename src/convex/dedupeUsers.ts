import { mutation } from './_generated/server';
import { authComponent } from './auth';

export const dedupeUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		// Get all Better Auth users
		const baUsers = await adapter.findMany({ model: 'user', where: [] });
		const validAuthIds = new Set(baUsers.map((u: any) => u.id));

		// Get all Convex users
		const allUsers = await ctx.db.query('users').collect();

		// Group by authId
		const usersByAuthId = new Map();
		for (const user of allUsers) {
			const existing = usersByAuthId.get(user.authId) || [];
			existing.push(user);
			usersByAuthId.set(user.authId, existing);
		}

		let deleted = 0;
		// For each authId, keep only the most recent and delete others
		for (const [authId, users] of usersByAuthId) {
			if (users.length <= 1) continue;

			// Sort by creation time, keep the newest
			users.sort((a: any, b: any) => b._creationTime - a._creationTime);
			const keep = users[0];
			const toDelete = users.slice(1);

			for (const user of toDelete) {
				await ctx.db.delete(user._id);
				deleted++;
			}
		}

		// Also clean up test Better Auth users and orphaned Convex users
		for (const u of baUsers as any[]) {
			if (u.email && (u.email.includes('test') || u.email.includes('hwis.test'))) {
				await adapter.deleteMany({ model: 'session', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'account', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: u.id }] });
			}
		}

		// Remove orphaned Convex users
		const updatedUsers = await ctx.db.query('users').collect();
		for (const user of updatedUsers) {
			if (!validAuthIds.has(user.authId)) {
				await ctx.db.delete(user._id);
				deleted++;
			}
		}

		return { deleted };
	}
});
