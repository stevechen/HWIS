<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { houseLogos } from '$lib/assets/house-logos';
	import type { House } from '$lib/constants/houses';
	import { resolveLeaderboardTheme } from '$lib/leaderboard-themes';

	type Contributor = { studentId: string; englishName: string; totalPoints: number };
	type HouseEntry = {
		house: string;
		rank: number;
		totalPoints: number;
		pointsByCategory?: Record<string, number>;
		topContributors?: Contributor[];
	};
	type WorkshopProps = { houses?: HouseEntry[]; categories?: string[] };

	// This board mounts once per theme on a real Svelte 5 runtime — but the
	// browser tests share one document, so `render` mounts it repeatedly.

	let { houses = [] as HouseEntry[], categories = [] as string[] }: WorkshopProps = $props();

	const theme = $derived(resolveLeaderboardTheme('christmas'));
	// Ledger order: lowest rank number first, so "order #01" reads left to right.
	const sorted = $derived([...houses].sort((a, b) => a.rank - b.rank));

	const CREST_BG: Record<House, string> = {
		Heracles: 'bg-red-500/10',
		Wukong: 'bg-amber-500/10',
		Ixbalam: 'bg-emerald-500/10',
		Setna: 'bg-blue-500/10'
	};

	/** Share of the category leader, so every bar is comparable across houses. */
	function categoryPct(category: string, points: number): number {
		const leader = Math.max(...sorted.map((h) => h.pointsByCategory?.[category] ?? 0), 1);
		return Math.round((points / leader) * 100);
	}

	type Flake = { left: number; size: number; delay: number; dur: number };
	let flakes = $state<Flake[]>([]);
	onMount(() => {
		if (!browser) return;
		flakes = Array.from({ length: 70 }, () => ({
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

<section class="relative flex h-full min-h-0 flex-col {theme.section} px-[3vw] py-[1.5vh]">
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		{#each flakes as f, i (i)}
			<span
				class="flake"
				style="left:{f.left}%; --size:{f.size}px; --delay:{f.delay}s; --dur:{f.dur}s"
			></span>
		{/each}
	</div>

	<header class="relative z-10 shrink-0 text-center">
		<h1 class="font-cinzel text-[clamp(2rem,2.4vw,4.6rem)] leading-none font-black tracking-wide">
			Santa’s Workshop Ledger
		</h1>
		<p class="mt-[0.6vh] text-[clamp(1rem,1vw,1.9rem)] text-red-100/70 italic">
			every kind act is an order fulfilled — the elves tally nightly
		</p>
	</header>

	<div
		class="relative z-10 mx-auto grid min-h-0 w-full max-w-none flex-1 grid-cols-1 content-stretch items-stretch gap-[clamp(1rem,3.5vw,3.5rem)] sm:grid-cols-2 xl:grid-cols-4"
	>
		{#each sorted as h (h.house)}
			{@const Crest = houseLogos[h.house as House]}
			<article
				class="flex flex-1 flex-col overflow-hidden rounded-2xl border border-red-200/25 bg-white/6 shadow-[0_20px_60px_-20px_rgba(248,113,113,0.4)] {h.rank ===
				1
					? 'ring-2 ring-yellow-300/60'
					: ''}"
			>
				<div class="candy h-[0.8vh] max-h-2 min-h-1.5 w-full shrink-0" aria-hidden="true"></div>
				<div
					class="border-b border-red-200/15 px-[clamp(0.75rem,1.1vw,2rem)] py-[clamp(0.6rem,1vh,1.8rem)]"
				>
					<div class="flex items-center justify-between gap-[clamp(0.75rem,1vw,1.5rem)]">
						<div
							class="flex size-[clamp(3.5rem,min(4.5vw,9vh),6.5rem)] shrink-0 items-center justify-center rounded-full p-3 {CREST_BG[
								h.house as House
							]} ring-4 ring-emerald-500/35"
							role="img"
							aria-label="{h.house} crest"
						>
							<Crest />
						</div>
						<div class="text-right">
							<span
								class="rounded-full border px-[0.8vw] py-[0.4vh] text-[clamp(0.85rem,1vw,1.9rem)] font-black {h.rank ===
								1
									? 'border-yellow-300 bg-yellow-300 text-red-950'
									: 'border-red-200/30 text-red-100/70'}"
							>
								{h.rank}{h.rank === 1 ? 'st' : h.rank === 2 ? 'nd' : h.rank === 3 ? 'rd' : 'th'}
								{h.rank === 1 ? '🏆' : ''}
							</span>
							<p
								class="mt-[0.4vh] text-[clamp(2.25rem,min(4vw,8vh),6.5rem)] leading-none font-black {theme.pointsGlow}"
							>
								{h.totalPoints}
							</p>
						</div>
					</div>
					<p class="sr-only">{h.house}</p>
				</div>
				{#if categories.length > 0}
					<ul
						class="space-y-[0.4vh] px-[clamp(0.75rem,1vw,1.8rem)] py-[0.5vh] text-left text-[clamp(0.9rem,0.95vw,1.8rem)]"
						aria-label="{h.house} points by category"
					>
						{#each categories as cat (cat)}
							{@const val = h.pointsByCategory?.[cat] ?? 0}
							<li>
								<div class="flex justify-between leading-tight">
									<span class="truncate text-red-100/70">{cat}</span>
									<b class="text-red-50">{val}</b>
								</div>
								<div
									class="mt-[0.4vh] h-[0.7vh] min-h-1.5 overflow-hidden rounded-full bg-black/50"
								>
									<div
										class="h-full rounded-full bg-red-400/90"
										style="width:{categoryPct(cat, val)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
				<div
					class="flex flex-1 flex-col justify-center min-h-0 border-t border-red-200/15 px-[clamp(0.75rem,1vw,1.8rem)] py-[0.5vh] text-left text-[clamp(0.9rem,0.95vw,1.8rem)]"
				>
					<p
						class="mb-[0.6vh] text-[clamp(0.85rem,0.9vw,1.7rem)] font-bold tracking-widest text-yellow-200/80 uppercase"
					>
						⭐ Nice list
					</p>
					{#each (h.topContributors ?? []).slice(0, 10) as c (c.studentId)}
						<div class="flex justify-between gap-2 leading-tight">
							<span class="truncate text-red-50/85">{c.englishName}</span>
							<b class="text-yellow-200">+{c.totalPoints}</b>
						</div>
					{/each}
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
	.font-cinzel {
		font-family: 'Cinzel', Georgia, serif;
	}
	.flake {
		position: absolute;
		width: var(--size, 3px);
		height: var(--size, 3px);
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.9);
		pointer-events: none;
		animation: flakeFall var(--dur, 6s) linear var(--delay, 0s) infinite;
	}
	@keyframes flakeFall {
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
	.candy {
		background: repeating-linear-gradient(135deg, #ef4444 0 8px, #fff1f2 8px 16px);
	}
</style>
