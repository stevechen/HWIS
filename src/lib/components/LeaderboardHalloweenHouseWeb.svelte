<script lang="ts">
	// Halloween "House Web" board — bespoke full-page design, like the two
	// Thanksgiving themes. Ported from the hal-web variant of
	// /display/proto-seasonal-themes (mock prototype) to live Convex data.
	//
	// The hunter spider hangs from the TOP OF THE PAGE (not from the card): one
	// viewport-anchored overlay holds the silk + spider, and its travel is
	// measured from the live 1st-place card, so it lands on whichever house is
	// currently leading and re-targets itself whenever the board re-ranks.
	import { SPIDER_WEB_PATH, SPIDER_WEB_VIEWBOX } from '$lib/components/spider-web-art';
	import { houseLogos } from '$lib/assets/house-logos';
	import { HOUSES } from '$lib/constants/houses';
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

	let {
		houses = [] as HouseEntry[],
		categories = [] as string[]
	}: { houses?: HouseEntry[]; categories?: string[] } = $props();

	const theme = $derived(resolveLeaderboardTheme('halloween'));
	const sorted = $derived(
		[...houses].sort((a, b) => HOUSES.indexOf(a.house as House) - HOUSES.indexOf(b.house as House))
	);
	// The hunter hangs from the page ceiling and lands on the 1st-place card, so
	// both halves of its geometry are measured rather than guessed: the cards sit
	// in house order (not rank order), so the leader can be any column, and only
	// layout knows how far below the page top that card starts.
	let layerEl = $state<HTMLDivElement | undefined>();
	const cardEls = $state<(HTMLElement | undefined)[]>([]);
	const leaderEl = $derived.by(() => {
		const i = sorted.findIndex((h) => h.rank === 1);
		return i < 0 ? undefined : cardEls[i];
	});
	let silkLen = $state(0);
	let laneX = $state(0);

	$effect(() => {
		if (!layerEl || !leaderEl) return;
		const layer = layerEl;
		const card = leaderEl;
		const measure = () => {
			const l = layer.getBoundingClientRect();
			const c = card.getBoundingClientRect();
			silkLen = Math.max(Math.round(c.top - l.top), 0);
			laneX = Math.round(c.left - l.left + c.width / 2);
		};
		measure();
		// Each card is stretched to the grid row, so watching the leader's box also
		// catches the header reflows (web fonts landing, longer house names) that
		// move every card down without resizing the page.
		const observer = new ResizeObserver(measure);
		observer.observe(layer);
		observer.observe(card);
		window.addEventListener('resize', measure);
		let disposed = false;
		void document.fonts?.ready.then(() => {
			if (!disposed) measure();
		});
		return () => {
			disposed = true;
			observer.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

	// R·E·S·P·E·C·T axes (Responsibility, Excellence, Service, Persistence,
	// Enthusiasm, Collaboration, Trustworthiness). Rings cave inward between
	// spokes like real silk; every strand gets its own curvature + width so no
	// two segments look stamped out.
	const CATEGORIES = [
		'Responsibility',
		'Excellence',
		'Service',
		'Persistence',
		'Enthusiasm',
		'Collaboration',
		'Trustworthiness'
	];
	const WEB_RINGS = [0.3, 0.55, 0.8, 1];
	const webMax = $derived(
		Math.max(...sorted.flatMap((h) => CATEGORIES.map((c) => h.pointsByCategory?.[c] ?? 0)), 1)
	);
	const chartCats = $derived(categories.length > 0 ? categories : CATEGORIES);

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
		const n = chartCats.length;
		// Nodes sit exactly on the radials — radius R·t on the axis angle, with no
		// per-strand radial jitter — so every intersection in the web lands on the
		// strand it belongs to. The hand-spun look comes from this segment's own
		// sag, width and opacity instead, which is also how a real orb web reads:
		// the radials are straight, the capture silk sags between them.
		const a = webPoint(cx, cy, webAngle(i % n, n), R * t);
		const b = webPoint(cx, cy, webAngle((i + 1) % n, n), R * t);
		// Cave inward: control radius dips toward the hub, uniquely per strand.
		const sag = 0.74 + 0.1 * Math.abs(Math.sin(seed * 1.7 + i * 3.3));
		const c = webPoint(cx, cy, webAngle(i + 0.5, n), R * t * sag);
		return {
			d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
			w: 0.5 + 0.8 * Math.abs(Math.sin(seed * 0.9 + i * 2.4 + t * 5)),
			o: 0.22 + 0.18 * Math.abs(Math.sin(seed * 1.3 + i * 1.1 + t * 7))
		};
	}

	/** Radial threads run dead straight from the hub, and every tip sits on the
	 * same circle (WEB_SPOKE_TIP), so the axes are perfectly evenly placed. A
	 * bowed radial leans off its own angle: the legend labels and ring nodes -
	 * which are placed on the true angle - end up a few pixels beside the
	 * strand. Straight radials put all three on the same line.
	 *
	 * The tip radius is what puts the axis on the card frame: the strand has to
	 * clear the chart box, the legend labels AND the card body, then it is
	 * clipped by the card's own `overflow-hidden`. The chart scales by `meet`,
	 * so a non-square card body letterboxes it and the hub sits a long way below
	 * the card top; in user units that gap grows as the card gets narrower.
	 * Measured: a 16:9 4-column wall needs ~230, a 4:3 one ~330. 520 clears both
	 * with headroom, and overshooting costs nothing — anything past the card edge
	 * is clipped, so the visible strand stops at the frame either way. */
	const WEB_SPOKE_TIP = 520;
	function webSpokePath(cx: number, cy: number, i: number): string {
		const end = webPoint(cx, cy, webAngle(i, chartCats.length), WEB_SPOKE_TIP);
		return `M ${cx} ${cy} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
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

	const ACCENT: Record<House, { text: string; bg: string; hex: string }> = {
		Heracles: { text: 'text-red-400', bg: 'bg-red-500/10', hex: '#f87171' },
		Wukong: { text: 'text-amber-400', bg: 'bg-amber-500/10', hex: '#fbbf24' },
		Ixbalam: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', hex: '#34d399' },
		Setna: { text: 'text-blue-400', bg: 'bg-blue-500/10', hex: '#60a5fa' }
	};
</script>

<!-- The hunter spider + its silk hang from the TOP OF THE PAGE, not from the card:
	one viewport-anchored overlay owns both halves, so the thread stays nailed to
	the ceiling while --silk (ceiling → 1st-place card top) and --lane (page left →
	that card's centre), both measured above, decide how far it pays out and which
	column it falls down. Lands, dangles, retracts, loops. -->
<div
	bind:this={layerEl}
	class="spider-layer pointer-events-none fixed inset-0 z-30"
	style="--silk: {silkLen}px; --lane: {laneX}px"
	aria-hidden="true"
>
	<div class="spider-thread absolute top-0"></div>
	<div class="spider-drop absolute top-0">
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
</div>
<!-- The svgrepo icon is drawn for the TOP-RIGHT corner: its hub sits on the
	right edge (~x=272) with anchors running to the top/bottom/left. So:
	top-right renders as-is; the other corners mirror it. Sizes, offsets and
	rotations deliberately vary (some bleed off-screen) so the four corners
	don't read as a stamped pattern. -->
{#snippet cornerWeb(cls: string, flip: string)}
	<svg class={flip ? `${cls} ${flip}` : cls} viewBox={SPIDER_WEB_VIEWBOX} aria-hidden="true">
		<path d={SPIDER_WEB_PATH} fill="#c7d2fe" fill-opacity="0.32" />
	</svg>
{/snippet}
{@render cornerWeb('pointer-events-none absolute -top-8 right-0 w-[20vw] max-w-72 opacity-90', '')}
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
<section
	class="relative z-0 flex h-full min-h-0 flex-col overflow-hidden px-[3vw] pt-6 pb-6 {theme.section}"
>
	<header class="relative z-10 shrink-0 text-center">
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
		class="relative z-10 mt-[1.5vh] grid min-h-0 w-full flex-1 grid-cols-1 items-stretch gap-[clamp(1rem,2.5vw,2.5rem)] sm:grid-cols-2 xl:grid-cols-4"
	>
		{#each sorted as h, i (h.house)}
			{@const Crest = houseLogos[h.house as House]}
			{@const a = ACCENT[h.house as House]}
			<article
				bind:this={cardEls[i]}
				aria-label="{h.house}, rank {h.rank}, {h.totalPoints} points"
				class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border {theme.card} {h.rank ===
				1
					? 'ring-2 ring-orange-300/60'
					: ''}"
			>
				<!-- Faint oversized web watermark behind the card content; position/size
				vary per rank so the four cards don't mirror each other. -->
				<svg
					class="pointer-events-none absolute {h.rank === 1
						? '-top-12 -right-12 w-52 -scale-x-100'
						: h.rank === 2
							? '-bottom-8 -left-8 w-36 -scale-100 opacity-[0.1]'
							: h.rank === 3
								? '-top-6 -left-10 w-44 rotate-6'
								: '-right-8 -bottom-10 w-40 -scale-y-100'} opacity-[0.13]"
					viewBox={SPIDER_WEB_VIEWBOX}
					aria-hidden="true"
				>
					<path d={SPIDER_WEB_PATH} fill="#c7d2fe" />
				</svg>

				<div
					class="relative border-b {theme.cardHeader} px-[clamp(0.75rem,1.1vw,2rem)] py-[clamp(0.6rem,1vh,1.5rem)]"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<span
								class="flex size-10 items-center justify-center rounded-full font-black text-white {h.rank ===
								1
									? 'bg-amber-300 text-indigo-950'
									: 'text-white-100/80 bg-white/30'}"
							>
								{h.rank}
							</span>
							<div
								class="flex size-[clamp(3rem,7vw,14rem)] items-center justify-center p-2 {a.text}"
							>
								<Crest />
							</div>
						</div>
						<p class="text-[clamp(1.6rem,2.6vw,2.6rem)] leading-none font-black {theme.pointsGlow}">
							{h.totalPoints}
						</p>
					</div>
					<!-- No house-name line: the crest above names the house. -->
				</div>
				<svg
					viewBox="0 0 200 200"
					class="min-h-0 w-full flex-1 overflow-visible"
					role="img"
					aria-label="{h.house} web chart"
				>
					<!-- Axis legend: full names, like the default theme -->
					<g font-size="8" font-weight="600" fill="#c7d2fe" fill-opacity="0.75">
						{#each chartCats as cat, ci (cat)}
							{@const la = webPoint(100, 100, webAngle(ci, chartCats.length), 72)}
							<text x={la.x} y={la.y} text-anchor="middle" dominant-baseline="middle">
								{cat}
							</text>
						{/each}
					</g>
					<!-- Spokes are nailed to the card frame: they run well past the
					outer ring AND the legend labels, and the chart is
					overflow-visible, so the tips leave the chart box entirely and
					are clipped by the card itself — no gaps at the letterboxed
					edges of a non-square card body. -->
					{#each chartCats as cat, ci (cat)}
						<path
							d={webSpokePath(100, 100, ci)}
							fill="none"
							stroke="#a5b4fc"
							stroke-opacity="0.35"
							stroke-width={webStrandWidth(ci, h.rank)}
							stroke-linecap="round"
						/>
					{/each}
					{#each WEB_RINGS as t, ri (t)}
						{#each chartCats.keys() as ci (ci)}
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
						d={webDataPath(100, 100, 62, h, chartCats)}
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
</section>

<style>
	/* Spider drop: descends on its thread, dangles, then retracts. Loops.
		The silk is anchored to the page ceiling — this overlay is viewport-fixed —
		and pays out until the abdomen reaches the 1st-place card, so both the
		length (--silk: page top → card top) and the lane (--lane: page left → card
		centre) are the measured values set inline above. --spider-x then nudges
		both halves right by one spider width so the leader's crest stays clear;
		--body is the SVG-top → spinneret offset (one spider width × 3.375). */
	.spider-thread {
		--spider-x: 32px;
		left: var(--lane, 0px);
		margin-left: var(--spider-x);
		width: 1.2px;
		height: var(--silk, 0px);
		transform: translate(-50%, 0);
		background: #e2e8f0;
		opacity: 0.85;
		transform-origin: top center;
		animation: spiderSilk 16s ease-in-out infinite;
	}
	.spider-drop {
		--spider-x: 32px;
		--body: 108px; /* SVG-top → thread-attachment point (top of abdomen) */
		left: var(--lane, 0px);
		margin-left: var(--spider-x);
		transform: translate(-50%, calc(var(--silk, 0px) * 0.05 - var(--body, 108px)));
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
	/* Larger screens: bigger spider, and a bigger crest-clearing nudge to match.
		The travel distance needs no entries here — it is measured from the live
		card, so it already tracks the layout at every size. */
	@media (min-width: 1280px) {
		.spider-thread {
			--spider-x: 48px;
			width: 1.6px;
		}
		.spider-drop {
			--spider-x: 48px;
			--body: 162px; /* 48px SVG → 270px tall → abdomen-top offset 162 */
		}
		.spider-svg {
			width: 48px;
		}
	}
	@media (min-width: 1921px) {
		.spider-thread {
			--spider-x: 64px;
			width: 2px;
		}
		.spider-drop {
			--spider-x: 64px;
			--body: 216px; /* 64px SVG → 360px tall → abdomen-top offset 216 */
		}
		.spider-svg {
			width: 64px;
		}
	}
	/* The spider's position is derived from the SAME silk scale (0.05 ↔ 1)
		times --silk, minus the SVG-top→attachment offset — so thread end and
		spider abdomen coincide at every instant, at every size. --silk falls back
		to 0px so the pre-measurement paint keeps the spider hidden off-screen. */
	@keyframes spiderDrop {
		0%,
		8% {
			transform: translate(-50%, calc(var(--silk, 0px) * 0.05 - var(--body, 108px)));
		}
		32%,
		62% {
			transform: translate(-50%, calc(var(--silk, 0px) - var(--body, 108px)));
		}
		86%,
		100% {
			transform: translate(-50%, calc(var(--silk, 0px) * 0.05 - var(--body, 108px)));
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
			transform: translate(-50%, calc(var(--silk, 0px) - var(--body, 108px)));
		}
		.spider-svg {
			transform: none;
		}
	}
	.font-cinzel {
		font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
	}
</style>
