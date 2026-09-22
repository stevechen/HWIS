import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';
import type { DataModel } from './_generated/dataModel';
import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server';

const boardValidator = v.union(v.literal('houses'), v.literal('classes'));
const themeValidator = v.union(
	v.literal('default'),
	v.literal('thanksgiving-1'),
	v.literal('thanksgiving-2'),
	v.literal('christmas'),
	v.literal('cny'),
	v.literal('halloween')
);

export type LeaderboardBoard = 'houses' | 'classes';
export type LeaderboardTheme =
	| 'default'
	| 'thanksgiving-1'
	| 'thanksgiving-2'
	| 'christmas'
	| 'cny'
	| 'halloween';

/**
 * Flags + layout the public boards need. Deliberately excludes screenshots: the
 * backing `settings` row must stay tiny because every live TV board subscribes
 * to this query (see ADR-0019).
 */
export type PublicLeaderboardConfig = {
	board: LeaderboardBoard;
	enabled: boolean;
	theme: LeaderboardTheme;
	updatedAt: number;
};

/** Admin shape: public flags plus the per-theme preview screenshots. */
export type LeaderboardConfig = PublicLeaderboardConfig & {
	/** Screenshot (data URL) of the board rendered in each theme, keyed by theme. */
	themes: Partial<Record<LeaderboardTheme, string>>;
};

const BOARDS: LeaderboardBoard[] = ['houses', 'classes'];
const THEME_IDS: readonly string[] = [
	'default',
	'thanksgiving-1',
	'thanksgiving-2',
	'christmas',
	'cny',
	'halloween'
];

function isTheme(value: unknown): value is LeaderboardTheme {
	return typeof value === 'string' && THEME_IDS.includes(value);
}

function settingsKey(board: LeaderboardBoard): string {
	return `leaderboard.${board}`;
}

type StoredConfig = {
	enabled: boolean;
	theme: LeaderboardTheme;
	updatedAt: number;
};

/**
 * Tolerant read of the stored JSON. Rows written before ADR-0019 also carried
 * `themes` (base64 screenshots) and a legacy `thumbnailUrl`; both are ignored
 * here and dropped the next time the row is written.
 */
function parseStoredConfig(raw: string | undefined): StoredConfig {
	if (!raw) return { enabled: true, theme: 'default', updatedAt: 0 };
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
			theme: isTheme(parsed.theme) ? parsed.theme : 'default',
			updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
		};
	} catch {
		return { enabled: true, theme: 'default', updatedAt: 0 };
	}
}

async function readStoredConfig(
	db: GenericDatabaseReader<DataModel>,
	board: LeaderboardBoard
): Promise<StoredConfig> {
	const row = await db
		.query('settings')
		.withIndex('by_key', (q) => q.eq('key', settingsKey(board)))
		.first();
	return parseStoredConfig(row?.value);
}

async function loadThumbnails(
	db: GenericDatabaseReader<DataModel>,
	board: LeaderboardBoard
): Promise<Partial<Record<LeaderboardTheme, string>>> {
	const rows = await db
		.query('leaderboard_thumbnails')
		.withIndex('by_board', (q) => q.eq('board', board))
		.collect();
	const themes: Partial<Record<LeaderboardTheme, string>> = {};
	for (const row of rows) {
		themes[row.theme] = row.url;
	}
	return themes;
}

/** Upsert one theme screenshot. Writing a single small row keeps the
 * `settings` row (and every board subscribed to it) untouched. */
async function writeThumbnail(
	db: GenericDatabaseWriter<DataModel>,
	board: LeaderboardBoard,
	theme: LeaderboardTheme,
	url: string,
	updatedAt: number
): Promise<void> {
	const existing = await db
		.query('leaderboard_thumbnails')
		.withIndex('by_board_theme', (q) => q.eq('board', board).eq('theme', theme))
		.first();
	if (existing) {
		if (existing.url !== url) await db.patch(existing._id, { url, updatedAt });
		return;
	}
	await db.insert('leaderboard_thumbnails', { board, theme, url, updatedAt });
}

