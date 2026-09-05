export type LeaderboardThemeId = 'default' | 'thanksgiving' | 'christmas' | 'cny';

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
		wittyEmoji: '✨'
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
		wittyEmoji: '🦃'
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
		wittyEmoji: '🎄'
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
		wittyEmoji: '🧧'
	}
};

export function resolveLeaderboardThemeId(theme: string | undefined): LeaderboardThemeId {
	if (theme === 'thanksgiving' || theme === 'christmas' || theme === 'cny') {
		return theme;
	}
	return 'default';
}

export function resolveLeaderboardTheme(theme: string | undefined): LeaderboardTheme {
	if (theme === 'thanksgiving' || theme === 'christmas' || theme === 'cny') {
		return LEADERBOARD_THEMES[theme];
	}
	return LEADERBOARD_THEMES.default;
}
