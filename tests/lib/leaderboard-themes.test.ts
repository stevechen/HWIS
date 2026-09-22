import { describe, it, expect } from 'vitest';
import {
	LEADERBOARD_THEME_OPTIONS,
	LEADERBOARD_THEMES,
	resolveLeaderboardTheme,
	resolveLeaderboardThemeId,
	themeLabel,
	type LeaderboardThemeId
} from '$lib/leaderboard-themes';

const THEME_IDS: LeaderboardThemeId[] = [
	'default',
	'thanksgiving-1',
	'thanksgiving-2',
	'christmas',
	'cny',
	'halloween'
];
const DEFAULT_LABEL = LEADERBOARD_THEMES.default.label;

describe('leaderboard theme registry', () => {
	it('offers exactly the six seasonal themes', async () => {
		expect(LEADERBOARD_THEME_OPTIONS.map((o) => o.value).sort()).toEqual([...THEME_IDS].sort());
	});

	it('gives each season a distinct backdrop and glow', async () => {
		expect(new Set(THEME_IDS.map((id) => LEADERBOARD_THEMES[id].section)).size).toBe(
			THEME_IDS.length
		);
		expect(new Set(THEME_IDS.map((id) => LEADERBOARD_THEMES[id].pointsGlow)).size).toBe(
			THEME_IDS.length
		);
	});

	it.each(THEME_IDS)('resolves the %s theme id to itself', async (id) => {
		expect(resolveLeaderboardThemeId(id)).toBe(id);
	});

	it.each([undefined, '', 'easter', 'DEFAULT', 'thanksgiving'])(
		'falls back to default for unknown theme %s',
		async (input) => {
			expect(resolveLeaderboardThemeId(input)).toBe('default');
			expect(resolveLeaderboardTheme(input).label).toBe(DEFAULT_LABEL);
		}
	);

	it.each(THEME_IDS)('labels the %s theme', async (id) => {
		expect(themeLabel(id)).toBe(LEADERBOARD_THEMES[id].label);
	});

	it('labels unknown themes as Enchanted Ceiling', async () => {
		expect(themeLabel('easter' as LeaderboardThemeId)).toBe(DEFAULT_LABEL);
	});

	it.each(THEME_IDS)('ships a complete %s theme bundle', async (id) => {
		const theme = LEADERBOARD_THEMES[id];
		// Style keys consumed by the leaderboard pages — every theme must define all of them.
		// `ink` keeps loading/error chrome readable on light themes (parchment).
		for (const key of [
			'section',
			'titleFont',
			'font',
			'card',
			'cardHeader',
			'divider',
			'panelTitle',
			'pointsGlow',
			'ink'
		] as const) {
			expect(theme[key], key).toBeTruthy();
		}
		// Content keys consumed by the disabled screen.
		expect(theme.wittyTitle).toBeTruthy();
		expect(theme.wittySubtitle).toBeTruthy();
		expect(theme.wittyEmoji).toBeTruthy();
		expect(theme.mote).toBeTruthy();
		expect(theme.wittyExtras.length).toBeGreaterThan(0);
	});
});
