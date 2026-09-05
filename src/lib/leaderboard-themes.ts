export type LeaderboardThemeId = 'default' | 'thanksgiving' | 'christmas' | 'cny';

export type WittyMessage = {
	title: string;
	subtitle: string;
};

export type LeaderboardTheme = {
	label: string;
	section: string;
	titleFont: string;
	font: string;
	card: string;
	cardHeader: string;
	divider: string;
	panelTitle: string;
	pointsGlow: string;
	wittyTitle: string;
	wittySubtitle: string;
	wittyEmoji: string;
	/** Rotating follow-up jokes shown after the main message. */
	wittyExtras: WittyMessage[];
	/** Ambient glyph drifting behind the disabled screen (stars, leaves, snow, lanterns). */
	mote: string;
};

export const LEADERBOARD_THEME_OPTIONS: { value: LeaderboardThemeId; label: string }[] = [
	{ value: 'default', label: 'Enchanted Ceiling' },
	{ value: 'thanksgiving', label: 'Thanksgiving' },
	{ value: 'christmas', label: 'Christmas' },
	{ value: 'cny', label: 'Chinese New Year' }
];

export function themeLabel(theme: LeaderboardThemeId): string {
	return LEADERBOARD_THEME_OPTIONS.find((o) => o.value === theme)?.label ?? 'Enchanted Ceiling';
}

const baseFonts = {
	titleFont: 'font-cinzel',
	font: 'font-cormorant'
};

export const LEADERBOARD_THEMES: Record<LeaderboardThemeId, LeaderboardTheme> = {
	default: {
		label: 'Enchanted Ceiling',
		section: 'bg-[#050716] text-indigo-50',
		...baseFonts,
		card: 'organic-border border-indigo-200/25 bg-white/[0.06] backdrop-blur-2xl shadow-[0_25px_80px_-20px_rgba(90,120,255,0.28)]',
		cardHeader: 'border-b border-indigo-200/15',
		divider: 'border-indigo-200/10',
		panelTitle: 'text-indigo-100',
		pointsGlow: 'text-cyan-200 drop-shadow-[0_0_24px_rgba(120,220,255,0.8)]',
		wittyTitle: 'The Great Hall is taking a nap…',
		wittySubtitle: 'the house elves hid the scoreboard under a blanket of stars',
		wittyEmoji: '✨',
		wittyExtras: [
			{
				title: 'The portraits are re-hanging the scores…',
				subtitle: 'they argue about the order — it takes a while'
			},
			{
				title: 'The star ceiling dimmed for intermission…',
				subtitle: 'the house cups are being polished'
			}
		],
		mote: '✦'
	},
	thanksgiving: {
		label: 'Thanksgiving',
		section: 'bg-[#1a0e05] text-amber-50',
		...baseFonts,
		card: 'organic-border border-amber-200/25 bg-white/[0.06] backdrop-blur-2xl shadow-[0_25px_80px_-20px_rgba(217,119,6,0.35)]',
		cardHeader: 'border-b border-amber-200/15',
		divider: 'border-amber-200/10',
		panelTitle: 'text-amber-100',
		pointsGlow: 'text-amber-200 drop-shadow-[0_0_24px_rgba(251,191,36,0.8)]',
		wittyTitle: 'The turkeys ate the scoreboard…',
		wittySubtitle: 'we are basting a fresh one — back after pie',
		wittyEmoji: '🦃',
		wittyExtras: [
			{
				title: 'The gravy boat overflowed onto the scores…',
				subtitle: 'mopping up with dinner rolls'
			},
			{
				title: 'The pie needs cooling before rankings…',
				subtitle: 'patience smells like cinnamon'
			}
		],
		mote: '🍂'
	},
	christmas: {
		label: 'Christmas',
		section: 'bg-[#04120c] text-emerald-50',
		...baseFonts,
		card: 'organic-border border-emerald-200/25 bg-white/[0.06] backdrop-blur-2xl shadow-[0_25px_80px_-20px_rgba(16,185,129,0.3)]',
		cardHeader: 'border-b border-emerald-200/15',
		divider: 'border-emerald-200/10',
		panelTitle: 'text-emerald-100',
		pointsGlow: 'text-red-200 drop-shadow-[0_0_24px_rgba(252,165,165,0.8)]',
		wittyTitle: 'Santa is checking the list… twice',
		wittySubtitle: 'the reindeer knocked the scoreboard off the sleigh',
		wittyEmoji: '🎄',
		wittyExtras: [
			{
				title: 'The elves wrapped the scoreboard by mistake…',
				subtitle: 'it looked like a present'
			},
			{
				title: 'The hot cocoa break ran long…',
				subtitle: 'marshmallows before mathematics'
			}
		],
		mote: '❄'
	},
	cny: {
		label: 'Chinese New Year',
		section: 'bg-[#160607] text-red-50',
		...baseFonts,
		card: 'organic-border border-red-200/25 bg-white/[0.06] backdrop-blur-2xl shadow-[0_25px_80px_-20px_rgba(220,38,38,0.35)]',
		cardHeader: 'border-b border-red-200/15',
		divider: 'border-red-200/10',
		panelTitle: 'text-red-100',
		pointsGlow: 'text-yellow-200 drop-shadow-[0_0_24px_rgba(253,224,71,0.85)]',
		wittyTitle: 'The lions are dancing past the scoreboard…',
		wittySubtitle: 'red envelopes first, rankings right after',
		wittyEmoji: '🧧',
		wittyExtras: [
			{
				title: 'The firecrackers startled the scorekeeper…',
				subtitle: 'counting resumes after the echoes'
			},
			{
				title: 'The dumplings come before the data…',
				subtitle: 'full stomachs rank better'
			}
		],
		mote: '🏮'
	}
};

/**
 * TV display mode flag shared by the leaderboard shell (`?display=1` hides the
 * floating toggle chrome) and the admin page (open + thumbnail capture URLs).
 * Query flag, not dedicated routes: one shell serves both modes, and the URL
 * stays bookmarkable per board.
 */
export const DISPLAY_PARAM = 'display';

export function displayPath(path: string): string {
	return `${path}?${DISPLAY_PARAM}=1`;
}

export function isDisplayUrl(url: URL): boolean {
	return url.searchParams.get(DISPLAY_PARAM) === '1';
}

export function resolveLeaderboardThemeId(theme: string | undefined): LeaderboardThemeId {
	if (theme === 'thanksgiving' || theme === 'christmas' || theme === 'cny') {
		return theme;
	}
	return 'default';
}

export function resolveLeaderboardTheme(theme: string | undefined): LeaderboardTheme {
	return LEADERBOARD_THEMES[resolveLeaderboardThemeId(theme)];
}
