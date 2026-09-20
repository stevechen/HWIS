<script lang="ts">
	// ⚠️ PROTOTYPE — throwaway, do not ship.
	// Question: what should dedicated Christmas & Chinese New Year leaderboard
	// pages look like? (Thanksgiving has two bespoke full-page designs;
	// `christmas` / `cny` only have registry color bundles today.)
	// Four variants switchable via ?v= + the floating bar. Mock data, no Convex.
	// Route lives under /display so the root layout hides its header chrome.

	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import { resolveLeaderboardTheme } from '$lib/leaderboard-themes';
	import { houseLogos } from '$lib/assets/house-logos';
	import type { House } from '$lib/constants/houses';

	type Contributor = { studentId: string; englishName: string; totalPoints: number };
	type HouseEntry = {
		house: string;
		rank: number;
		totalPoints: number;
		pointsByCategory?: Record<string, number>;
		topContributors?: Contributor[];
	};

	const CATEGORIES = ['Academics', 'Service', 'Athletics', 'Citizenship'];

	const MOCK_ROWS: Omit<HouseEntry, 'rank'>[] = [
		{
			house: 'Wukong',
			totalPoints: 2431,
			pointsByCategory: { Academics: 812, Service: 640, Athletics: 590, Citizenship: 389 },
			topContributors: [
				{ studentId: 'w1', englishName: 'Emily Chen', totalPoints: 214 },
				{ studentId: 'w2', englishName: 'Daniel Park', totalPoints: 186 },
				{ studentId: 'w3', englishName: 'Sofia Reyes', totalPoints: 171 },
				{ studentId: 'w4', englishName: 'Marcus Wu', totalPoints: 158 },
				{ studentId: 'w5', englishName: 'Aisha Khan', totalPoints: 142 }
			],
		},
		{
			house: 'Heracles',
			totalPoints: 2214,
			pointsByCategory: { Academics: 740, Service: 590, Athletics: 520, Citizenship: 364 },
			topContributors: [
				{ studentId: 'h1', englishName: 'Maya Thompson', totalPoints: 198 },
				{ studentId: 'h2', englishName: 'Leo Martins', totalPoints: 175 },
				{ studentId: 'h3', englishName: 'Grace Liu', totalPoints: 160 },
				{ studentId: 'h4', englishName: 'Omar Haddad', totalPoints: 149 },
				{ studentId: 'h5', englishName: 'Ivy Zhang', totalPoints: 133 }
			],
		},
		{
			house: 'Ixbalam',
			totalPoints: 1980,
			pointsByCategory: { Academics: 660, Service: 520, Athletics: 470, Citizenship: 330 },
			topContributors: [
				{ studentId: 'i1', englishName: 'Kai Nakamura', totalPoints: 205 },
				{ studentId: 'i2', englishName: 'Luna Vargas', totalPoints: 177 },
				{ studentId: 'i3', englishName: 'Tom Becker', totalPoints: 164 },
				{ studentId: 'i4', englishName: 'Mia Santos', totalPoints: 150 },
				{ studentId: 'i5', englishName: 'Raj Patel', totalPoints: 138 }
			],
		},
		{
			house: 'Setna',
			totalPoints: 1730,
			pointsByCategory: { Academics: 580, Service: 450, Athletics: 410, Citizenship: 290 },
			topContributors: [
				{ studentId: 's1', englishName: 'Zara Ali', totalPoints: 192 },
				{ studentId: 's2', englishName: 'Sam Rivera', totalPoints: 170 },
				{ studentId: 's3', englishName: 'Nina Kowalski', totalPoints: 155 },
				{ studentId: 's4', englishName: 'Ethan Brooks', totalPoints: 147 },
				{ studentId: 's5', englishName: 'Hana Sato', totalPoints: 131 }
			],
		}
	];

	const houses: HouseEntry[] = [...MOCK_ROWS]
		.sort((a, b) => b.totalPoints - a.totalPoints)
		.map((h, i) => ({ ...h, rank: i + 1 }));
	const maxPoints = Math.max(...houses.map((h) => h.totalPoints));

	const ACCENT: Record<House, { text: string; ring: string; bg: string; hex: string }> = {
		Heracles: {
			text: 'text-red-400',
			ring: 'ring-red-400/50',
			bg: 'bg-red-500/10',
			hex: '#f87171'
		},
		Wukong: {
			text: 'text-amber-400',
			ring: 'ring-amber-400/50',
			bg: 'bg-amber-500/10',
			hex: '#fbbf24'
		},
		Ixbalam: {
			text: 'text-emerald-400',
			ring: 'ring-emerald-400/50',
			bg: 'bg-emerald-500/10',
			hex: '#34d399'
		},
		Setna: {
			text: 'text-blue-400',
			ring: 'ring-blue-400/50',
			bg: 'bg-blue-500/10',
			hex: '#60a5fa'
		}
	};

	const VARIANTS = [
		{ id: 'xmas-tree', label: 'Ornaments on a Tree', emoji: '🎄', theme: 'christmas' },
		{ id: 'xmas-workshop', label: 'Workshop Ledger', emoji: '🛠️', theme: 'christmas' },
		{ id: 'cny-lanterns', label: 'Lantern Row', emoji: '🏮', theme: 'cny' },
		{ id: 'cny-scroll', label: 'Envelope Scroll', emoji: '🧧', theme: 'cny' }
	] as const;
	type VariantId = (typeof VARIANTS)[number]['id'];

	// V1: tree-topper spot + three hanging spots, keyed by rank order
	const ORNAMENT_SPOTS = [
		{ left: 50, top: 2 },
		{ left: 34, top: 40 },
		{ left: 66, top: 52 },
		{ left: 47, top: 68 }
	];

	const variant = $derived(
		VARIANTS.find((v) => v.id === page.url.searchParams.get('v')) ?? VARIANTS[0]
	);
	const variantId = $derived(variant.id);
	const theme = $derived(resolveLeaderboardTheme(variant.theme));

	// Ambient particles (snow / embers) — browser only, like the stars on /leaderboard/houses
	type Particle = { left: number; top: number; size: number; delay: number; dur: number };
	let particles = $state<Particle[]>([]);
	onMount(() => {
		particles = Array.from({ length: 70 }, () => ({
			left: Math.random() * 100,
			top: Math.random() * 100,
			size: 2 + Math.random() * 4,
			delay: Math.random() * 6,
			dur: 4 + Math.random() * 6
		}));
	});

	function switchVariant(id: VariantId) {
		replaceState(`?v=${id}`, {});
	}
