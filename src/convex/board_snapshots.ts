import { internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { QueryCtx } from './_generated/server';
import { assertBoardViewer, fetchClassStats, fetchHouseStats } from './students';
import type { Id } from './_generated/dataModel';

/**
 * Precomputed leaderboard snapshots (ADR-0020). The public TV boards used to
 * call getPublicHouseStats/getPublicClassStats on every page load; each call
 * full-scanned `evaluations`, which burned the free-tier database I/O budget.
 * A 5-minute cron recomputes both boards into `leaderboard_snapshots` only
 * when evaluations actually changed (watermark check), and the boards read
 * the precomputed JSON instead. Until the first refresh runs, the public
 * queries fall back to the live computation so behavior is unchanged on deploy.
 */

export type BoardName = 'houses' | 'classes';

const boardValidator = v.union(v.literal('houses'), v.literal('classes'));

// Snapshot payloads mirror the live admin queries' return shapes; deriving the
// types from the fetch functions directly (not FunctionReturnType of the api
// entries) avoids a module cycle through the generated api.d.ts.
export type HousesStats = Awaited<ReturnType<typeof fetchHouseStats>>;
export type ClassStats = Awaited<ReturnType<typeof fetchClassStats>>;

// Cheap O(1) change detection: max evaluation timestamp via the by_timestamp
// index (catches inserts and deletes of the newest row). Value-only edits and
// deletes of older rows are missed here, but the nightly forced rebuild
// (crons.ts) catches anything that slips past.
async function computeWatermark(ctx: QueryCtx): Promise<number> {
	const latest = await ctx.db.query('evaluations').withIndex('by_timestamp').order('desc').take(1);
	return latest.length > 0 ? latest[0].timestamp : 0;
}

// Snapshot-first read with the live computation as a lazy fallback (fresh
// deploy, cron hasn't run yet). The fallback is a thunk so the heavy scan only
// happens when there is genuinely no snapshot row.
async function readSnapshot<T>(ctx: QueryCtx, board: BoardName, fallback: () => Promise<T>) {
	const snapshot = await ctx.db
		.query('leaderboard_snapshots')
		.withIndex('by_board', (q) => q.eq('board', board))
		.first();
	if (snapshot) return JSON.parse(snapshot.stats) as T;
	return fallback();
}

// Two narrow public queries (not one union-returning query) so the boards get
// the exact house/class shapes instead of a widened union.
export const getHouseStats = query({
	args: {},
	handler: async (ctx): Promise<HousesStats> => {
		await assertBoardViewer(ctx);
		return readSnapshot(ctx, 'houses', () => fetchHouseStats(ctx));
	}
});

export const getClassStats = query({
	args: {},
	handler: async (ctx): Promise<ClassStats> => {
		await assertBoardViewer(ctx);
		return readSnapshot(ctx, 'classes', () => fetchClassStats(ctx));
	}
});

// Test/debug helper: current watermark without touching anything.
export const currentWatermark = internalQuery({
	args: {},
	handler: async (ctx) => await computeWatermark(ctx)
});

export const refresh = internalMutation({
	args: { board: boardValidator, force: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const watermark = await computeWatermark(ctx);
		const existing = await ctx.db
			.query('leaderboard_snapshots')
			.withIndex('by_board', (q) => q.eq('board', args.board))
			.first();
		if (!args.force && existing && existing.watermark === watermark) {
			return { skipped: true as const };
		}
		const stats = JSON.stringify(
			args.board === 'houses' ? await fetchHouseStats(ctx) : await fetchClassStats(ctx)
		);
		const generatedAt = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id as Id<'leaderboard_snapshots'>, {
				stats,
				generatedAt,
				watermark
			});
		} else {
			await ctx.db.insert('leaderboard_snapshots', {
				board: args.board,
				stats,
				generatedAt,
				watermark
			});
		}
		return { skipped: false as const };
	}
});

export const refreshAll = internalMutation({
	args: { force: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		await ctx.scheduler.runAfter(0, internal.board_snapshots.refresh, {
			board: 'houses',
			force: args.force
		});
		await ctx.scheduler.runAfter(0, internal.board_snapshots.refresh, {
			board: 'classes',
			force: args.force
		});
	}
});
