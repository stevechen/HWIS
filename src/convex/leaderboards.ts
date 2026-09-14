import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';

const boardValidator = v.union(v.literal('houses'), v.literal('classes'));
const themeValidator = v.union(
	v.literal('default'),
	v.literal('thanksgiving-1'),
	v.literal('thanksgiving-2'),
	v.literal('christmas'),
	v.literal('cny')
);

export type LeaderboardBoard = 'houses' | 'classes';
export type LeaderboardTheme =
	| 'default'
	| 'thanksgiving-1'
	| 'thanksgiving-2'
	| 'christmas'
	| 'cny';

export type LeaderboardConfig = {
	board: LeaderboardBoard;
	enabled: boolean;
	theme: LeaderboardTheme;
	thumbnailUrl?: string;
	/** Screenshot (data URL) of the board rendered in each theme, keyed by theme. */
	themes: Partial<Record<LeaderboardTheme, string>>;
	updatedAt: number;
};

const BOARDS: LeaderboardBoard[] = ['houses', 'classes'];

function settingsKey(board: LeaderboardBoard): string {
	return `leaderboard.${board}`;
}

function defaultConfig(board: LeaderboardBoard): LeaderboardConfig {
	return {
		board,
		enabled: true,
		theme: 'default',
		themes: {},
		updatedAt: 0
	};
}

function parseThumbs(raw: unknown): Partial<Record<LeaderboardTheme, string>> {
	const thumbs: Partial<Record<LeaderboardTheme, string>> = {};
	const validThemes: LeaderboardTheme[] = [
		'default',
		'thanksgiving-1',
		'thanksgiving-2',
		'christmas',
		'cny'
	];
	if (typeof raw !== 'object' || raw === null) return thumbs;
	for (const [key, value] of Object.entries(raw)) {
		if (validThemes.includes(key as LeaderboardTheme) && typeof value === 'string') {
			thumbs[key as LeaderboardTheme] = value;
		}
	}
	return thumbs;
}

function parseConfig(board: LeaderboardBoard, raw: string | undefined): LeaderboardConfig {
	if (!raw) return defaultConfig(board);
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const validThemes: LeaderboardTheme[] = [
			'default',
			'thanksgiving-1',
			'thanksgiving-2',
			'christmas',
			'cny'
		];
		return {
			board,
			enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
			theme: validThemes.includes(parsed.theme as LeaderboardTheme)
				? (parsed.theme as LeaderboardTheme)
				: 'default',
			thumbnailUrl: typeof parsed.thumbnailUrl === 'string' ? parsed.thumbnailUrl : undefined,
			themes: parseThumbs(parsed.themes),
			updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
		};
	} catch {
		return defaultConfig(board);
	}
}

export const list = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const configs: LeaderboardConfig[] = [];
		for (const board of BOARDS) {
			const row = await ctx.db
				.query('settings')
				.withIndex('by_key', (q) => q.eq('key', settingsKey(board)))
				.first();
			configs.push(parseConfig(board, row?.value));
		}
		return configs;
	}
});

export const getPublicConfig = query({
	args: { board: boardValidator },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('settings')
			.withIndex('by_key', (q) => q.eq('key', settingsKey(args.board)))
			.first();
		return parseConfig(args.board, row?.value);
	}
});

export const update = mutation({
	args: {
		board: boardValidator,
		enabled: v.optional(v.boolean()),
		theme: v.optional(themeValidator),
		thumbnailUrl: v.optional(v.string()),
		/** Persist a screenshot for one theme, merged into the stored map. */
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
		const parsed = parseConfig(args.board, current?.value);
		const themes = { ...parsed.themes };
		if (args.themeScreenshot) {
			themes[args.themeScreenshot.theme] = args.themeScreenshot.url;
		}
		const next: LeaderboardConfig = {
			board: args.board,
			enabled: args.enabled ?? parsed.enabled,
			theme: args.theme ?? parsed.theme,
			thumbnailUrl: args.thumbnailUrl ?? parsed.thumbnailUrl,
			themes,
			updatedAt: Date.now()
		};
		const value = JSON.stringify({
			enabled: next.enabled,
			theme: next.theme,
			thumbnailUrl: next.thumbnailUrl,
			themes: next.themes,
			updatedAt: next.updatedAt
		});
		if (current) {
			await ctx.db.patch(current._id, { value, updatedAt: next.updatedAt });
		} else {
			await ctx.db.insert('settings', {
				key: settingsKey(args.board),
				value,
				updatedAt: next.updatedAt
			});
		}
		return next;
	}
});
