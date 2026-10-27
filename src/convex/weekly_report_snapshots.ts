import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { isTestRuntime } from './auth';
import { WEEK_MS, weekStartOf } from './shared/evaluation_week';
import { formatDateRange, getWeekNumber } from './shared/evaluation_utils';
import type { WeeklyReportSummary } from './shared/weekly_report_read_model';

/**
 * Materialized weekly report counts (ADR-0022).
 *
 * `getWeeklyReportsList` used to scan every evaluation inside the window on each
 * admin page load. That does not fit the 10× target (~75k evaluations/year),
 * and a bounded `take()` silently dropped the newest weeks. Instead one small
 * row per evaluation week is maintained here:
 *
 * - event-driven: evaluation mutations schedule a debounced refresh of the
 *   recent weeks (mirroring ADR-0020's leaderboard snapshot seam), skipped when
 *   the audit trail shows no newer write;
 * - safety net: a 30-minute cron refreshes the recent weeks unconditionally and
 *   bootstraps a full backfill when any completed week is missing;
 * - self-heal: a nightly chunked rebuild of the 52-week window. Cascades,
 *   backup clears/restores and `resetDb` write evaluations without scheduling a
 *   refresh (and without an audit-log entry), so the cron/rebuild — not the
 *   write seam — is what keeps those counts honest.
 *
 * A week's roster changes only on insert/delete (no code path moves an
 * evaluation between weeks or students), which keeps `studentCount` a simple
 * distinct-student count.
 */

const WEEKLY_REPORT_LOOKBACK_WEEKS = 52;

/**
 * Weeks recomputed per execution by the chunked rebuild. At the 10× target a
 * week holds ~1,800 evaluations, so eight weeks is ~14.4k document reads —
 * comfortably inside one execution's read budget.
 */
const WEEKS_PER_REBUILD_CHUNK = 8;

/** Current week + the two before it: covers stragglers and the Sunday→Monday edge. */
const RECENT_REFRESH_WEEKS = 3;

/**
 * Missing-week live fallback. When the table is empty (first deploy, before the
 * backfill lands) the list computes a bounded bootstrap window instead of
 * rendering a blank page. Once anything is materialized, only the most recent
 * few missing weeks are computed so a partial backfill stays cheap.
 */
const LIVE_BOOTSTRAP_WEEKS = 12;
const MAX_LIVE_FALLBACK_WEEKS = 4;

const REFRESH_DEBOUNCE_MS = 45_000;

/** Monday 00:00 Taipei of the oldest week inside the rolling window. */
function rollingWindowStart(currentWeekStart: number): number {
	return currentWeekStart - WEEKLY_REPORT_LOOKBACK_WEEKS * WEEK_MS;
}

/**
 * Monday of the oldest evaluation on record, or the current week when the table
 * is empty. One indexed `take(1)`.
 */
async function earliestEvaluationWeekStart(ctx: Pick<QueryCtx, 'db'>): Promise<number> {
	const earliest = await ctx.db.query('evaluations').withIndex('by_timestamp').take(1);
	return earliest.length > 0 ? weekStartOf(earliest[0].timestamp) : weekStartOf(Date.now());
}

/** Up to one chunk of Monday week starts in `[startWeekStart, endWeekStart)`. */
function chunkWeekStarts(startWeekStart: number, endWeekStart: number): number[] {
	const weekStarts: number[] = [];
	for (let offset = 0; offset < WEEKS_PER_REBUILD_CHUNK; offset++) {
		const weekStart = startWeekStart + offset * WEEK_MS;
		if (weekStart >= endWeekStart) break;
		weekStarts.push(weekStart);
	}
	return weekStarts;
}

/**
 * Distinct students with at least one evaluation in `[weekStart, weekStart + 7d)`.
 * cost: 1 indexed range scan of one week (~1.8k docs at the 10× target) + 1 set.
 */
export async function countWeekStudents(
	ctx: Pick<QueryCtx, 'db'>,
	weekStart: number
): Promise<number> {
	const evaluations = await ctx.db
		.query('evaluations')
		.withIndex('by_timestamp', (q) =>
			q.gte('timestamp', weekStart).lt('timestamp', weekStart + WEEK_MS)
		)
		.collect();

	const studentIds = new Set<string>();
	for (const evaluation of evaluations) {
		studentIds.add(evaluation.studentId.toString());
	}
	return studentIds.size;
}

