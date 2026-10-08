import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { anyApi } from 'convex/server';
import { requireAdminForSensitiveOperation } from './auth';
import {
	assessBackupFreshness,
	formatBackupAge,
	STALE_AFTER_MS
} from './shared/drive_backup_target';

/**
 * Record a successful backup. Called by the Drive upload path *after* Drive
 * returns a file id, so a heartbeat only ever exists for an upload that
 * genuinely landed.
 */
export const recordBackupSuccess = internalMutation({
	args: {
		filename: v.string(),
		environment: v.string(),
		fileId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('backupHeartbeats', {
			completedAt: Date.now(),
			filename: args.filename,
			environment: args.environment,
			fileId: args.fileId
		});
	}
});

/**
 * The most recent successful backup, or null if none was ever recorded.
 *
 * `.order('desc').first()` rather than `.last()`: Convex only offers `last()` on
 * an explicitly ordered index, and asking for the newest row is the whole point.
 */
export const latestHeartbeat = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query('backupHeartbeats').withIndex('by_completedAt').order('desc').first();
	}
});

/**
 * Backup freshness for the admin banner.
 *
 * Read-only and Drive-free on purpose — see the schema comment on
 * `backupHeartbeats`. An admin sees this on every admin page, so it must answer
 * "is the archive still being maintained" without itself depending on anything
 * that could be the thing that broke.
 *
 * Gated by the shared admin-area policy, so a non-admin caller cannot read
 * operational metadata. The layout only mounts this inside the admin gate, so
 * the throw never fires for a user who legitimately reaches the page.
 */
export const getBackupFreshness = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);

		const latest = await ctx.db
			.query('backupHeartbeats')
			.withIndex('by_completedAt')
			.order('desc')
			.first();

		return {
			freshness: assessBackupFreshness(latest?.completedAt ?? null, Date.now()),
			filename: latest?.filename ?? null
		};
	}
});

/**
 * Watchdog cron: throw when no backup has succeeded within the stale window.
 *
 * Throwing is deliberate. It surfaces in the Convex dashboard logs view at no
 * extra cost, which is the only alerting Convex provides — there is no built-in
 * email or webhook for cron failures. The admin banner is the primary signal;
 * this is the free second one.
 */
export const checkBackupFreshness = internalAction({
	args: {},
	handler: async (ctx) => {
		const latest = await ctx.runQuery(anyApi.backupWatchdog.latestHeartbeat, {});
		const freshness = assessBackupFreshness(latest?.completedAt ?? null, Date.now());

		if (!freshness.ok) {
			throw new Error(
				freshness.reason === 'never'
					? 'Backup watchdog: no successful backup has ever been recorded'
					: `Backup watchdog: last successful backup was ${formatBackupAge(
							freshness.ageMs
						)} ago (threshold ${formatBackupAge(STALE_AFTER_MS)})`
			);
		}

		return { ok: true, ageMs: freshness.ageMs };
	}
});
