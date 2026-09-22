<script lang="ts">
	// ⚠️ PROTOTYPE — throwaway, do not ship.
	// Question: what should dedicated Christmas & Chinese New Year leaderboard
	// pages look like? (Thanksgiving has two bespoke full-page designs;
	// `christmas` / `cny` only have registry color bundles today.)
	// Four variants switchable via ?v= + the floating bar. Mock data, no Convex.
	// HALLOWEEN ROUND: spider-web (hal-web) + hand-drawn graveyard (hal-graveyard).
	// Route lives under /display so the root layout hides its header chrome.

	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import { resolveLeaderboardTheme } from '$lib/leaderboard-themes';
	import { SPIDER_WEB_PATH, SPIDER_WEB_VIEWBOX } from '$lib/components/spider-web-art';
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

	const CATEGORIES = [
		'Responsibility',
		'Excellence',
		'Service',
		'Persistence',
		'Enthusiasm',
		'Collaboration',
		'Trustworthiness'
	];

	const MOCK_ROWS: Omit<HouseEntry, 'rank'>[] = [
		{
			house: 'Wukong',
			totalPoints: 2431,
			pointsByCategory: {
				Responsibility: 382,
				Excellence: 415,
				Service: 330,
				Persistence: 355,
				Enthusiasm: 340,
				Collaboration: 322,
				Trustworthiness: 287
			},
			topContributors: [
				{ studentId: 'w1', englishName: 'Emily Chen', totalPoints: 214 },
				{ studentId: 'w2', englishName: 'Daniel Park', totalPoints: 186 },
				{ studentId: 'w3', englishName: 'Sofia Reyes', totalPoints: 171 },
				{ studentId: 'w4', englishName: 'Marcus Wu', totalPoints: 158 },
				{ studentId: 'w5', englishName: 'Aisha Khan', totalPoints: 142 }
			]
		},
		{
			house: 'Heracles',
			totalPoints: 2214,
			pointsByCategory: {
				Responsibility: 348,
				Excellence: 378,
				Service: 302,
				Persistence: 320,
				Enthusiasm: 312,
				Collaboration: 296,
				Trustworthiness: 258
			},
			topContributors: [
				{ studentId: 'h1', englishName: 'Maya Thompson', totalPoints: 198 },
				{ studentId: 'h2', englishName: 'Leo Martins', totalPoints: 175 },
				{ studentId: 'h3', englishName: 'Grace Liu', totalPoints: 160 },
				{ studentId: 'h4', englishName: 'Omar Haddad', totalPoints: 149 },
				{ studentId: 'h5', englishName: 'Ivy Zhang', totalPoints: 133 }
			]
		},
		{
			house: 'Ixbalam',
			totalPoints: 1980,
			pointsByCategory: {
				Responsibility: 310,
				Excellence: 335,
				Service: 270,
				Persistence: 288,
				Enthusiasm: 278,
				Collaboration: 262,
				Trustworthiness: 237
			},
			topContributors: [
				{ studentId: 'i1', englishName: 'Kai Nakamura', totalPoints: 205 },
				{ studentId: 'i2', englishName: 'Luna Vargas', totalPoints: 177 },
				{ studentId: 'i3', englishName: 'Tom Becker', totalPoints: 164 },
				{ studentId: 'i4', englishName: 'Mia Santos', totalPoints: 150 },
				{ studentId: 'i5', englishName: 'Raj Patel', totalPoints: 138 }
			]
		},
		{
			house: 'Setna',
			totalPoints: 1730,
			pointsByCategory: {
				Responsibility: 268,
				Excellence: 292,
				Service: 236,
				Persistence: 250,
				Enthusiasm: 244,
				Collaboration: 228,
				Trustworthiness: 212
			},
			topContributors: [
				{ studentId: 's1', englishName: 'Zara Ali', totalPoints: 192 },
				{ studentId: 's2', englishName: 'Sam Rivera', totalPoints: 170 },
				{ studentId: 's3', englishName: 'Nina Kowalski', totalPoints: 155 },
				{ studentId: 's4', englishName: 'Ethan Brooks', totalPoints: 147 },
				{ studentId: 's5', englishName: 'Hana Sato', totalPoints: 131 }
			]
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
		{ id: 'hal-web', label: 'Spider Web', emoji: '🕸️', theme: 'default' },
		{ id: 'hal-graveyard', label: 'Graveyard Row', emoji: '🪦', theme: 'default' },
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
	// Spider-web radar: R·E·S·P·E·C·T axes (Responsibility, Excellence,
	// Service, Persistence, Enthusiasm, Collaboration, Trustworthiness).
	// Rings cave inward between spokes like real silk; every strand gets its
	// own curvature + width so no two segments look stamped out.
	const WEB_RINGS = [0.3, 0.55, 0.8, 1];
	const webMax = Math.max(
		...houses.flatMap((h) => CATEGORIES.map((c) => h.pointsByCategory?.[c] ?? 0)),
		1
	);

	function webAngle(i: number, n: number): number {
		return Math.PI / 2 - (2 * Math.PI * i) / n;
	}

	function webPoint(cx: number, cy: number, angle: number, r: number) {
		return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
	}

	function webRingSegment(
		cx: number,
		cy: number,
		R: number,
		t: number,
		i: number,
		seed: number
	): { d: string; w: number; o: number } {
		const n = CATEGORIES.length;
		const jitter = (idx: number) => R * t * (1 + 0.018 * Math.sin(seed * 2.4 + idx * 2.1));
		const a = webPoint(cx, cy, webAngle(i % n, n), jitter(i % n));
		const b = webPoint(cx, cy, webAngle((i + 1) % n, n), jitter((i + 1) % n));
		// Cave inward: control radius dips toward the hub, uniquely per strand.
		const sag = 0.74 + 0.1 * Math.abs(Math.sin(seed * 1.7 + i * 3.3));
		const c = webPoint(cx, cy, webAngle(i + 0.5, n), R * t * sag);
		return {
			d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
			w: 0.5 + 0.8 * Math.abs(Math.sin(seed * 0.9 + i * 2.4 + t * 5)),
			o: 0.22 + 0.18 * Math.abs(Math.sin(seed * 1.3 + i * 1.1 + t * 7))
		};
	}

	/** A single spoke: bowed with its own curvature + width, never a ruler line.
	 * Spokes extend past the outer ring (overshoot) so anchor threads stick
	 * out like a real web instead of stopping dead at the rim. */
	function webSpokePath(
		cx: number,
		cy: number,
		R: number,
		i: number,
		seed: number,
		overshoot = 14
	): string {
		const n = CATEGORIES.length;
		const angle = webAngle(i, n);
		const end = webPoint(cx, cy, angle, R + overshoot);
		// Control point at mid-radius, nudged perpendicular — visible organic bend.
		const mid = webPoint(cx, cy, angle, R * 0.52);
		const perp = angle + Math.PI / 2;
		const bow = 5 * Math.sin(seed * 3.1 + i * 1.9);
		const c = { x: mid.x + bow * Math.cos(perp), y: mid.y - bow * Math.sin(perp) };
		return `M ${cx} ${cy} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
	}

	/** Organic stroke width for a strand: varies with the strand and the house. */
	function webStrandWidth(i: number, seed: number): number {
		return 0.5 + 0.8 * Math.abs(Math.sin(i * 2.7 + seed * 1.3));
	}

	function webDataPath(cx: number, cy: number, R: number, h: HouseEntry, cats: string[]): string {
		const n = cats.length;
		let d = '';
		for (let i = 0; i <= n; i++) {
			const idx = i % n;
			const r = R * ((h.pointsByCategory?.[cats[idx]] ?? 0) / webMax);
			const p = webPoint(cx, cy, webAngle(idx, n), r);
			if (i === 0) {
				d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
			} else {
				const rPrev = R * ((h.pointsByCategory?.[cats[i - 1]] ?? 0) / webMax);
				const c = webPoint(cx, cy, webAngle(i - 0.5, n), ((r + rPrev) / 2) * 0.94);
				d += ` Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
			}
		}
		return `${d} Z`;
	}

	// Hand-drawn graveyard: every stone tilts and is shaped a little differently
	const TOMB_RADII = [
		'50% 50% 7px 7px / 62% 58% 7px 7px',
		'54% 46% 5px 5px / 66% 60% 5px 5px',
		'47% 53% 8px 8px / 60% 64% 8px 8px',
		'52% 48% 6px 6px / 64% 62% 6px 6px'
	];
	const TOMB_TILT = [-1.4, 1.1, -0.7, 1.6];

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
				class="z-10 mx-auto mt-6 grid w-full max-w-384 flex-1 grid-cols-1 content-start gap-[clamp(1rem,2vw,1.75rem)] sm:grid-cols-2 xl:grid-cols-4"
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
							<p class="mt-2 mb-1 font-bold tracking-widest text-red-300/70 uppercase"></p>
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
	{:else if variantId === 'hal-web'}
		<div
			class="relative flex min-h-screen flex-col items-center overflow-hidden {theme.section} px-[3vw] pt-8 pb-32"
		>
			{#snippet cornerWeb(cls: string, flip: string)}
				<svg class={flip ? `${cls} ${flip}` : cls} viewBox={SPIDER_WEB_VIEWBOX} aria-hidden="true">
					<path d={SPIDER_WEB_PATH} fill="#c7d2fe" fill-opacity="0.32" />
				</svg>
			{/snippet}
			<!-- The svgrepo icon is drawn for the TOP-RIGHT corner: its hub sits on
				the right edge (~x=272) with anchors running to the top/bottom/left.
				So: top-right renders as-is; the other corners mirror it. Sizes,
				offsets and rotations deliberately vary (some bleed off-screen)
				so the four corners don't read as a stamped pattern. -->
			{@render cornerWeb(
				'pointer-events-none absolute -top-8 right-0 w-[20vw] max-w-72 opacity-90',
				''
			)}
			{@render cornerWeb(
				'pointer-events-none absolute -top-10 left-0 -ml-6 w-[13vw] max-w-44 rotate-6 opacity-70',
				'-scale-x-100'
			)}
			{@render cornerWeb(
				'pointer-events-none absolute -right-3 -bottom-8 w-[16vw] max-w-56 -rotate-3 opacity-80',
				'-scale-y-100'
			)}
			{@render cornerWeb(
				'pointer-events-none absolute -mb-12 -ml-12 bottom-0 left-0 w-[23vw] max-w-80 rotate-3 opacity-75',
				'-scale-100'
			)}
			<!-- Faint oversized web behind each house card (watermark, same icon).
				Position/size vary per card so the four don't mirror each other. -->
			{#snippet cardWeb(cls: string)}
				<svg
					class="pointer-events-none absolute opacity-[0.13] {cls}"
					viewBox={SPIDER_WEB_VIEWBOX}
					aria-hidden="true"
				>
					<path d={SPIDER_WEB_PATH} fill="#c7d2fe" />
				</svg>
			{/snippet}
			<!-- Extra hanging spiders: left-of-center small, right-of-center tiny.
				Anatomy (same as the hunter): thread pays out of the spinnerets at
				the rear of the abdomen, so abdomen sits on top, head points down.
				8 jointed legs (4 pairs): rear pair sweeps UP toward the thread,
				middle pairs reach sideways, front pair reaches DOWN. -->
			{#snippet hangingSpider(cls: string, threadLen: number, flip: boolean)}
				<svg
					class={cls}
					viewBox="0 0 32 180"
					aria-hidden="true"
					style={flip ? 'transform: translateX(-50%) scaleX(-1)' : ''}
				>
					<line
						x1="16"
						y1="0"
						x2="16"
						y2={threadLen}
						stroke="#a5b4fc"
						stroke-width="1.5"
						stroke-opacity="0.7"
					/>
					<ellipse cx="16" cy={threadLen + 10} rx="6.5" ry="9" fill="#818cf8" />
					<circle cx="16" cy={threadLen + 24} r="4" fill="#818cf8" />
					<g
						stroke="#a5b4fc"
						stroke-width="1.6"
						stroke-opacity="0.9"
						fill="none"
						stroke-linecap="round"
						transform={`translate(0 ${threadLen})`}
					>
						<path d="M12 8 L7 2 Q4 -1 2 -4" />
						<path d="M20 8 L25 2 Q28 -1 30 -4" />
						<path d="M10 14 L3 12 Q0 12 -2 16" />
						<path d="M22 14 L29 12 Q32 12 34 16" />
						<path d="M10 20 L3 24 Q1 26 2 30" />
						<path d="M22 20 L29 24 Q31 26 30 30" />
						<path d="M12 25 L7 33 Q5 36 6 40" />
						<path d="M20 25 L25 33 Q27 36 26 40" />
					</g>
				</svg>
			{/snippet}
			{@render hangingSpider(
				'pointer-events-none absolute top-0 left-[22%] hidden w-6 opacity-80 lg:block',
				120,
				false
			)}
			{@render hangingSpider(
				'pointer-events-none absolute top-0 right-[20%] hidden w-5 opacity-70 lg:block',
				80,
				true
			)}
			<!-- Center spider: same abdomen-up, head-down anatomy, 8 jointed legs. -->
			<svg
				class="pointer-events-none absolute top-0 left-1/2 h-[18vh] w-8 -translate-x-1/2"
				viewBox="0 0 32 180"
				aria-hidden="true"
			>
				<line x1="16" y1="0" x2="16" y2="102" stroke="#a5b4fc" stroke-width="1.5" />
				<ellipse cx="16" cy="112" rx="6.5" ry="9" fill="#818cf8" />
				<circle cx="16" cy="126" r="4" fill="#818cf8" />
				<g stroke="#a5b4fc" stroke-width="1.6" fill="none" stroke-linecap="round">
					<path d="M12 110 L7 104 Q4 101 2 98" />
					<path d="M20 110 L25 104 Q28 101 30 98" />
					<path d="M10 116 L3 114 Q0 114 -2 118" />
					<path d="M22 116 L29 114 Q32 114 34 118" />
					<path d="M10 122 L3 126 Q1 128 2 132" />
					<path d="M22 122 L29 126 Q31 128 30 132" />
					<path d="M12 127 L7 135 Q5 138 6 142" />
					<path d="M20 127 L25 135 Q27 138 26 142" />
				</g>
			</svg>
			{#each particles as p, i (i)}
				<span
					class="particle"
					style="left:{p.left}%; --size:{p.size}px; --delay:{p.delay}s; --dur:{p.dur}s"
					aria-hidden="true"
				></span>
			{/each}
			<header class="z-10 text-center">
				<p class="text-[clamp(1.5rem,2.5vw,2.5rem)]" aria-hidden="true">🕸️🕷️</p>
				<h1
					class="font-cinzel mt-1 text-[clamp(2rem,3.5vw,3.5rem)] leading-none font-black tracking-wide"
				>
					The House Web
				</h1>
				<p class="mt-1 text-[clamp(1rem,1.4vw,1.3rem)] text-indigo-200/70 italic">
					every house spins its own web — the strongest silk holds the crown
				</p>
			</header>
			<div
				class="relative z-10 mt-4 grid w-full flex-1 grid-cols-1 items-stretch gap-[clamp(1rem,2.5vw,2.5rem)] sm:grid-cols-2 xl:grid-cols-4"
			>
				{#each houses as h (h.house)}
					{@const Crest = houseLogos[h.house as House]}
					{@const a = ACCENT[h.house as House]}
					<article
						class="relative flex flex-1 flex-col overflow-hidden rounded-2xl {theme.card} {h.rank ===
						1
							? 'ring-2 ring-orange-300/60'
							: ''}"
					>
						{@render cardWeb(
							h.rank === 1
								? '-top-12 -right-12 w-52 -scale-x-100'
								: h.rank === 2
									? '-bottom-8 -left-8 w-36 -scale-100 opacity-[0.1]'
									: h.rank === 3
										? '-top-6 -left-10 w-44 rotate-6'
										: '-right-8 -bottom-10 w-40 -scale-y-100'
						)}
						{#if h.rank === 1}
							<!-- The hunter: drops onto the leader's card on a thread,
								legs paddling, then retracts back into the ceiling. Loops.
								Anatomy: thread pays out of the spinnerets at the rear of
								the abdomen, so the abdomen sits on top and the head
								(eyes) points DOWN as she descends. -->
							<div
								class="spider-thread pointer-events-none absolute top-0 left-1/2 z-0"
								aria-hidden="true"
							></div>
							<div
								class="spider-drop pointer-events-none absolute top-0 left-1/2 z-10"
								aria-hidden="true"
							>
								<svg viewBox="0 0 32 180" class="spider-svg">
									<ellipse cx="16" cy="118" rx="7" ry="10" fill="#f1f5f9" />
									<circle cx="16" cy="132" r="4.5" fill="#f1f5f9" />
									<circle cx="14" cy="133" r="1" fill="#ef4444" />
									<circle cx="18" cy="133" r="1" fill="#ef4444" />
									<g stroke="#cbd5e1" stroke-width="1.8" fill="none" stroke-linecap="round">
										<path class="spider-leg" d="M11 114 L6 108 Q3 105 1 102" />
										<path class="spider-leg alt" d="M21 114 L26 108 Q29 105 31 102" />
										<path class="spider-leg" d="M10 121 L3 119 Q0 119 -2 123" />
										<path class="spider-leg alt" d="M22 121 L29 119 Q32 119 34 123" />
										<path class="spider-leg" d="M10 128 Q 2 134 3 144" />
										<path class="spider-leg alt" d="M22 128 Q 30 134 29 144" />
										<path class="spider-leg" d="M12 134 Q 7 143 10 152" />
										<path class="spider-leg alt" d="M20 134 Q 25 143 22 152" />
									</g>
								</svg>
							</div>
						{/if}
						<div
							class="border-b {theme.cardHeader} px-[clamp(0.75rem,1.1vw,2rem)] py-[clamp(0.6rem,1vh,1.5rem)]"
						>
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2">
									<span
										class="flex size-7 items-center justify-center rounded-full text-xs font-black {h.rank ===
										1
											? 'bg-amber-300 text-indigo-950'
											: 'bg-white/10 text-indigo-100/80'}"
									>
										{h.rank}
									</span>
									<div
										class="flex size-[clamp(3rem,7vw,14rem)] items-center justify-center p-2 {a.text}"
									>
										<Crest />
									</div>
								</div>
								<p
									class="text-[clamp(1.6rem,2.6vw,2.6rem)] leading-none font-black {theme.pointsGlow}"
								>
									{h.totalPoints}
								</p>
							</div>
							<p
								class="font-cinzel truncate text-[clamp(1rem,1.5vw,1.5rem)] font-bold text-indigo-50"
							>
								{h.house}
							</p>
						</div>
						<svg
							viewBox="0 0 200 200"
							class="min-h-0 w-full flex-1"
							role="img"
							aria-label="{h.house} web chart"
						>
							<!-- Axis legend: full names, like the default theme -->
							<g font-size="8" font-weight="600" fill="#c7d2fe" fill-opacity="0.75">
								{#each CATEGORIES as cat, ci (cat)}
									{@const la = webPoint(100, 100, webAngle(ci, CATEGORIES.length), 72)}
									<text x={la.x} y={la.y} text-anchor="middle" dominant-baseline="middle">
										{cat}
									</text>
								{/each}
							</g>
							{#each CATEGORIES as cat, ci (cat)}
								<path
									d={webSpokePath(100, 100, 112, ci, h.rank)}
									fill="none"
									stroke="#a5b4fc"
									stroke-opacity="0.35"
									stroke-width={webStrandWidth(ci, h.rank)}
									stroke-linecap="round"
								/>
							{/each}
							{#each WEB_RINGS as t, ri (t)}
								{#each CATEGORIES.keys() as ci (ci)}
									{@const seg = webRingSegment(100, 100, 62, t, ci, h.rank + ri * 0.7)}
									<path
										d={seg.d}
										fill="none"
										stroke="#a5b4fc"
										stroke-opacity={seg.o}
										stroke-width={seg.w}
										stroke-linecap="round"
									/>
								{/each}
							{/each}
							<path
								d={webDataPath(100, 100, 62, h, CATEGORIES)}
								fill="{a.hex}40"
								stroke={a.hex}
								stroke-width="2"
								stroke-opacity="0.9"
								stroke-linejoin="round"
							/>
						</svg>
						<div
							class="border-t {theme.divider} px-[clamp(0.75rem,1vw,1.8rem)] py-2 text-left text-[clamp(0.8rem,0.9vw,1.3rem)]"
						>
							{#each (h.topContributors ?? []).slice(0, 4) as c (c.studentId)}
								<div class="flex justify-between gap-2 leading-snug">
									<span class="truncate text-indigo-50/80">{c.englishName}</span>
									<b class="text-indigo-200">+{c.totalPoints}</b>
								</div>
							{/each}
						</div>
					</article>
				{/each}
			</div>
		</div>
	{:else if variantId === 'hal-graveyard'}
		<div
			class="relative flex min-h-screen flex-col items-center overflow-hidden bg-[linear-gradient(#050510,#12082a_55%,#1e0b3a)] px-4 pt-8 pb-32"
		>
			<div
				class="absolute top-[6%] right-[8%] size-[clamp(4rem,10vw,9rem)] rounded-full bg-[#f5f3ce] shadow-[0_0_80px_30px_rgba(245,243,206,0.25)]"
				aria-hidden="true"
			></div>
			<header class="z-10 text-center text-stone-100">
				<h1 class="font-caveat text-[clamp(2.75rem,5vw,5rem)] leading-none font-bold tracking-wide">
					🪦 Graveyard Row 🌕
				</h1>
				<svg
					viewBox="0 0 220 14"
					class="mx-auto mt-1 w-[clamp(9rem,16vw,16rem)]"
					aria-hidden="true"
				>
					<path
						d="M4 9 Q 34 3 66 8 T 128 8 T 216 6"
						fill="none"
						stroke="#fbbf24"
						stroke-width="3"
						stroke-linecap="round"
					/>
				</svg>
				<p
					class="font-caveat mt-2 text-[clamp(1.4rem,2.2vw,2.2rem)] leading-tight text-stone-300/80"
				>
					here lie the standings — points glow brighter than any ghost
				</p>
			</header>
			<div
				class="relative z-10 mt-[7vh] grid w-full flex-1 grid-cols-2 content-stretch items-stretch gap-[clamp(1rem,2.5vw,2.25rem)] px-[3vw] pb-[6vh] xl:grid-cols-4"
			>
				{#each houses as h, i (h.house)}
					{@const Crest = houseLogos[h.house as House]}
					{@const a = ACCENT[h.house as House]}
					<article
						class="tomb stone relative flex h-full flex-col items-center border-2 border-[#6b6557]/60 px-[clamp(0.75rem,1.5vw,1.5rem)] pt-[clamp(1.5rem,2.5vh,2.5rem)] pb-[clamp(0.75rem,1.5vh,1.5rem)] text-center shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
						style="border-radius:{TOMB_RADII[i % 4]}; transform: rotate({TOMB_TILT[i % 4]}deg)"
					>
						<span
							class="font-caveat absolute -top-4 -left-2 flex size-9 items-center justify-center border-2 border-[#6b6557] text-xl font-bold {i ===
							0
								? 'bg-[#fbbf24] text-[#3d3a30]'
								: 'bg-[#e9e5d6] text-[#6b6557]'}"
							style="border-radius: 47% 53% 50% 50% / 55% 48% 52% 45%"
						>
							{h.rank}
						</span>
						<span class="text-2xl" aria-hidden="true">{i === 0 ? '👑' : '🕯️'}</span>
						<div
							class="mt-2 flex size-[clamp(2.75rem,4vw,4rem)] items-center justify-center p-2 {a.text}"
						>
							<Crest />
						</div>
						<h2
							class="font-caveat mt-2 text-[clamp(1.6rem,2.4vw,2.4rem)] leading-none font-bold text-[#3d3a30]"
						>
							{h.house}
						</h2>
						<p
							class="font-caveat mt-2 text-[clamp(2.5rem,4vw,4rem)] leading-none font-bold text-[#c2410c] [text-shadow:1px_1px_0_rgba(107,101,87,0.35)]"
						>
							{h.totalPoints}
						</p>
						<p class="font-caveat mt-1 text-[1.1rem] text-[#6b6557]">points tally</p>
						<div
							class="mt-3 w-full space-y-2 border-t-2 border-dashed border-[#6b6557]/40 pt-3 text-left"
						>
							<p class="font-caveat text-[1.1rem] leading-none text-[#6b6557]">by subject</p>
							{#each CATEGORIES as cat (cat)}
								{@const val = h.pointsByCategory?.[cat] ?? 0}
								<div>
									<div class="font-caveat flex justify-between text-[1rem] leading-tight">
										<span class="text-[#3d3a30]/80">{cat}</span>
										<b class="text-[#3d3a30]">{val}</b>
									</div>
									<div
										class="h-2.5 border-2 border-dashed border-[#6b6557]/50"
										style="border-radius:{TOMB_RADII[(i + 1) % 4]}"
									>
										<div
											class="h-full bg-[#ea580c]/70"
											style="width:{Math.round(
												(val / Math.max(...houses.map((x) => x.pointsByCategory?.[cat] ?? 0), 1)) *
													100
											)}%; border-radius:{TOMB_RADII[(i + 2) % 4]}"
										></div>
									</div>
								</div>
							{/each}
						</div>
						<div class="mt-3 w-full border-t-2 border-dashed border-[#6b6557]/40 pt-2 text-left">
							<p class="font-caveat text-[1.1rem] leading-none text-[#6b6557]">footnotes</p>
							{#each (h.topContributors ?? []).slice(0, 4) as c (c.studentId)}
								<div class="font-caveat flex justify-between gap-2 text-[1.05rem] leading-snug">
									<span class="truncate text-[#3d3a30]/85">{c.englishName}</span>
									<b class="shrink-0 text-[#c2410c]">+{c.totalPoints}</b>
								</div>
							{/each}
						</div>
						<p class="font-caveat mt-auto pt-3 text-[1.05rem] text-[#6b6557]/80">
							✎ {i === 0 ? 'crowned in spirit' : 'resting until next tally'}
						</p>
					</article>
				{/each}
			</div>
			<div
				class="fog pointer-events-none absolute bottom-0 left-0 h-24 w-full"
				aria-hidden="true"
			></div>
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
	.font-caveat {
		font-family: 'Caveat', 'Comic Sans MS', cursive;
	}
	/* Realistic weathered stone: light from top-left, darker foot, grain speckle */
	.stone {
		background:
			radial-gradient(circle at 28% 8%, rgba(255, 255, 255, 0.55), transparent 42%),
			radial-gradient(circle at 78% 90%, rgba(61, 58, 48, 0.22), transparent 46%),
			radial-gradient(circle at 15% 70%, rgba(61, 58, 48, 0.1), transparent 30%),
			radial-gradient(rgba(107, 101, 87, 0.22) 1px, transparent 1.4px),
			linear-gradient(#d9d4c3, #b3ac99);
		background-size:
			auto,
			auto,
			auto,
			7px 7px,
			auto;
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
	.particle.ember {
		background: #fb923c;
		box-shadow: 0 0 8px #ea580c;
	}
	.fog {
		background: linear-gradient(to top, rgba(167, 139, 250, 0.18), transparent);
		animation: protoFog 9s ease-in-out infinite alternate;
	}
	@keyframes protoFog {
		from {
			transform: translateX(-2%);
		}
		to {
			transform: translateX(2%);
		}
	}
	/* Spider drop: descends on its thread, dangles, then retracts. Loops.
		Two elements: a ceiling-anchored silk strand (own element, stays glued to
		the card top) and the spider body (SVG) that travels down/up on the strand.
		Scale for TV: spider grows on large screens and travels a longer arc. */
	.spider-thread {
		--silk: 236px;
		--spider-x: 32px; /* shift right by one spider width so the crest stays clear */
		position: absolute;
		inset: 0 0 auto 50%;
		left: calc(50% + var(--spider-x));
		transform: translate(-50%, 0);
		width: 1.2px;
		height: var(--silk);
		background: #e2e8f0;
		opacity: 0.85;
		transform-origin: top center;
		animation: spiderSilk 16s ease-in-out infinite;
	}
	.spider-drop {
		--silk: 236px;
		--spider-x: 32px;
		--body: 108px; /* SVG-top → thread-attachment point (top of abdomen) */
		position: absolute;
		/* Only top+left: with `right: 0` the div stretches to the full card
			width and translate(-50%) would shove the SVG half a card away
			from the thread (the horizontal detachment). */
		top: 0;
		left: calc(50% + var(--spider-x));
		transform: translate(-50%, calc(var(--silk, 164px) * 0.05 - var(--body, 108px)));
		animation: spiderDrop 16s ease-in-out infinite;
	}
	.spider-svg {
		width: 32px;
		height: auto;
	}
	.spider-leg {
		transform-box: fill-box;
		transform-origin: 90% 80%;
		animation: legPaddle 0.9s ease-in-out infinite alternate;
	}
	.spider-leg.alt {
		animation-delay: 0.45s;
	}
	/* Larger screens: bigger spider, longer arc, longer silk. Vars keep the
		keyframes single-sourced (duplicate @keyframes resolve last-wins and
		would clobber these values). */
	@media (min-width: 1280px) {
		.spider-thread {
			--silk: 330px;
			--spider-x: 48px;
			width: 1.6px;
		}
		.spider-drop {
			--silk: 330px;
			--spider-x: 48px;
			--body: 162px; /* 48px SVG → 270px tall → abdomen-top offset 162 */
		}
		.spider-svg {
			width: 48px;
		}
	}
	@media (min-width: 1921px) {
		.spider-thread {
			--silk: 440px;
			--spider-x: 64px;
			width: 2px;
		}
		.spider-drop {
			--silk: 440px;
			--spider-x: 64px;
			--body: 216px; /* 64px SVG → 360px tall → abdomen-top offset 216 */
		}
		.spider-svg {
			width: 64px;
		}
	}
	/* The spider's position is derived from the SAME silk scale (0.05 ↔ 1)
		times --silk, minus the SVG-top→attachment offset — so thread end and
		spider abdomen coincide at every instant, at every breakpoint. */
	@keyframes spiderDrop {
		0%,
		8% {
			transform: translate(-50%, calc(var(--silk, 164px) * 0.05 - var(--body, 108px)));
		}
		32%,
		62% {
			transform: translate(-50%, calc(var(--silk, 164px) - var(--body, 108px)));
		}
		86%,
		100% {
			transform: translate(-50%, calc(var(--silk, 164px) * 0.05 - var(--body, 108px)));
		}
	}
	@keyframes spiderSilk {
		0%,
		8% {
			transform: translate(-50%, 0) scaleY(0.05);
		}
		32%,
		62% {
			transform: translate(-50%, 0) scaleY(1);
		}
		86%,
		100% {
			transform: translate(-50%, 0) scaleY(0.05);
		}
	}
	@keyframes legPaddle {
		from {
			transform: rotate(-5deg);
		}
		to {
			transform: rotate(5deg);
		}
	}
	/* 4K: scale every rem-based size proportionally (text, badges, padding). */
	@media (min-width: 1921px) {
		:global(html) {
			font-size: 1.75rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spider-drop,
		.spider-thread,
		.spider-svg,
		.spider-leg {
			animation: none;
		}
		.spider-thread {
			transform: translate(-50%, 0) scaleY(1);
		}
		.spider-drop {
			transform: translate(-50%, calc(var(--silk, 164px) - var(--body, 108px)));
		}
		.spider-svg {
			transform: none;
		}
	}
</style>
