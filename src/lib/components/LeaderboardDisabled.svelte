<script lang="ts">
	import { resolveLeaderboardTheme, type LeaderboardThemeId } from '$lib/leaderboard-themes';

	let {
		boardLabel = 'Leaderboard',
		theme = 'default' as LeaderboardThemeId
	}: { boardLabel?: string; theme?: LeaderboardThemeId } = $props();

	const t = $derived(resolveLeaderboardTheme(theme));
</script>

<div
	class="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
	role="status"
	aria-live="polite"
	aria-label="{boardLabel} is not ready yet"
	data-testid="leaderboard-disabled"
>
	<div class="animate-pulse text-6xl" aria-hidden="true">{t.wittyEmoji}</div>
	<h1 class="text-[clamp(1.6rem,3vw,3rem)] font-black tracking-wide">{t.wittyTitle}</h1>
	<p class="text-[clamp(1rem,1.6vw,1.5rem)] opacity-70">{t.wittySubtitle}</p>
	<p class="mt-2 text-sm tracking-widest uppercase opacity-40">{boardLabel} · not ready yet</p>
</div>
