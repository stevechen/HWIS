/* eslint-disable @typescript-eslint/no-explicit-any */
import { query } from './_generated/server';
import { authComponent } from './auth';

export const listAllBAUsers = query({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const users = await adapter.findMany({ model: 'user', where: [] });
		return users.map((u: any) => ({
			id: u._id || u.id,
			email: u.email,
			name: u.name
		}));
	}
});
