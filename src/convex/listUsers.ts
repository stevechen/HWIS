import { query } from './_generated/server';
import { authComponent } from './auth';

type BetterAuthUser = {
	_id?: string;
	id?: string;
	email?: string;
	name?: string;
};

export const listAllBAUsers = query({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const users = (await adapter.findMany({ model: 'user', where: [] })) as BetterAuthUser[];
		return users.map((u) => ({
			id: u._id || u.id,
			email: u.email,
			name: u.name
		}));
	}
});