/**
 * Recompute one week and upsert its row. Zero-count weeks are written too:
 * "row missing" must keep meaning "not computed yet" so the read-side fallback
 * is unambiguous.
 * cost: 1 indexed week scan (~1.8k docs at the 10× target) + 1 row read + 1 write.
 */
export async function recomputeWeekSnapshot(ctx: MutationCtx, weekStart: number): Promise<number> {
	const studentCount = await countWeekStudents(ctx, weekStart);
	const generatedAt = Date.now();
	// Concurrent refreshes can both miss the existing row (Convex has no unique
	// index constraint), so collapse any duplicate the same way here.
	const existing = await ctx.db
		.query('weekly_report_weeks')
		.withIndex('by_weekStart', (q) => q.eq('weekStart', weekStart))
		.collect();

	if (existing.length > 0) {
		await ctx.db.patch(existing[0]._id, { studentCount, generatedAt });
		for (const duplicate of existing.slice(1)) {
			await ctx.db.delete(duplicate._id);
		}
	} else {
		await ctx.db.insert('weekly_report_weeks', { weekStart, studentCount, generatedAt });
	}
	return studentCount;
}

async function writeWeekSnapshots(ctx: MutationCtx, weekStarts: number[]): Promise<void> {
	for (const weekStart of weekStarts) {
		await recomputeWeekSnapshot(ctx, weekStart);
	}
}

function recentWeekStarts(currentWeekStart: number): number[] {
	return Array.from(
		{ length: RECENT_REFRESH_WEEKS },
		(_, offset) => currentWeekStart - offset * WEEK_MS
	);
}

/**
 * Cheap freshness check for the event-driven refresh (mirrors ADR-0020's
 * watermark): skip the recompute when every recent week already has a row and
 * no audit-log entry is newer than the oldest of those rows.
 *
 * `audit_logs` is the write trail for `evaluations.create/remove/update/
 * updateMany/removeMany`, i.e. exactly the mutations that schedule this refresh.
 * A write that bypasses the app (cascade delete, restore, `resetDb`) leaves no
 * trail, so this guard must never gate the cron or the rebuild — they call
 * `writeWeekSnapshots` directly.
 *
 * cost: 1 range read of ≤ 3 rows + 1 audit-log take.
 */
async function recentWeeksAreCurrent(ctx: MutationCtx, weekStarts: number[]): Promise<boolean> {
	const oldestWeekStart = weekStarts[weekStarts.length - 1];
	const newestWeekStart = weekStarts[0];
	const rows = await ctx.db
		.query('weekly_report_weeks')
		.withIndex('by_weekStart', (q) =>
			q.gte('weekStart', oldestWeekStart).lte('weekStart', newestWeekStart)
		)
		.collect();
	const generatedAtByWeek = new Map(rows.map((row) => [row.weekStart, row.generatedAt]));

	let oldestGeneratedAt = Infinity;
	for (const weekStart of weekStarts) {
		const generatedAt = generatedAtByWeek.get(weekStart);
		if (generatedAt === undefined) return false;
		oldestGeneratedAt = Math.min(oldestGeneratedAt, generatedAt);
	}

	const latestLog = await ctx.db
		.query('audit_logs')
		.withIndex('by_timestamp')
		.order('desc')
		.take(1);
	return latestLog.length === 0 || latestLog[0].timestamp <= oldestGeneratedAt;
}

export const refreshWeek = internalMutation({
	args: { weekStart: v.number() },
	handler: async (ctx, args) => ({
		weekStart: args.weekStart,
		studentCount: await recomputeWeekSnapshot(ctx, args.weekStart)
	})
});

// Event-driven entry point, scheduled by evaluation mutations with a debounce
// so a burst of writes costs one refresh instead of one per evaluation.
export const scheduleRefresh = internalMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.scheduler.runAfter(
			REFRESH_DEBOUNCE_MS,
			internal.weekly_report_snapshots.refreshRecentWeeks,
			{}
		);
	}
});

/**
 * Event-driven refresh of the current week plus the two before it. Skips the
 * work when nothing was written since the last refresh (see
 * `recentWeeksAreCurrent`), which collapses duplicate debounced runs.
 * cost: 1 range read + 1 audit-log take when skipped; 3 indexed week scans
 * (~5.4k docs at the 10× target) + 3 row upserts when it runs.
 */
export const refreshRecentWeeks = internalMutation({
	args: {},
	handler: async (ctx) => {
		const weekStarts = recentWeekStarts(weekStartOf(Date.now()));
		if (await recentWeeksAreCurrent(ctx, weekStarts)) {
			return { refreshed: [], skipped: true as const };
		}
		await writeWeekSnapshots(ctx, weekStarts);
		return { refreshed: weekStarts, skipped: false as const };
	}
});

