<script lang="ts">
	import { houseLogos } from '$lib/assets/house-logos';
	import type { House } from '$lib/constants/houses';
	import { resolveLeaderboardTheme } from '$lib/leaderboard-themes';

	type Contributor = { studentId: string; englishName: string; totalPoints: number };
	type Growth = { studentId: string; englishName: string; pointsLost: number };
	type HouseEntry = {
		house: string;
		rank: number;
		totalPoints: number;
		pointsByCategory?: Record<string, number>;
		topContributors?: Contributor[];
		growthOpportunities?: Growth[];
	};

	let { houses = [] as HouseEntry[] }: { houses?: HouseEntry[] } = $props();

	const theme = $derived(resolveLeaderboardTheme('thanksgiving-1'));
	const sorted = $derived([...houses].sort((a, b) => a.rank - b.rank));
	const maxCat = $derived(
		Math.max(...sorted.flatMap((h) => Object.values(h.pointsByCategory ?? {})), 1)
	);
</script>

<section class="min-h-screen {theme.section} {theme.font} p-[clamp(0.75rem,2vw,2rem)]">
	<header class="mx-auto max-w-6xl text-center">
		<p class="text-[clamp(1.75rem,3vw,3rem)]" aria-hidden="true">🦃 🌽 🥧</p>
		<h1
			class="font-cinzel mt-2 text-[clamp(2rem,3.5vw,3.5rem)] leading-none font-black tracking-wide"
		>
			Harvest Feast
		</h1>
		<p class="mt-1 text-[clamp(0.9rem,1.3vw,1.25rem)] text-amber-200/70 italic">
			every house has a seat at the table — points are the dishes
		</p>
		<div
			class="mx-auto mt-3 h-1 w-2/3 rounded-full bg-gradient-to-r from-transparent via-amber-500 to-transparent"
			aria-hidden="true"
		></div>
	</header>

	<div
		class="mx-auto mt-[clamp(1rem,2vw,1.5rem)] grid max-w-6xl grid-cols-1 gap-[clamp(0.75rem,1.5vw,1.25rem)] sm:grid-cols-2 lg:grid-cols-4"
	>
		{#each sorted as h (h.house)}
			{@const Crest = houseLogos[h.house as House]}
			<article
				class="rounded-2xl border bg-amber-950/60 p-[clamp(0.75rem,1.2vw,1.25rem)] text-center shadow-[0_20px_60px_-20px_rgba(217,119,6,0.5)] {h.rank ===
				1
					? 'border-yellow-300/70 shadow-[0_0_50px_-10px_rgba(251,191,36,0.55)]'
					: 'border-amber-200/30'}"
			>
				<span
					class="inline-flex items-center gap-1 rounded-full border px-[clamp(0.5rem,0.8vw,0.75rem)] py-0.5 text-[clamp(0.7rem,1vw,0.9rem)] font-black {h.rank ===
					1
						? 'border-yellow-300 bg-yellow-300 text-amber-950'
						: 'border-amber-200/30 text-amber-200/70'}"
				>
					{#if h.rank === 1}<span aria-hidden="true">🏆</span>{/if}
					{h.rank}{h.rank === 1 ? 'st' : h.rank === 2 ? 'nd' : h.rank === 3 ? 'rd' : 'th'}
				</span>
				<div
					class="mx-auto mt-2 flex size-[clamp(3.5rem,6vw,5.5rem)] items-center justify-center rounded-full bg-amber-500/10 p-[clamp(0.5rem,0.8vw,0.75rem)] text-amber-200 ring-2 ring-amber-400/50"
					role="img"
					aria-label="{h.house} crest"
				>
					<Crest />
				</div>
				<span class="sr-only">{h.house}</span>
				<p
					class="mt-2 text-[clamp(2.5rem,4.5vw,4.5rem)] leading-none font-black text-amber-200 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]"
				>
					{h.totalPoints}
				</p>
				<p class="mt-1 text-[clamp(0.75rem,1.1vw,1rem)] text-amber-200/60">points harvested</p>
				{#if h.pointsByCategory}
					<ul
						class="mt-3 space-y-1 text-left text-[clamp(0.65rem,0.95vw,0.85rem)]"
						aria-label="{h.house} points by category"
					>
						{#each Object.entries(h.pointsByCategory).slice(0, 5) as [cat, val] (cat)}
							<li>
								<div class="flex justify-between gap-2">
									<span class="truncate text-amber-200/70">{cat}</span><b>{val}</b>
								</div>
								<div class="h-1.5 overflow-hidden rounded-full bg-black/50">
									<div
										class="h-1.5 rounded-full bg-amber-400"
										style="width:{Math.round((val / maxCat) * 100)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
				<ul
					class="mt-3 border-t border-amber-200/15 pt-2 text-left text-[clamp(0.75rem,1.05vw,0.95rem)]"
				>
					<p
						class="mb-1 text-[clamp(0.65rem,0.9vw,0.8rem)] font-bold tracking-widest text-amber-300/70 uppercase"
					>
						Top carvers
					</p>
					{#each (h.topContributors ?? []).slice(0, 5) as c (c.studentId)}
						<li class="flex justify-between gap-2">
							<span class="truncate">{c.englishName}</span><b>+{c.totalPoints}</b>
						</li>
					{/each}
				</ul>
				{#if (h.growthOpportunities ?? []).length > 0}
					<ul class="mt-2 text-left text-[clamp(0.65rem,0.95vw,0.85rem)] text-red-300/80">
						{#each (h.growthOpportunities ?? []).slice(0, 2) as g (g.studentId)}
							<li class="flex justify-between gap-2">
								<span class="truncate">{g.englishName}</span><span>{g.pointsLost}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</article>
		{/each}
	</div>
</section>

<style>
	.font-cinzel {
		font-family: 'Cinzel', Georgia, serif;
	}
</style>
