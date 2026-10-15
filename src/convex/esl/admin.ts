import { internalQuery } from '../_generated/server';
import { requireEslAdmin } from '../auth';

/**
 * The action-side ESL-admin gate (moved from `esl/seed`, deleted under #229
 * when the seed service folded into the setup wizard): actions carry no db
 * handle for `requireEslAdmin`, so the gov-import and wizard-save actions
 * run this query first and stay behind the same rule as every mutation.
 */
export const checkEslAdmin = internalQuery({
	args: {},
	handler: async (ctx) => {
		await requireEslAdmin(ctx);
		return { ok: true as const };
	}
});
