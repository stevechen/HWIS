import { mutation } from './_generated/server';

export const seedAllUsersAsAdmin = mutation({
	args: {},
	handler: async (ctx) => {
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
