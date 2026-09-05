import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { LeaderboardConfig } from './leaderboards';

describe('leaderboards.list', () => {
	it('returns default configs for houses and classes', async () => {
		const t = convexTest(schema, modules);
		const configs = await t.query(api.leaderboards.list, {});
		expect(configs).toHaveLength(2);
		const houses = configs.find((c: LeaderboardConfig) => c.board === 'houses');
		const classes = configs.find((c: LeaderboardConfig) => c.board === 'classes');
		expect(houses?.enabled).toBe(true);
		expect(houses?.theme).toBe('default');
		expect(classes?.enabled).toBe(true);
		expect(classes?.theme).toBe('default');
	});
});

describe('leaderboards.getPublicConfig', () => {
	it('returns defaults before any update', async () => {
		const t = convexTest(schema, modules);
		const config = await t.query(api.leaderboards.getPublicConfig, { board: 'houses' });
		expect(config.board).toBe('houses');
		expect(config.enabled).toBe(true);
		expect(config.theme).toBe('default');
	});
});

describe('leaderboards.update', () => {
	it('disables a board and persists for public readers', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(api.leaderboards.update, { board: 'houses', enabled: false });
		const pub = await t.query(api.leaderboards.getPublicConfig, { board: 'houses' });
		expect(pub.enabled).toBe(false);
		const all = await t.query(api.leaderboards.list, {});
		expect(all.find((c: LeaderboardConfig) => c.board === 'houses')?.enabled).toBe(false);
		// Other board untouched
		expect(all.find((c: LeaderboardConfig) => c.board === 'classes')?.enabled).toBe(true);
	});

	it('switches theme per board', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(api.leaderboards.update, { board: 'classes', theme: 'christmas' });
		const pub = await t.query(api.leaderboards.getPublicConfig, { board: 'classes' });
		expect(pub.theme).toBe('christmas');
	});

	it('stores thumbnailUrl when provided', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(api.leaderboards.update, {
			board: 'houses',
			thumbnailUrl: 'data:image/png;base64,AAA'
		});
		const pub = await t.query(api.leaderboards.getPublicConfig, { board: 'houses' });
		expect(pub.thumbnailUrl).toBe('data:image/png;base64,AAA');
	});

	it('rejects invalid theme', async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(api.leaderboards.update, {
				board: 'houses',
				theme: 'easter' as unknown as 'christmas'
			})
		).rejects.toThrow();
	});
});