async function beginRebuild(
	ctx: MutationCtx,
	startWeekStart: number,
	endWeekStart: number
): Promise<{ scheduled: boolean; startWeekStart: number; endWeekStart: number }> {
	if (!isTestRuntime) {
		await ctx.scheduler.runAfter(0, internal.weekly_report_snapshots.rebuildChunk, {
			startWeekStart,
			endWeekStart
		});
	}
	return { scheduled: !isTestRuntime, startWeekStart, endWeekStart };
}

/**
 * Recompute one bounded slice of a rebuild, then chain the next slice. Every
 * execution stays under the document-read ceiling at the 10× target.
 * cost: ≤ 8 indexed week scans (~14.4k docs at the 10× target) + ≤ 8 upserts.
 */
export const rebuildChunk = internalMutation({
	args: { startWeekStart: v.number(), endWeekStart: v.number() },
	handler: async (ctx, args) => {
		const weekStarts = chunkWeekStarts(args.startWeekStart, args.endWeekStart);

		await writeWeekSnapshots(ctx, weekStarts);

		const nextCursor = args.startWeekStart + weekStarts.length * WEEK_MS;
		const hasMore = nextCursor < args.endWeekStart;
		const scheduledNextChunk = hasMore && !isTestRuntime;
		if (scheduledNextChunk) {
			await ctx.scheduler.runAfter(0, internal.weekly_report_snapshots.rebuildChunk, {
				startWeekStart: nextCursor,
				endWeekStart: args.endWeekStart
			});
		}

		return {
			processed: weekStarts.length,
			nextCursor: hasMore ? nextCursor : null,
			scheduledNextChunk
		};
	}
});

// Nightly self-heal: rebuild the rolling window so writes that bypass the
// evaluation mutations (cascade deletes, backup restore, resetDb) converge.
// cost: 1 scheduled chunk.
export const startRebuild = internalMutation({
	args: {},
	handler: async (ctx) => {
		const currentWeekStart = weekStartOf(Date.now());
		return await beginRebuild(
			ctx,
			rollingWindowStart(currentWeekStart),
			currentWeekStart + WEEK_MS
		);
	}
});

// One-time (and re-runnable) backfill across all recorded history.
// cost: 1 earliest take + 1 scheduled chunk.
export const startBackfill = internalMutation({
	args: {},
	handler: async (ctx) => {
		const currentWeekStart = weekStartOf(Date.now());
		const startWeekStart = await earliestEvaluationWeekStart(ctx);
		return await beginRebuild(ctx, startWeekStart, currentWeekStart + WEEK_MS);
	}
});

/**
 * Dry run: diff live distinct counts against the stored rows for one bounded
 * slice, without writing. Bounds default to all recorded history through the
 * current week; repeat with the returned `nextCursor` to cover the whole span
 * (each call stays inside the read budget).
 * cost: 1 earliest take (when bounds are omitted) + ≤ 8 indexed week scans
 * (~14.4k docs at the 10× target) + 8 row reads.
 */
export const previewBackfill = internalQuery({
	args: {
		startWeekStart: v.optional(v.number()),
		endWeekStart: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const startWeekStart = args.startWeekStart ?? (await earliestEvaluationWeekStart(ctx));
		const endWeekStart = args.endWeekStart ?? weekStartOf(Date.now()) + WEEK_MS;

		const diffs: Array<{
			weekStart: number;
			live: number;
			stored: number | null;
			delta: number;
		}> = [];

		for (const weekStart of chunkWeekStarts(startWeekStart, endWeekStart)) {
			const live = await countWeekStudents(ctx, weekStart);
			const stored = await ctx.db
				.query('weekly_report_weeks')
				.withIndex('by_weekStart', (q) => q.eq('weekStart', weekStart))
				.first();
			const storedCount = stored?.studentCount ?? null;
			diffs.push({ weekStart, live, stored: storedCount, delta: live - (storedCount ?? 0) });
		}

		const nextCursor = startWeekStart + diffs.length * WEEK_MS;
		return {
			diffs,
			nextCursor: nextCursor < endWeekStart ? nextCursor : null
		};
	}
});

/**
 * The span that needs a backfill: all recorded history if any completed week in
 * the visible window has no row. Returns null when the span is materialized.
 * cost: 1 earliest take + ≤ 52 row reads.
 */
