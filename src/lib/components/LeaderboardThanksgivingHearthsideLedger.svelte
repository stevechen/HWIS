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

	let { houses = [] as HouseEntry[] }: { houses?: HouseEntry[] } = $props();

	const theme = $derived(resolveLeaderboardTheme('thanksgiving-2'));
	const sorted = $derived(
		[...houses].sort((a, b) => HOUSES.indexOf(a.house as House) - HOUSES.indexOf(b.house as House))
	);
	const max = $derived(Math.max(...sorted.map((h) => h.totalPoints), 1));
	const LEADER_BIRDS = 10;
	function turkeyFlock(points: number): number {
		if (points <= 0) return 0;
		return Math.max(1, Math.round((points / max) * LEADER_BIRDS));
	}
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<section
	class="parchment font-hand min-h-[calc(100vh_2rem)] px-[clamp(1rem,3vw,2.5rem)] py-[clamp(1rem,2.5vw,2rem)] {theme.font}"
>
	<svg style="position: absolute; width: 0; height: 0;" aria-hidden="true">
		<defs>
			<filter id="proto-scribble">
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="11"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="4"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
		</defs>
	</svg>

	<header class="mx-auto max-w-5xl text-center">
		<p class="text-[clamp(1.75rem,3vw,3rem)]" aria-hidden="true">🔥🦃🍂</p>
		<h1 class="mt-1 text-[clamp(2.5rem,5vw,4.5rem)] leading-none font-bold">Hearthside Ledger</h1>
		<p class="mt-1 text-[clamp(1.15rem,1.8vw,1.75rem)] italic opacity-80">
			read by the fire — the flock stretches toward the points
		</p>
	</header>

	<div class="mx-auto mt-6 max-w-5xl">
		<div class="scribble-line" aria-hidden="true"></div>
		{#each sorted as h (h.house)}
			{@const Crest = houseLogos[h.house as House]}
			{@const birds = turkeyFlock(h.totalPoints)}
			<div class="py-[clamp(0.75rem,1.5vw,1.25rem)]">
				<div class="flex items-center gap-[clamp(0.5rem,1.2vw,1.25rem)]">
					<div
						class="flex size-[clamp(4.7rem,7vw,7rem)] shrink-0 items-center justify-center p-2 text-[#4a2f1a]"
						role="img"
						aria-label="{h.house} crest"
					>
						<Crest />
					</div>
					<span class="sr-only">{h.house}</span>
					<span
						class="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#6b4a26] px-[clamp(0.5rem,0.8vw,0.75rem)] py-0.5 text-[clamp(1rem,1.4vw,1.4rem)] font-bold {h.rank ===
						1
							? 'bg-[#4a2f1a] text-[#f3e6c2]'
							: ''}"
					>
						{#if h.rank === 1}<span aria-hidden="true">🏆</span>{/if}
						{h.rank}{h.rank === 1 ? 'st' : h.rank === 2 ? 'nd' : h.rank === 3 ? 'rd' : 'th'}
					</span>
					<div class="flex min-w-0 items-center" style="flex-grow:{h.totalPoints}; flex-basis:0">
						<p
							class="flex w-full justify-start gap-[clamp(0.25rem,0.8vw,0.9rem)] text-[clamp(1.5rem,2.6vw,2.75rem)] leading-none"
							role="img"
							aria-label="{h.house}: {birds} turkeys"
						>
							{#each Array.from({ length: birds }, (_, i) => i) as bi (bi)}<span>🦃</span>{/each}
							{#if birds === 0}<span>🥚</span>{/if}
						</p>
					</div>
					<p class="shrink-0 text-[clamp(2rem,3.5vw,3.5rem)] leading-none font-bold">
						{h.totalPoints}
					</p>
				</div>
				<ul
					class="mt-2 flex flex-wrap gap-x-[clamp(0.75rem,1.5vw,1.25rem)] gap-y-1 pl-[clamp(4rem,6vw,6rem)] text-[clamp(1rem,1.5vw,1.4rem)]"
					aria-label="{h.house} top contributors"
				>
					{#each (h.topContributors ?? []).slice(0, 5) as c (c.studentId)}
						<li class="flex items-center gap-1.5">
							<span class="font-black text-gray-800">+{c.totalPoints}</span>
							<span class="truncate">{c.englishName}</span>
						</li>
					{/each}
				</ul>
			</div>
			<div class="scribble-line" aria-hidden="true"></div>
		{/each}
	</div>
</section>

<style>
	.font-hand {
		font-family: 'Caveat', 'Segoe Script', cursive;
	}
	.parchment {
		background-color: #e7d3a1;
		background-image:
			radial-gradient(ellipse at 20% 8%, rgba(120, 72, 20, 0.14), transparent 50%),
			radial-gradient(ellipse at 82% 92%, rgba(120, 72, 20, 0.16), transparent 55%),
			radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(101, 67, 33, 0.28) 100%),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.28 0 0 0 0 0.12 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
		box-shadow: inset 0 0 120px rgba(101, 67, 33, 0.45);
	}
	.scribble-line {
		height: 3px;
		background: #6b4a26;
		border-radius: 9999px;
		filter: url(#proto-scribble);
		opacity: 0.65;
	}
</style>
