import { mutation } from './_generated/server';
import { authComponent, requireAdminForSensitiveOperation } from './auth';

export const clearJwks = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);

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