export const list = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const configs: LeaderboardConfig[] = [];
		for (const board of BOARDS) {
			const stored = await readStoredConfig(ctx.db, board);
			configs.push({ board, ...stored, themes: await loadThumbnails(ctx.db, board) });
		}
		return configs;
	}
});

export const getPublicConfig = query({
	args: { board: boardValidator },
	handler: async (ctx, args) => {
		// Board flags only — the live TV boards subscribe to this query, so the
		// read set must stay a single small `settings` row (ADR-0019).
		return { board: args.board, ...(await readStoredConfig(ctx.db, args.board)) };
	}
});

export const update = mutation({
	args: {
		board: boardValidator,
		enabled: v.optional(v.boolean()),
		theme: v.optional(themeValidator),
		/** Persist a screenshot for one theme (admin-only preview tile). */
		themeScreenshot: v.optional(
			v.object({
				theme: themeValidator,
				url: v.string()
			})
		)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const current = await ctx.db
			.query('settings')
			.withIndex('by_key', (q) => q.eq('key', settingsKey(args.board)))
			.first();
		const parsed = parseStoredConfig(current?.value);
		const flagsChanged = args.enabled !== undefined || args.theme !== undefined;
		const next: PublicLeaderboardConfig = {
			board: args.board,
			enabled: args.enabled ?? parsed.enabled,
			theme: args.theme ?? parsed.theme,
			updatedAt: flagsChanged ? Date.now() : parsed.updatedAt
		};
		// Rewrite the compact shape (which also shrinks legacy rows still holding
		// screenshot blobs) only when the bytes actually change — a screenshot
		// capture must not invalidate every board subscribed to this row.
		const value = JSON.stringify({
			enabled: next.enabled,
			theme: next.theme,
			updatedAt: next.updatedAt
		});
		if (current) {
			if (current.value !== value) {
				await ctx.db.patch(current._id, { value, updatedAt: next.updatedAt });
			}
		} else {
			await ctx.db.insert('settings', {
				key: settingsKey(args.board),
				value,
				updatedAt: next.updatedAt
			});
		}
		if (args.themeScreenshot) {
			await writeThumbnail(
				ctx.db,
				args.board,
				args.themeScreenshot.theme,
				args.themeScreenshot.url,
				Date.now()
			);
		}
		return next;
	}
});

/**
 * One-off cleanup for rows written before ADR-0019: move the base64 screenshots
 * out of `settings['leaderboard.<board>']` into `leaderboard_thumbnails` so the
 * live boards stop reading them on every subscription update. Idempotent — rows
 * that are already compact produce no writes.
 *
 * Run once per deployment: `bunx convex run leaderboards:migrateThumbnails`
 */
export const migrateThumbnails = internalMutation({
	args: {},
	handler: async (ctx) => {
		const moved: string[] = [];
		const compacted: string[] = [];
		for (const board of BOARDS) {
			const row = await ctx.db
				.query('settings')
				.withIndex('by_key', (q) => q.eq('key', settingsKey(board)))
				.first();
			if (!row) continue;

			let legacy: Record<string, unknown>;
			try {
				legacy = JSON.parse(row.value) as Record<string, unknown>;
			} catch {
				continue;
			}

			const legacyThemes =
				typeof legacy.themes === 'object' && legacy.themes !== null
					? (legacy.themes as Record<string, unknown>)
					: {};
			const updatedAt = typeof legacy.updatedAt === 'number' ? legacy.updatedAt : row.updatedAt;
			for (const [theme, url] of Object.entries(legacyThemes)) {
				if (!isTheme(theme) || typeof url !== 'string') continue;
				await writeThumbnail(ctx.db, board, theme, url, updatedAt);
				moved.push(`${board}:${theme}`);
			}

			const value = JSON.stringify({
				enabled: typeof legacy.enabled === 'boolean' ? legacy.enabled : true,
				theme: isTheme(legacy.theme) ? legacy.theme : 'default',
				updatedAt: row.updatedAt
			});
			if (row.value !== value) {
				await ctx.db.patch(row._id, { value });
				compacted.push(board);
			}
		}
		return { moved, compacted };
	}
});
