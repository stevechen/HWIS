import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';

const boardValidator = v.union(v.literal('houses'), v.literal('classes'));
const themeValidator = v.union(
	v.literal('default'),
	v.literal('thanksgiving'),
	v.literal('christmas'),
	v.literal('cny')
);

export type LeaderboardBoard = 'houses' | 'classes';
export type LeaderboardTheme = 'default' | 'thanksgiving' | 'christmas' | 'cny';

export type LeaderboardConfig = {
	board: LeaderboardBoard;
	enabled: boolean;
	theme: LeaderboardTheme;
	thumbnailUrl?: string;
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
		updatedAt: 0
	};
}

function parseConfig(board: LeaderboardBoard, raw: string | undefined): LeaderboardConfig {
	if (!raw) return defaultConfig(board);
	try {
		const parsed = JSON.parse(raw) as Partial<LeaderboardConfig>;
		return {
			board,
			enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
			theme:
				parsed.theme === 'default' ||
				parsed.theme === 'thanksgiving' ||
				parsed.theme === 'christmas' ||
				parsed.theme === 'cny'
					? parsed.theme
					: 'default',
			thumbnailUrl: typeof parsed.thumbnailUrl === 'string' ? parsed.thumbnailUrl : undefined,
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
		thumbnailUrl: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const current = await ctx.db
			.query('settings')
			.withIndex('by_key', (q) => q.eq('key', settingsKey(args.board)))
			.first();
		const parsed = parseConfig(args.board, current?.value);
		const next: LeaderboardConfig = {
			board: args.board,
			enabled: args.enabled ?? parsed.enabled,
			theme: args.theme ?? parsed.theme,
			thumbnailUrl: args.thumbnailUrl ?? parsed.thumbnailUrl,
			updatedAt: Date.now()
		};
		const value = JSON.stringify({
			enabled: next.enabled,
			theme: next.theme,
			thumbnailUrl: next.thumbnailUrl,
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
