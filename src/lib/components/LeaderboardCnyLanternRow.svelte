<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { houseLogos } from '$lib/assets/house-logos';
	import CnyGlyph from '$lib/components/CnyGlyph.svelte';
	import { cnyGlyphs } from '$lib/components/cny-glyphs';
	import type { House } from '$lib/constants/houses';
	import { resolveLeaderboardTheme } from '$lib/leaderboard-themes';

	type Contributor = { studentId: string; englishName: string; totalPoints: number };
	type HouseEntry = {
		house: string;
		rank: number;
		totalPoints: number;
		topContributors?: Contributor[];
	};

	let { houses = [] as HouseEntry[] }: { houses?: HouseEntry[] } = $props();

	const theme = $derived(resolveLeaderboardTheme('cny'));
	// Brightest lantern hangs highest: rank order drives the vertical stagger.
	const sorted = $derived([...houses].sort((a, b) => a.rank - b.rank));
	const maxPoints = $derived(Math.max(...sorted.map((h) => h.totalPoints), 1));

	/** Glow strength scales with the house's share of the leader. */
	function glowFor(points: number): number {
		return 0.35 + 0.65 * (points / maxPoints);
	}

	type Ember = { left: number; size: number; delay: number; dur: number };
	let embers = $state<Ember[]>([]);
	onMount(() => {
		if (!browser) return;
		embers = Array.from({ length: 70 }, () => ({
			left: Math.random() * 100,
			size: 2 + Math.random() * 4,
			delay: Math.random() * 6,
			dur: 4 + Math.random() * 6
		}));
	});
</script>

<svelte:head>
	<title>HWIS House Points</title>
</svelte:head>

