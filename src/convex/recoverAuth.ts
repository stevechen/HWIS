import { mutation } from './_generated/server';
import { authComponent } from './auth';

export const forceCreateUser = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const baUsers = await adapter.findMany({ model: 'user', where: [] });
		const results: any[] = [];

		for (const u of baUsers as any[]) {
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
					role: email.includes('steve.stevechen')
						? 'super'
						: email.includes('hwhs.tc.edu.tw')
							? 'admin'
							: 'teacher',
					status: 'active'
				});
				results.push({ email, action: 'created', authId });
			}
		}

		return results;
	}
});