async function missingSpan(ctx: MutationCtx): Promise<{ from: number; to: number } | null> {
	const currentWeekStart = weekStartOf(Date.now());
	const earliestWeekStart = await earliestEvaluationWeekStart(ctx);

	const from = Math.max(rollingWindowStart(currentWeekStart), earliestWeekStart);

	const stored = await ctx.db
		.query('weekly_report_weeks')
		.withIndex('by_weekStart', (q) => q.gte('weekStart', from).lt('weekStart', currentWeekStart))
		.collect();
	const present = new Set(stored.map((row) => row.weekStart));

	for (let weekStart = from; weekStart < currentWeekStart; weekStart += WEEK_MS) {
		if (!present.has(weekStart)) {
			return { from: earliestWeekStart, to: currentWeekStart + WEEK_MS };
		}
	}
	return null;
}

/**
 * Cron entry point: bootstrap a chunked backfill when completed weeks are
 * missing, otherwise refresh the recent weeks only. Runs unconditionally —
 * `writeWeekSnapshots` rather than `refreshRecentWeeks` — so it heals the recent
 * window even for writes that leave no audit-log trail (cascades, restores).
 * cost: span check (1 earliest take + ≤ 52 row reads) + 3 week scans, or 1 scheduled chunk.
 */
export const cronRefresh = internalMutation({
	args: {},
	handler: async (ctx) => {
		const span = await missingSpan(ctx);
		if (span) {
			return { mode: 'backfill' as const, ...(await beginRebuild(ctx, span.from, span.to)) };
		}

		const weekStarts = recentWeekStarts(weekStartOf(Date.now()));
		await writeWeekSnapshots(ctx, weekStarts);
		return { mode: 'recent' as const, refreshed: weekStarts };
	}
});

/**
 * Read path for `evaluations.getWeeklyReportsList`.
 *
 * Reads at most one small row per completed week in the rolling window. Weeks
 * with no evaluations are hidden. A missing row is filled from a bounded live
 * count so a fresh deployment or a partial backfill never renders blank.
 *
 * `sinceTimestamp` narrows the lower bound for tests and tools; the server owns
 * the default window.
 *
 * cost: ≤ 52 row reads on the steady-state path; a partial backfill adds up to
 * 4 bounded week scans (12 while the table is still empty).
 */
export async function listWeeklyReports(
	ctx: QueryCtx,
	options: { sinceTimestamp?: number } = {}
): Promise<WeeklyReportSummary[]> {
	const currentWeekStart = weekStartOf(Date.now());
	const windowStart = rollingWindowStart(currentWeekStart);
	const lowerBound =
		options.sinceTimestamp === undefined
			? windowStart
			: Math.max(windowStart, weekStartOf(options.sinceTimestamp));

	const storedRows = await ctx.db
		.query('weekly_report_weeks')
		.withIndex('by_weekStart', (q) =>
			q.gte('weekStart', lowerBound).lt('weekStart', currentWeekStart)
		)
		.collect();
	// Duplicate rows for a week are possible (no unique index constraint). Apply
	// them oldest-first so the freshest write wins a week's count.
	const counts = new Map<number, number>();
	for (const row of [...storedRows].sort((a, b) => a.generatedAt - b.generatedAt)) {
		counts.set(row.weekStart, row.studentCount);
	}

	// Completed weeks only, newest first. The in-progress week is not shown: an
	// admin checking on Monday wants the week that already locked.
	const completedWeeks = Math.floor((currentWeekStart - lowerBound) / WEEK_MS);
	const weekStarts: number[] = [];
	for (let offset = 1; offset <= completedWeeks; offset++) {
		weekStarts.push(currentWeekStart - offset * WEEK_MS);
	}

	const missing = weekStarts.filter((weekStart) => !counts.has(weekStart));
	const fallbackLimit = storedRows.length === 0 ? LIVE_BOOTSTRAP_WEEKS : MAX_LIVE_FALLBACK_WEEKS;
	for (const weekStart of missing.slice(0, fallbackLimit)) {
		counts.set(weekStart, await countWeekStudents(ctx, weekStart));
	}

	return weekStarts
		.filter((weekStart) => (counts.get(weekStart) ?? 0) > 0)
		.map((weekStart) => ({
			weekNumber: getWeekNumber(weekStart),
			fridayDate: weekStart,
			formattedDate: formatDateRange(weekStart),
			studentCount: counts.get(weekStart) ?? 0
		}));
}