</script>

<svelte:head>
	<title>PROTOTYPE — Seasonal Leaderboard Themes</title>
</svelte:head>

<section class="relative min-h-screen overflow-hidden">
	{#if variantId === 'xmas-tree'}
		<div
			class="relative flex min-h-screen flex-col items-center overflow-hidden {theme.section} pt-8 pb-32"
		>
			{#each particles as p, i (i)}
				<span
					class="particle"
					style="left:{p.left}%; --size:{p.size}px; --delay:{p.delay}s; --dur:{p.dur}s"
					aria-hidden="true"
				></span>
			{/each}
			<header class="z-10 text-center">
				<p class="text-[clamp(1.5rem,2.5vw,2.5rem)]" aria-hidden="true">🎄✨</p>
				<h1
					class="font-cinzel mt-1 text-[clamp(2rem,3.5vw,3.5rem)] leading-none font-black tracking-wide"
				>
					The House Tree
				</h1>
				<p class="mt-1 text-[clamp(1rem,1.4vw,1.3rem)] text-emerald-200/70 italic">
					the leading house crowns the star — every ornament glows brighter with points
				</p>
			</header>

			<div class="relative z-10 mt-4 flex w-[min(90vw,720px)] flex-1 items-start justify-center">
				<svg viewBox="0 0 400 460" class="h-full max-h-[64vh]" aria-hidden="true">
					<polygon points="200,30 330,210 70,210" fill="#062b1b" />
					<polygon points="200,140 345,320 55,320" fill="#073020" />
					<polygon points="200,250 358,415 42,415" fill="#083824" />
					<rect x="180" y="415" width="40" height="45" fill="#241309" />
				</svg>
				{#each houses as h, i (h.house)}
					{@const Crest = houseLogos[h.house as House]}
					{@const spot = ORNAMENT_SPOTS[i] ?? { left: 50, top: 80 }}
					{@const a = ACCENT[h.house as House]}
					<div
						class="absolute flex w-[clamp(7rem,14vw,10rem)] -translate-x-1/2 flex-col items-center"
						style="left:{spot.left}%; top:{spot.top}%"
					>
						<div
							class="h-[clamp(1.25rem,2.5vw,2.5rem)] w-px bg-yellow-200/40"
							aria-hidden="true"
						></div>
						<div class="h-2 w-4 rounded-sm bg-yellow-500/80" aria-hidden="true"></div>
						{#if i === 0}
							<span
								class="mt-0.5 text-[clamp(1.5rem,2.8vw,2.4rem)] drop-shadow-[0_0_18px_rgba(253,224,71,0.9)]"
								aria-hidden="true"
							>
								⭐
							</span>
						{/if}
						<div
							class="mt-1 flex aspect-square items-center justify-center rounded-full p-[14%] ring-2 {a.ring}"
							style="background: radial-gradient(circle at 32% 28%, rgba(255,255,255,0.3), transparent 55%), {a.hex}33; box-shadow: 0 0 45px -6px rgba(255,255,255,0.5);"
							role="img"
							aria-label="{h.house}: {h.totalPoints} points, rank {h.rank}"
						>
							<div class="size-full rounded-full bg-black/30 p-[18%]"><Crest /></div>
						</div>
						<span
							class="font-cinzel mt-2 text-[clamp(1.6rem,2.8vw,2.6rem)] leading-none font-black text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.35)]"
						>
							{h.totalPoints}
						</span>
						<span class="text-[clamp(0.7rem,1vw,0.9rem)] text-emerald-100/80">{h.house}</span>
						<span
							class="mt-0.5 rounded-full border border-white/20 px-2 py-0.5 text-[0.7rem] font-bold {i ===
							0
								? 'border-yellow-300 bg-yellow-300/15 text-yellow-200'
								: 'text-white/60'}"
						>
							{h.rank}{h.rank === 1 ? 'st' : h.rank === 2 ? 'nd' : h.rank === 3 ? 'rd' : 'th'}
						</span>
					</div>
				{/each}
			</div>

			<div class="z-10 mt-2 w-[min(92vw,880px)] space-y-2">
				<h2
					class="text-center text-[0.8rem] font-bold tracking-[0.2em] text-emerald-200/60 uppercase"
				>
					Garland race — points by house
				</h2>
				{#each houses as h (h.house)}
					{@const pct = Math.round((h.totalPoints / maxPoints) * 100)}
					{@const a = ACCENT[h.house as House]}
					<div class="flex items-center gap-3">
						<span class="w-24 shrink-0 text-right text-sm text-emerald-100/80">{h.house}</span>
						<div class="h-3.5 flex-1 overflow-hidden rounded-full bg-white/10">
							<div
								class="h-full rounded-full"
								style="width:{pct}%; background: repeating-linear-gradient(135deg, {a.hex} 0 10px, rgba(255,255,255,0.85) 10px 20px);"
							></div>
						</div>
						<b class="w-16 text-right text-emerald-50">{h.totalPoints}</b>
					</div>
				{/each}
			</div>
		</div>
	{:else if variantId === 'xmas-workshop'}
		<div
			class="relative flex min-h-screen flex-col overflow-hidden {theme.section} px-[clamp(1rem,2vw,2rem)] pt-8 pb-32"
		>
			{#each particles as p, i (i)}
				<span
					class="particle"
					style="left:{p.left}%; --size:{p.size}px; --delay:{p.delay}s; --dur:{p.dur}s"
					aria-hidden="true"
				></span>
			{/each}
			<header class="z-10 text-center">
				<p class="text-[clamp(1.5rem,2.5vw,2.5rem)]" aria-hidden="true">🛠️🦌🎁</p>
				<h1
					class="font-cinzel mt-1 text-[clamp(2rem,3.5vw,3.5rem)] leading-none font-black tracking-wide"
				>
					Santa's Workshop Ledger
				</h1>
				<p class="mt-1 text-[clamp(1rem,1.4vw,1.3rem)] text-red-100/70 italic">
					every kind act is an order fulfilled — the elves tally nightly
				</p>
				<div class="candy mx-auto mt-3 h-1.5 w-2/3 rounded-full" aria-hidden="true"></div>
			</header>
			<div
				class="z-10 mx-auto mt-6 grid w-full max-w-[96rem] flex-1 grid-cols-1 content-start gap-[clamp(1rem,2vw,1.75rem)] sm:grid-cols-2 xl:grid-cols-4"
			>
				{#each houses as h (h.house)}
					{@const Crest = houseLogos[h.house as House]}
					{@const a = ACCENT[h.house as House]}
					<article
						class="overflow-hidden rounded-2xl border border-red-200/25 bg-white/6 shadow-[0_20px_60px_-20px_rgba(248,113,113,0.4)] {h.rank ===
						1
							? 'ring-2 ring-yellow-300/60'
							: ''}"
					>
						<div class="candy h-2 w-full" aria-hidden="true"></div>
						<div class="border-b border-red-200/15 p-[clamp(1rem,1.6vw,1.5rem)] text-center">
							<div class="flex items-start justify-between">
								<span
									class="rounded-full border px-2.5 py-0.5 text-xs font-black {h.rank === 1
										? 'border-yellow-300 bg-yellow-300 text-red-950'
										: 'border-red-200/30 text-red-100/70'}"
								>
									{h.rank}{h.rank === 1 ? 'st' : h.rank === 2 ? 'nd' : h.rank === 3 ? 'rd' : 'th'}
									{h.rank === 1 ? '🏆' : ''}
								</span>
								<span class="text-xs text-red-100/50">order #{String(h.rank).padStart(2, '0')}</span
								>
							</div>
							<div
								class="mx-auto mt-2 flex size-[clamp(4.5rem,6.5vw,6rem)] items-center justify-center rounded-full p-3 {a.bg} ring-4 ring-emerald-500/35"
								role="img"
								aria-label="{h.house} crest"
							>
								<Crest />
							</div>
							<p
								class="mt-2 text-[clamp(2.75rem,4.5vw,4.25rem)] leading-none font-black {theme.pointsGlow}"
							>
								{h.totalPoints}
							</p>
							<p class="mt-1 text-xs tracking-widest text-red-100/60 uppercase">points wrapped</p>
							<p class="sr-only">{h.house}</p>
						</div>
						<ul
							class="space-y-1.5 p-[clamp(1rem,1.6vw,1.5rem)] text-left text-xs"
							aria-label="{h.house} points by category"
						>
							{#each CATEGORIES as cat (cat)}
								{@const val = h.pointsByCategory?.[cat] ?? 0}
								{@const pct = Math.round(
									(val / Math.max(...houses.map((x) => x.pointsByCategory?.[cat] ?? 0), 1)) * 100
								)}
								<li>
									<div class="flex justify-between">
										<span class="truncate text-red-100/70">{cat}</span>
										<b class="text-red-50">{val}</b>
									</div>
									<div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/50">
										<div class="h-full rounded-full bg-red-400/90" style="width:{pct}%"></div>
									</div>
								</li>
							{/each}
						</ul>
						<div
							class="border-t border-red-200/15 p-[clamp(1rem,1.6vw,1.5rem)] pt-2 text-left text-xs"
						>
							<p class="mb-1 font-bold tracking-widest text-yellow-200/80 uppercase">
								⭐ Nice list
							</p>
							{#each (h.topContributors ?? []).slice(0, 5) as c (c.studentId)}
								<div class="flex justify-between gap-2">
									<span class="truncate text-red-50/85">{c.englishName}</span>
									<b class="text-yellow-200">+{c.totalPoints}</b>
								</div>
							{/each}
							<p class="mt-2 mb-1 font-bold tracking-widest text-red-300/70 uppercase">
							</p>
						</div>
					</article>
				{/each}
			</div>
		</div>
	{:else if variantId === 'cny-lanterns'}
		<div class="relative flex min-h-screen flex-col overflow-hidden {theme.section} pt-6 pb-32">
			{#each particles as p, i (i)}
				<span
					class="particle gold"
					style="left:{p.left}%; --size:{p.size}px; --delay:{p.delay}s; --dur:{p.dur}s"
					aria-hidden="true"
				></span>
			{/each}
			<header class="z-10 text-center">
				<p class="text-[clamp(1.5rem,2.5vw,2.5rem)]" aria-hidden="true">🏮🧨🎆</p>
				<h1
					class="font-cny mt-1 text-[clamp(2.25rem,4vw,4rem)] leading-none font-bold tracking-wide text-yellow-100"
				>
					Lantern Row
				</h1>
				<p class="mt-1 text-[clamp(1rem,1.4vw,1.3rem)] text-red-100/70 italic">
					the higher the glow, the brighter the year
				</p>
			</header>
			<div class="relative z-10 mx-auto mt-2 w-[min(94vw,1100px)] flex-1">
				<div
					class="absolute top-0 right-0 left-0 h-1 rounded-full bg-yellow-500/50"
					aria-hidden="true"
				></div>
				<div
					class="relative flex h-full items-start justify-center gap-[clamp(1rem,4vw,4rem)] pt-6"
				>
					{#each houses as h, i (h.house)}
						{@const Crest = houseLogos[h.house as House]}
						{@const glow = 0.35 + 0.65 * (h.totalPoints / maxPoints)}
						<div
							class="flex w-[clamp(8rem,18vw,12rem)] flex-col items-center"
							style="padding-top:{i * 3.5}rem"
						>
							<div class="h-6 w-px bg-yellow-500/50" aria-hidden="true"></div>
							<div class="h-3 w-6 rounded-t-sm bg-yellow-600/80" aria-hidden="true"></div>
							<div
								class="relative flex aspect-4/3 w-full flex-col items-center justify-center rounded-4xl border-2 border-yellow-400/60"
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
									class="flex size-[clamp(3rem,5vw,4.25rem)] items-center justify-center rounded-full bg-black/25 p-2 ring-2 ring-yellow-300/70"
									role="img"
									aria-label="{h.house} crest"
								>
									<Crest />
								</div>
								<p
									class="relative mt-1 text-[clamp(1.75rem,3vw,2.75rem)] leading-none font-black text-yellow-100 drop-shadow-[0_0_18px_rgba(253,224,71,0.9)]"
								>
									{h.totalPoints}
								</p>
								<p class="relative text-[0.7rem] tracking-[0.25em] text-yellow-200/80 uppercase">
									points
								</p>
							</div>
							<div class="h-3 w-6 rounded-b-sm bg-yellow-600/80" aria-hidden="true"></div>
							<div class="h-5 w-0.5 bg-red-400/80" aria-hidden="true"></div>
							<div
								class="size-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
								aria-hidden="true"
							></div>
							<span class="font-cinzel mt-2 text-sm font-bold text-yellow-100">{h.house}</span>
							<span
								class="rounded-full border px-2 py-0.5 text-[0.7rem] font-bold {i === 0
									? 'border-yellow-300 bg-yellow-400 text-red-950'
									: 'border-yellow-500/40 text-yellow-200/80'}"
							>
								{i === 0 ? '🏆 ' : ''}{h.rank}{h.rank === 1
									? 'st'
									: h.rank === 2
										? 'nd'
										: h.rank === 3
											? 'rd'
											: 'th'}
							</span>
							<p class="mt-1 text-center text-[0.68rem] text-red-100/60">
								{(h.topContributors ?? [])
									.slice(0, 3)
									.map((c) => c.englishName.split(' ')[0])
									.join(' · ')}
							</p>
						</div>
					{/each}
				</div>
				<p
					class="font-cny absolute top-[18%] left-2 hidden text-[clamp(1.4rem,2.2vw,2rem)] text-yellow-300/80 [writing-mode:vertical-rl] lg:block"
					aria-hidden="true"
				>
					福 · 祿 · 壽
				</p>
				<p
					class="font-cny absolute top-[18%] right-2 hidden text-[clamp(1.4rem,2.2vw,2rem)] text-yellow-300/80 [writing-mode:vertical-rl] lg:block"
					aria-hidden="true"
				>
					fortune · luck · prosperity
				</p>
			</div>
			<p
				class="font-cny absolute right-6 bottom-6 z-10 rotate-180 text-[clamp(2rem,3vw,3rem)] text-yellow-300/70"
				aria-hidden="true"
			>
				福
			</p>
		</div>
	{:else if variantId === 'cny-scroll'}
		<div
			class="relative flex min-h-screen flex-col items-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_0%,#a52a1f,#6b1010_70%)] px-4 pt-8 pb-32"
		>
			<header class="z-10 text-center text-yellow-50">
				<p class="text-[clamp(1.5rem,2.5vw,2.5rem)]" aria-hidden="true">🧧✨</p>
				<h1
					class="font-cny mt-1 text-[clamp(2.25rem,4vw,4rem)] leading-none font-bold tracking-wide"
				>
					New Year Scroll
				</h1>
				<p class="mt-1 text-[clamp(1rem,1.4vw,1.3rem)] text-red-100/80 italic">
					a fresh scroll for a fresh year — every house writes its line
				</p>
			</header>
			<div class="relative z-10 mt-4 w-[min(92vw,760px)]">
				<div
					class="h-4 rounded-full bg-[#3b1d0e] shadow-[0_6px_20px_rgba(0,0,0,0.45)] ring-2 ring-yellow-500/40"
					aria-hidden="true"
				></div>
				<div
					class="border-x-4 border-[#3b1d0e] bg-[#fdf3d7] px-[clamp(1rem,3vw,2.5rem)] py-6 shadow-[inset_0_0_60px_rgba(120,53,15,0.25)]"
				>
					<div class="flex items-center justify-center gap-3">
						<span
							class="font-cny text-[clamp(1.5rem,2.5vw,2rem)] text-[#7f1d1d]"
							aria-hidden="true"
						>
							歲
						</span>
						<h2
							class="font-cny text-[clamp(1.75rem,3vw,2.75rem)] leading-none font-bold text-[#7f1d1d]"
						>
							House rankings
						</h2>
						<span
							class="font-cny text-[clamp(1.5rem,2.5vw,2rem)] text-[#7f1d1d]"
							aria-hidden="true"
						>
							首
						</span>
					</div>
					<div
						class="mt-2 h-0.5 bg-linear-to-r from-transparent via-[#7f1d1d]/60 to-transparent"
						aria-hidden="true"
					></div>
					{#each houses as h, i (h.house)}
						{@const Crest = houseLogos[h.house as House]}
						{@const a = ACCENT[h.house as House]}
						{@const seal = ['一', '二', '三', '四'][i] ?? '?'}
						<div
							class="flex items-center gap-[clamp(0.75rem,2vw,1.5rem)] border-b border-[#7f1d1d]/15 py-[clamp(0.75rem,1.5vw,1.25rem)] last:border-b-0"
						>
							<span
								class="font-cny flex size-[clamp(2.5rem,4vw,3.5rem)] shrink-0 items-center justify-center rounded-md text-[clamp(1.5rem,2.5vw,2.25rem)] text-[#fdf3d7] shadow-inner"
								style="background: {i === 0
									? 'linear-gradient(160deg,#b91c1c,#7f1d1d)'
									: 'linear-gradient(160deg,#9a3412,#7c2d12)'}"
								role="img"
								aria-label="rank {h.rank} seal"
							>
								{seal}
							</span>
							<div
								class="flex size-[clamp(3rem,5vw,4.25rem)] shrink-0 items-center justify-center p-2 {a.text}"
								role="img"
								aria-label="{h.house} crest"
							>
								<Crest />
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[clamp(1.1rem,1.8vw,1.6rem)] font-bold text-[#4a2f1a]">
									{h.house}
									<span class="text-[0.8em] font-semibold text-[#7f1d1d]/60">
										· {h.rank}{h.rank === 1
											? 'st'
											: h.rank === 2
												? 'nd'
												: h.rank === 3
													? 'rd'
													: 'th'}
										{i === 0 ? '🏆' : ''}
									</span>
								</p>
								<p class="truncate text-[clamp(0.8rem,1.2vw,1rem)] text-[#7f1d1d]/70">
									{(h.topContributors ?? [])
										.slice(0, 4)
										.map((c) => `${c.englishName} +${c.totalPoints}`)
										.join(' · ')}
								</p>
							</div>
							<p
								class="shrink-0 text-[clamp(2rem,3.5vw,3.25rem)] leading-none font-black text-[#7f1d1d]"
							>
								{h.totalPoints}
							</p>
						</div>
					{/each}
				</div>
				<div
					class="h-4 rounded-full bg-[#3b1d0e] ring-2 ring-yellow-500/40"
					aria-hidden="true"
				></div>
			</div>
			<p
				class="font-cny absolute top-24 left-3 hidden text-[clamp(1.5rem,2.4vw,2.2rem)] leading-tight text-yellow-200/90 [writing-mode:vertical-rl] lg:block"
				aria-hidden="true"
			>
				歲歲平安
			</p>
			<p
				class="font-cny absolute top-24 right-3 hidden text-[clamp(1.5rem,2.4vw,2.2rem)] leading-tight text-yellow-200/90 [writing-mode:vertical-rl] lg:block"
				aria-hidden="true"
			>
				年年有餘
			</p>
		</div>
	{/if}
</section>

<nav
	class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-black/80 p-2 pl-4 backdrop-blur-xl"
	aria-label="Prototype variant switcher"
>
	<span class="mr-2 hidden text-xs text-white/50 sm:inline" data-testid="proto-state">
		PROTOTYPE · {variantId} · theme: {variant.theme} · {houses.length} houses (mock)
	</span>
	{#each VARIANTS as v (v.id)}
		<button
			type="button"
			onclick={() => switchVariant(v.id)}
			aria-pressed={variantId === v.id}
			class="rounded-full px-3 py-1.5 text-xs font-semibold transition {variantId === v.id
				? 'bg-white text-black'
				: 'text-white/70 hover:text-white'}"
		>
			<span aria-hidden="true">{v.emoji}</span>
			{v.label}
		</button>
	{/each}
</nav>

<style>
	.font-cinzel {
		font-family: 'Cinzel', Georgia, serif;
	}
	.font-cny {
		font-family: 'Ma Shan Zheng', 'Cinzel', serif;
	}
	.particle {
		position: absolute;
		width: var(--size, 3px);
		height: var(--size, 3px);
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.9);
		pointer-events: none;
		animation: protoFall var(--dur, 6s) linear var(--delay, 0s) infinite;
	}
	.particle.gold {
		background: #fcd34d;
		box-shadow: 0 0 8px #f59e0b;
	}
	@keyframes protoFall {
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
