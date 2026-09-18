import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { LeaderboardConfig } from './leaderboards';

type TestHarness = ReturnType<typeof convexTest>;

/**
 * Mirrors a row written before ADR-0019: board flags *and* base64 screenshots in
 * the single `settings` row every live board subscribes to.
 */
function legacyValue(themes: Record<string, string>): string {
	return JSON.stringify({
		enabled: false,
		theme: 'christmas',
		thumbnailUrl: 'data:image/png;base64,LEGACY',
		themes,
		updatedAt: 1
	});
}

function settingsRow(t: TestHarness, key: string) {
	// `withIndex` is unavailable here: the convex-test harness widens the data
	// model, so the index-name types collapse to the system indexes. The test
	// DBs hold a handful of rows, so a scan is fine.
	return t
		.run((ctx) => ctx.db.query('settings').collect())
		.then((rows) => rows.find((row) => row.key === key));
}

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
		expect(houses?.themes).toEqual({});
	});

	it('exposes stored screenshots from the thumbnails table', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(api.leaderboards.update, {
			board: 'houses',
			themeScreenshot: { theme: 'cny', url: 'data:image/jpeg;base64,HOUSES_CNY' }
		});
		const configs = await t.query(api.leaderboards.list, {});
		expect(configs.find((c: LeaderboardConfig) => c.board === 'houses')?.themes.cny).toBe(
			'data:image/jpeg;base64,HOUSES_CNY'
		);
		expect(configs.find((c: LeaderboardConfig) => c.board === 'classes')?.themes).toEqual({});
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

	// Quota guard (ADR-0019): the live boards subscribe to this query, so the
	// payload must never carry screenshot blobs.
	it('never returns screenshot fields', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(api.leaderboards.update, {
			board: 'houses',
			themeScreenshot: { theme: 'default', url: 'data:image/jpeg;base64,BIG' }
		});
		const config = await t.query(api.leaderboards.getPublicConfig, { board: 'houses' });
		expect(Object.keys(config).sort()).toEqual(['board', 'enabled', 'theme', 'updatedAt']);
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

	// Quota guard (ADR-0019): screenshots go to `leaderboard_thumbnails`, so the
	// subscribed `settings` row stays a few dozen bytes no matter how large the
	// captured data URL is.
	it('keeps the settings row compact when storing a screenshot', async () => {
		const t = convexTest(schema, modules);
		const url = `data:image/jpeg;base64,${'A'.repeat(50_000)}`;
		await t.mutation(api.leaderboards.update, {
			board: 'classes',
			themeScreenshot: { theme: 'christmas', url }
		});
		const row = await settingsRow(t, 'leaderboard.classes');
		expect(row?.value.length).toBeLessThan(200);
		const rows = await t.run((ctx) => ctx.db.query('leaderboard_thumbnails').collect());
		expect(rows).toHaveLength(1);
		expect(rows[0].url).toBe(url);
	});

	it('does not touch the settings row when only a screenshot is captured', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(api.leaderboards.update, { board: 'houses', enabled: false });
		const before = await settingsRow(t, 'leaderboard.houses');
		await t.mutation(api.leaderboards.update, {
			board: 'houses',
			themeScreenshot: { theme: 'cny', url: 'data:image/jpeg;base64,AAA' }
		});
		const after = await settingsRow(t, 'leaderboard.houses');
		// Byte-identical row => the live boards' subscription was never invalidated.
		expect(after?.value).toBe(before?.value);
		expect(after?.updatedAt).toBe(before?.updatedAt);
	});

	it('replaces an existing theme screenshot instead of duplicating rows', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(api.leaderboards.update, {
			board: 'houses',
			themeScreenshot: { theme: 'cny', url: 'first' }
		});
		await t.mutation(api.leaderboards.update, {
			board: 'houses',
			themeScreenshot: { theme: 'cny', url: 'second' }
		});
		const rows = await t.run((ctx) => ctx.db.query('leaderboard_thumbnails').collect());
		expect(rows).toHaveLength(1);
		expect(rows[0].url).toBe('second');
	});

	it('drops legacy screenshot fields the next time an admin updates the board', async () => {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert('settings', {
				key: 'leaderboard.houses',
				value: legacyValue({ default: 'data:image/png;base64,BIG' }),
				updatedAt: 1
			})
		);
		await t.mutation(api.leaderboards.update, { board: 'houses', enabled: true });
		const row = await settingsRow(t, 'leaderboard.houses');
		expect(row?.value).not.toContain('base64');
		expect(JSON.parse(row!.value)).toMatchObject({ enabled: true, theme: 'christmas' });
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

describe('leaderboards.migrateThumbnails', () => {
	it('moves legacy screenshots out of the subscribed settings row', async () => {
		const t = convexTest(schema, modules);
		const value = legacyValue({
			default: 'data:image/png;base64,HOUSES_DEFAULT',
			cny: 'data:image/png;base64,HOUSES_CNY'
		});
		await t.run((ctx) =>
			ctx.db.insert('settings', { key: 'leaderboard.houses', value, updatedAt: 1 })
		);

		const result = await t.mutation(internal.leaderboards.migrateThumbnails, {});
		expect([...result.moved].sort()).toEqual(['houses:cny', 'houses:default']);
		expect(result.compacted).toEqual(['houses']);

		const row = await settingsRow(t, 'leaderboard.houses');
		expect(row?.value).not.toContain('base64');
		expect(JSON.parse(row!.value)).toEqual({ enabled: false, theme: 'christmas', updatedAt: 1 });

		const configs = await t.query(api.leaderboards.list, {});
		const houses = configs.find((c: LeaderboardConfig) => c.board === 'houses');
		expect(houses?.enabled).toBe(false);
		expect(houses?.theme).toBe('christmas');
		expect(houses?.themes.default).toBe('data:image/png;base64,HOUSES_DEFAULT');
		expect(houses?.themes.cny).toBe('data:image/png;base64,HOUSES_CNY');
	});

	it('is idempotent', async () => {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert('settings', {
				key: 'leaderboard.houses',
				value: legacyValue({ cny: 'data:image/png;base64,HOUSES_CNY' }),
				updatedAt: 1
			})
		);
		await t.mutation(internal.leaderboards.migrateThumbnails, {});
		const second = await t.mutation(internal.leaderboards.migrateThumbnails, {});
		expect(second).toEqual({ moved: [], compacted: [] });
		const rows = await t.run((ctx) => ctx.db.query('leaderboard_thumbnails').collect());
		expect(rows).toHaveLength(1);
	});
});
