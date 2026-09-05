<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { resolveLeaderboardTheme, type LeaderboardThemeId } from '$lib/leaderboard-themes';

	let {
		boardLabel = 'Leaderboard',
		theme = 'default' as LeaderboardThemeId
	}: { boardLabel?: string; theme?: LeaderboardThemeId } = $props();

	const activeTheme = $derived(resolveLeaderboardTheme(theme));

	type Mote = { left: number; top: number; size: number; delay: number; dur: number };
	let motes = $state<Mote[]>([]);
	let msgIndex = $state(0);
	let interval: ReturnType<typeof setInterval> | null = null;

	const messages = $derived([
		{ title: activeTheme.wittyTitle, subtitle: activeTheme.wittySubtitle },
		...activeTheme.wittyExtras
	]);
	const message = $derived(messages[msgIndex % messages.length]);

	onMount(() => {
		if (!browser) return;
		const rand = (min: number, max: number) => min + Math.random() * (max - min);
		motes = Array.from({ length: 24 }, () => ({
			left: rand(0, 100),
			top: rand(0, 100),
			size: rand(0.9, 1.8),
			delay: rand(0, 6),
			dur: rand(5, 11)
		}));
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!reduceMotion && messages.length > 1) {
			interval = setInterval(() => {
				msgIndex = (msgIndex + 1) % messages.length;
			}, 4200);
		}
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});
</script>

<div
	class="relative flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 overflow-hidden text-center"
	data-testid="leaderboard-disabled"
>
	<div
		class="pointer-events-none absolute inset-0 overflow-hidden"
		aria-hidden="true"
		data-testid="leaderboard-disabled-motes"
	>
		{#each motes as mote, i (i)}
			<span
				class="mote"
				style="left:{mote.left}%; top:{mote.top}%; font-size:{mote.size}rem; animation-delay:{mote.delay}s; animation-duration:{mote.dur}s;"
				>{activeTheme.mote}</span
			>
		{/each}
	</div>

	<div class="relative z-10 flex flex-col items-center gap-4">
		<div class="animate-pulse text-6xl" aria-hidden="true">{activeTheme.wittyEmoji}</div>
		<div role="status" aria-live="polite">
			{#key msgIndex}
				<h1
					class="animate-[slideInUp_0.5s_ease-out] text-[clamp(1.6rem,3vw,3rem)] font-black tracking-wide"
				>
					{message.title}
				</h1>
				<p class="text-[clamp(1rem,1.6vw,1.5rem)] opacity-70">{message.subtitle}</p>
			{/key}
		</div>
		<p class="mt-2 text-sm tracking-widest uppercase opacity-40">{boardLabel} · not ready yet</p>
	</div>
</div>

<style>
	@keyframes slideInUp {
		0% {
			transform: translateY(20px);
			opacity: 0;
		}
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.mote {
		position: absolute;
		opacity: 0.15;
		pointer-events: none;
		animation: drift 8s ease-in-out infinite;
	}

	@keyframes drift {
		0%,
		100% {
			opacity: 0.08;
			transform: translateY(0) scale(0.85);
		}
		50% {
			opacity: 0.4;
			transform: translateY(-24px) scale(1.1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mote {
			animation: none;
			opacity: 0.2;
		}
	}
</style>
