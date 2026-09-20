<script lang="ts">
	import { houseLogos } from '$lib/assets/house-logos';
	import type { House } from '$lib/constants/houses';
	import { HOUSES } from '$lib/constants/houses';
	import { resolveLeaderboardTheme } from '$lib/leaderboard-themes';

	type Contributor = { studentId: string; englishName: string; totalPoints: number };
	type HouseEntry = {
		house: string;
		rank: number;
		totalPoints: number;
		pointsByCategory?: Record<string, number>;
		topContributors?: Contributor[];
	};

	let {
		houses = [] as HouseEntry[],
		categories = [] as string[]
	}: { houses?: HouseEntry[]; categories?: string[] } = $props();

	const theme = $derived(resolveLeaderboardTheme('thanksgiving-1'));
	const sorted = $derived(
		[...houses].sort((a, b) => HOUSES.indexOf(a.house as House) - HOUSES.indexOf(b.house as House))
	);
	const maxCat = $derived(
		Math.max(...sorted.flatMap((h) => Object.values(h.pointsByCategory ?? {})), 1)
	);
</script>

<section class="flex h-full min-h-0 flex-col {theme.section} {theme.font} p-[clamp(1rem,2vw,2rem)]">
	<header class="mx-auto max-w-6xl shrink-0">
		<div class="flex items-center justify-center gap-[clamp(1rem,2.5vw,3rem)]">
			<p class="text-[clamp(1.75rem,2.4vw,3.5rem)]" aria-hidden="true">🦃 🌽 🥧</p>
			<h1 class="font-cinzel text-[clamp(2rem,2.8vw,4.5rem)] leading-none font-black tracking-wide">
				Harvest Feast
			</h1>
			<p class="text-[clamp(1.75rem,2.4vw,3.5rem)]" aria-hidden="true">🥧 🌽 🦃</p>
		</div>
		<p class="mt-1 text-center text-[clamp(1rem,1.3vw,2rem)] text-amber-200/70 italic">
			I haven't even finished eating all of my Halloween candy!
		</p>
		<div
			class="mx-auto mt-3 h-1 w-2/3 rounded-full bg-linear-to-r from-transparent via-amber-500 to-transparent"
			aria-hidden="true"
		></div>
	</header>

	<div
		class="mx-auto mt-[1.5vh] grid min-h-0 w-full flex-1 grid-cols-1 gap-[clamp(1.5rem,2.5vw,2rem)] sm:grid-cols-2 lg:grid-cols-4 xl:gap-[clamp(2rem,3vw,2.5rem)]"
	>
		{#each sorted as h (h.house)}
			{@const Crest = houseLogos[h.house as House]}
			<article
				class="flex flex-1 flex-col overflow-hidden rounded-3xl border bg-amber-950/60 px-[clamp(1rem,1.4vw,2.5rem)] py-[1.2vh] text-center shadow-[0_20px_60px_-20px_rgba(217,119,6,0.5)] {h.rank ===
				1
					? 'border-yellow-300/70 shadow-[0_0_50px_-10px_rgba(251,191,36,0.55)]'
					: 'border-amber-200/30'}"
			>
				<div class="flex items-center justify-between gap-[clamp(0.75rem,1.2vw,1.5rem)] text-left">
					<div
						class="flex size-[clamp(3.5rem,min(4.5vw,9vh),6.5rem)] shrink-0 items-center justify-center rounded-full bg-amber-500/10 p-[clamp(1rem,1.5vw,1.25rem)] text-amber-200 ring-2 ring-amber-400/50"
						role="img"
						aria-label="{h.house} crest"
					>
						<Crest />
					</div>
					<div class="min-w-0">
						<span
							class="inline-flex items-center gap-1.5 rounded-full border px-[clamp(0.6rem,1vw,1.2rem)] py-[0.4vh] text-[clamp(0.85rem,1vw,1.7rem)] font-black {h.rank ===
							1
								? 'border-yellow-300 bg-yellow-300 text-amber-950'
								: 'border-amber-200/30 text-amber-200/70'}"
						>
							{#if h.rank === 1}<span aria-hidden="true">🏆</span>{/if}
							{h.rank}{h.rank === 1 ? 'st' : h.rank === 2 ? 'nd' : h.rank === 3 ? 'rd' : 'th'}
						</span>
						<p
							class="mt-[0.4vh] text-[clamp(2.5rem,min(4vw,8vh),6rem)] leading-none font-black text-amber-200 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]"
						>
							{h.totalPoints}
						</p>
					</div>
				</div>
				<p class="sr-only">{h.house}</p>
				{#if categories.length > 0}
					<ul
						class="mt-[0.8vh] mb-[1.5vh] space-y-[0.4vh] text-left text-[clamp(0.9rem,1vw,1.8rem)] leading-tight"
						aria-label="{h.house} points by category"
					>
						{#each categories as cat (cat)}
							<li>
								<div class="flex justify-between gap-2">
									<span class="truncate text-amber-200/70">{cat}</span>
									<b>{h.pointsByCategory?.[cat] ?? 0}</b>
								</div>
								<div class="h-[1vh] min-h-2 overflow-hidden rounded-full bg-black/50">
									<div
										class="h-[1vh] min-h-2 rounded-full bg-amber-400"
										style="width:{Math.round(((h.pointsByCategory?.[cat] ?? 0) / maxCat) * 100)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
				<ul
					class="flex flex-1 flex-col justify-center min-h-0 border-t border-amber-200/15 pt-[1.4vh] text-left text-[clamp(0.9rem,1vw,1.8rem)] leading-tight"
				>
					<p
						class="mb-[0.5vh] text-[clamp(0.8rem,0.9vw,1.6rem)] font-bold tracking-widest text-amber-300/70 uppercase"
					>
						Top carvers
					</p>
					{#each (h.topContributors ?? []).slice(0, 10) as c (c.studentId)}
						<li class="flex justify-between gap-2">
							<span class="truncate">{c.englishName}</span><b>+{c.totalPoints}</b>
						</li>
					{/each}
				</ul>
			
			</article>
		{/each}
	</div>
</section>

<style>
	.font-cinzel {
		font-family: 'Cinzel', Georgia, serif;
	}
</style>