<section class="relative flex min-h-[calc(100vh-4rem)] flex-col {theme.section} px-[3vw] py-[1vh]">
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		{#each embers as e, i (i)}
			<span
				class="ember"
				style="left:{e.left}%; --size:{e.size}px; --delay:{e.delay}s; --dur:{e.dur}s"
			></span>
		{/each}
	</div>

	<header class="relative z-10 text-center">
		<h1
			class="font-cny text-[clamp(2.25rem,3.2vw,6.5rem)] leading-none font-bold tracking-wide text-yellow-100"
		>
			Lantern Row
		</h1>
		<p class="mt-[0.6vh] text-[clamp(1rem,1.25vw,2.4rem)] text-red-100/70 italic">
			the higher the glow, the brighter the year
		</p>
	</header>

	<div class="relative z-10 mx-auto w-full flex-1 px-[2vw]">
		<div
			class="absolute top-0 right-0 left-0 h-1 rounded-full bg-yellow-500/50"
			aria-hidden="true"
		></div>
		<div
			class="relative flex h-full items-stretch justify-center gap-[clamp(1.5rem,2.5vw,5rem)] pt-[3vh]"
		>
			{#each sorted as h, i (h.house)}
				{@const Crest = houseLogos[h.house as House]}
				{@const glow = glowFor(h.totalPoints)}
				<div
					class="flex w-[clamp(12rem,24vw,38rem)] flex-1 flex-col items-center"
					style="padding-top:calc({i} * 3vh); padding-bottom:calc({sorted.length - 1 - i} * 3vh)"
				>
					<div class="h-8 w-px bg-yellow-500/50" aria-hidden="true"></div>
					<div class="h-4 w-8 rounded-t-sm bg-yellow-600/80" aria-hidden="true"></div>
					<div
						class="relative flex aspect-4/3 w-full flex-1 flex-col items-center justify-center rounded-4xl border-2 border-yellow-400/60"
						style="background: radial-gradient(ellipse at 50% 42%, rgba(251,191,36,{glow}) 0%, rgba(220,38,38,{0.5 +
							glow *
								0.45}) 48%, rgba(127,29,29,0.95) 100%); box-shadow: 0 0 70px -12px rgba(251,191,36,{glow *
							0.9});"
						role="img"
						aria-label="{h.house}: {h.totalPoints} points, rank {h.rank}"
					>
						<div
							class="absolute inset-0 rounded-4xl opacity-50"
							style="background: repeating-linear-gradient(180deg, transparent 0 1.1rem, rgba(253,224,71,0.35) 1.1rem calc(1.1rem + 2px));"
							aria-hidden="true"
						></div>
						<div
							class="flex size-[clamp(3rem,9vw,8.5rem)] items-center justify-center rounded-full bg-black/25 p-2 ring-2 ring-yellow-300/70"
							aria-hidden="true"
						>
							<Crest />
						</div>
						<p
							class="relative mt-[0.6vh] text-[clamp(1.75rem,2.8vw,5.5rem)] leading-none font-black text-yellow-100 drop-shadow-[0_0_18px_rgba(253,224,71,0.9)]"
						>
							{h.totalPoints}
						</p>
						<p
							class="relative text-[clamp(0.85rem,1.1vw,2.1rem)] tracking-[0.25em] text-yellow-200/80 uppercase"
						>
							points
						</p>
					</div>
					<div class="h-4 w-8 rounded-b-sm bg-yellow-600/80" aria-hidden="true"></div>
					<div class="h-7 w-0.5 bg-red-400/80" aria-hidden="true"></div>
					<div
						class="size-2.5 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
						aria-hidden="true"
					></div>
					<span
						class="rounded-full border px-[1vw] py-[0.6vh] text-[clamp(0.9rem,1.05vw,2rem)] font-bold {h.rank ===
						1
							? 'border-yellow-300 bg-yellow-400 text-red-950'
							: 'border-yellow-500/40 text-yellow-200/80'}"
					>
						{h.rank === 1 ? '🏆 ' : ''}{h.rank}{h.rank === 1
							? 'st'
							: h.rank === 2
								? 'nd'
								: h.rank === 3
									? 'rd'
									: 'th'}
					</span>
					<p class="mt-[1.2vh] text-center text-[clamp(1rem,1.15vw,2.2rem)] text-red-100/60">
						{(h.topContributors ?? [])
							.slice(0, 3)
							.map((c) => c.englishName.split(' ')[0])
							.join(' · ')}
					</p>
				</div>
			{/each}
		</div>
		<div
			class="absolute top-[18%] left-[1.5vw] hidden flex-col items-center gap-[0.4rem] text-yellow-300/80 xl:flex"
			aria-hidden="true"
		>
			<!-- 福 · 祿 · 壽 — calligraphy outlines, no Chinese font needed on capture -->
			<div class="flex h-8 w-8 items-center justify-center rounded-md border border-current">
				<CnyGlyph glyph={cnyGlyphs.fu} class="size-6" />
			</div>
			<div
				class="flex h-8 w-8 items-center justify-center rounded-md border border-current opacity-85"
			>
				<CnyGlyph glyph={cnyGlyphs.lu} class="size-6" />
			</div>
			<div
				class="flex h-8 w-8 items-center justify-center rounded-md border border-current opacity-70"
			>
				<CnyGlyph glyph={cnyGlyphs.shou} class="size-6" />
			</div>
		</div>
		<p
			class="absolute top-[18%] -right-1 hidden w-8 text-center text-[clamp(1.4rem,2.6vw,4rem)] text-yellow-300/80 [writing-mode:vertical-rl] xl:block"
			aria-hidden="true"
		>
			fortune · luck · prosperity
		</p>
	</div>
	<div
		class="absolute right-6 bottom-6 z-10 flex size-[clamp(2rem,5vw,6rem)] rotate-180 items-center justify-center rounded-xl border-2 border-yellow-300/70 text-yellow-300/70"
		aria-hidden="true"
	>
		<!-- 福 — calligraphy outline, no Chinese font needed on capture -->
		<CnyGlyph glyph={cnyGlyphs.fu} class="size-[70%]" />
	</div>
</section>

<style>
	.font-cny {
		font-family: 'Cinzel', serif;
	}
	.font-brush {
		/* Inline SVG decorations replace LXGW WenKai TC / Ma Shan Zheng for offline capture support */
		font-family: 'Cinzel', serif;
	}
	.ember {
		position: absolute;
		width: var(--size, 3px);
		height: var(--size, 3px);
		border-radius: 9999px;
		background: #fcd34d;
		box-shadow: 0 0 8px #f59e0b;
		pointer-events: none;
		animation: emberFall var(--dur, 6s) linear var(--delay, 0s) infinite;
	}
	@keyframes emberFall {
		0% {
			transform: translateY(-5vh);
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		100% {
			transform: translateY(110vh);
			opacity: 0.4;
		}
	}
</style>
