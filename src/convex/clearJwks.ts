import { mutation } from './_generated/server';
import { authComponent, requireAdminForSensitiveOperation } from './auth';
import { v } from 'convex/values';

export const clearJwks = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const jwks = await adapter.findMany({
			model: 'jwks',
			where: []
		});

		if (jwks.length === 0) {
			return { message: 'No JWKS entries to clear.', cleared: 0 };
		}

		await adapter.deleteMany({
			model: 'jwks',
			where: []
		});

		return { message: `Cleared ${jwks.length} JWKS entries.`, cleared: jwks.length };
	}
});
