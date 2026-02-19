import { query } from './_generated/server';
import { authComponent, requireAdminForSensitiveOperation } from './auth';
import { v } from 'convex/values';

type BetterAuthUser = {
	_id?: string;
	id?: string;
	email?: string;
	name?: string;
};

export const listAllBAUsers = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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
