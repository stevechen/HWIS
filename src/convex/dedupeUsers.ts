import { mutation } from './_generated/server';
import { authComponent } from './auth';

type User = {
	_id: string;
	authId: string;
	_creationTime: number;
};

type BAUser = {
	id: string;
	email?: string;
};

export const dedupeUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as BAUser[];

		const allUsers = (await ctx.db.query('users').collect()) as User[];

		const usersByAuthId = new Map<string, User[]>();
		for (const user of allUsers) {
			const existing = usersByAuthId.get(user.authId) || [];
			existing.push(user);
			usersByAuthId.set(user.authId, existing);
		}

		let deleted = 0;
		for (const [, usersList] of usersByAuthId) {
			if (usersList.length <= 1) continue;

			usersList.sort((a: User, b: User) => b._creationTime - a._creationTime);
			usersList.shift();

			for (const user of usersList) {
				await ctx.db.delete(user._id as any);
				deleted++;
			}
		}

		for (const u of baUsers) {
			if (u.email && (u.email.includes('test') || u.email.includes('hwis.test'))) {
				await adapter.deleteMany({ model: 'session', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'account', where: [{ field: 'userId', value: u.id }] });
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: u.id }] });
			}
		}

		return { deleted };
	}
});
