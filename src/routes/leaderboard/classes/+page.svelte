<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CircleAlert, Medal, Trophy } from '@lucide/svelte';
	import RadarChart from '$lib/components/RadarChart.svelte';
	import { useViewer } from '$lib/viewer.svelte';

	let viewportWidth = $state(1920);

	const loadingMessages = [
		{ title: 'Summoning class spirit…', subtitle: 'the roll call is starting' },
		{ title: 'Polishing the class cups…', subtitle: 'every point counts' },
		{ title: 'Counting every kind act…', subtitle: 'across all 14 classes' },
		{ title: 'Waking the portraits…', subtitle: 'they love a leaderboard' }
	];
	let loadingMsgIndex = $state(0);
	let hasMounted = $state(false);
	let loadingInterval: ReturnType<typeof setInterval> | null = null;

	type StarMote = { left: number; top: number; size: number; delay: number; dur: number };
	let stars = $state<StarMote[]>([]);

	onMount(() => {
		if (!browser) return;
		document.documentElement.style.overflow = 'hidden';
		document.body.style.overflow = 'hidden';
		const updateWidth = () => {
			viewportWidth = window.innerWidth;
		};
		updateWidth();
		window.addEventListener('resize', updateWidth);
		const rand = (min: number, max: number) => min + Math.random() * (max - min);
		stars = Array.from({ length: 80 }, () => ({
			left: rand(0, 100),
			top: rand(0, 100),
			size: rand(1.5, 3.5),
			delay: rand(0, 5),
			dur: rand(2, 5)
		}));
		loadingMsgIndex = Math.floor(Math.random() * loadingMessages.length);
		hasMounted = true;
		const startInterval = () => {
			if (loadingInterval) clearInterval(loadingInterval);
			loadingInterval = setInterval(() => {
				loadingMsgIndex = (loadingMsgIndex + 1) % loadingMessages.length;
			}, 2600);
		};
		startInterval();
		return () => window.removeEventListener('resize', updateWidth);
	});

	onDestroy(() => {
		if (!browser) return;
		document.documentElement.style.overflow = '';
		document.body.style.overflow = '';
		if (loadingInterval) clearInterval(loadingInterval);
	});

	const theme = {
		label: 'Enchanted Ceiling',
		section: 'bg-[#050716] text-indigo-50',
		titleFont: 'font-cinzel',
		font: 'font-cormorant',
		card: 'organic-border border-indigo-200/25 bg-white/[0.06] backdrop-blur-2xl shadow-[0_25px_80px_-20px_rgba(90,120,255,0.28)]',
		cardHeader: 'border-b border-indigo-200/15',
		divider: 'border-indigo-200/10',
		panelTitle: 'text-indigo-100',
		pointsGlow: 'text-cyan-200 drop-shadow-[0_0_24px_rgba(120,220,255,0.8)]'
	} as const;

	const rankBadges: Record<number, string> = {
		1: '1st',
		2: '2nd',
		3: '3rd'
	};
	const rankColors: Record<number, string> = {
		1: 'text-yellow-300',
		2: 'text-slate-200',
		3: 'text-orange-300'
	};

	const palette = [
		'#8b9cff',
		'#60a5fa',
		'#34d399',
		'#fbbf24',
		'#f87171',
		'#a78bfa',
		'#22d3ee'
	] as const;

	const session = useViewer();
	const isAuthLoading = $derived(session.status === 'loading');

	const classesQuery = useQuery(api.students.getPublicClassStats, () =>
		session.isApproved ? {} : 'skip'
	);

	const categories = $derived(classesQuery.data?.categories || []);
	const classes = $derived(classesQuery.data?.classes || []);

	const radarSize = $derived(Math.round(Math.min(Math.max(viewportWidth * 0.095, 110), 190)));

	const globalMax = $derived(
		classesQuery.data?.classes
			? Math.max(
					...classesQuery.data.classes.flatMap((c) =>
						Object.values(c.pointsByCategory).map((v) => Number(v))
					),
					0
				)
			: 100
	);
	const globalMin = $derived(
		classesQuery.data?.classes
			? Math.min(
					...classesQuery.data.classes.flatMap((c) =>
						Object.values(c.pointsByCategory).map((v) => Number(v))
					),
					0
				)
			: 0
	);
	const radarMinValue = $derived(Math.min(globalMin, 0));
	const radarMaxValue = $derived(Math.max(globalMax, 0));
	const radarTicks = $derived.by(() => {
		if (radarMaxValue === radarMinValue) return [radarMinValue];
		const allValues: number[] = [];
		const step = (radarMaxValue - radarMinValue) / 4;
		for (let i = 0; i <= 4; i++) {
			const val = Math.round(radarMinValue + step * i);
			if (!allValues.includes(val)) allValues.push(val);
		}
		if (allValues.length < 2) {
			allValues.length = 0;
			allValues.push(radarMinValue);
			allValues.push(radarMaxValue);
		}
		return allValues;
	});

	function getRadarData(entry: { displayName: string; pointsByCategory: Record<string, number> }) {
		if (!entry?.pointsByCategory) return [];
		const data: Record<string, number> = {};
		for (const [k, v] of Object.entries(entry.pointsByCategory)) data[k] = Number(v);
		return [{ label: entry.displayName, ...data }];
	}
</script>

<svelte:head>
	<title>HWIS Class Leaderboard</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cormorant+Garamond:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<section
	class="class-display-page relative flex h-screen flex-col overflow-hidden {theme.section} {theme.font} p-[clamp(0.5rem,1vw,100rem)]"
>
	<svg style="position: absolute; width: 0; height: 0;" aria-hidden="true">
		<defs>
			<filter id="hand-drawn-c1"
				><feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="2"
					result="noise"
				/><feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/></filter
			>
			<filter id="hand-drawn-c2"
				><feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="8"
					result="noise"
				/><feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/></filter
			>
			<filter id="hand-drawn-c3"
				><feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="14"
					result="noise"
				/><feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/></filter
			>
			<filter id="hand-drawn-c4"
				><feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="22"
					result="noise"
				/><feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/></filter
			>
		</defs>
	</svg>
	<div class="vignette pointer-events-none absolute inset-0 z-1"></div>
	{#if hasMounted}
		<div class="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
			{#each stars as m, i (i)}
				<span
					class="star"
					style="--delay:{m.delay}s; left:{m.left}%; top:{m.top}%; width:{m.size}px; height:{m.size}px;"
				></span>
			{/each}
		</div>
	{/if}
	{#if isAuthLoading || classesQuery.isLoading}
		<div class="flex h-full flex-col items-center justify-center gap-6 text-white">
			<div class="relative">
				<div
					class="size-16 animate-spin rounded-full border-4 border-white/20 border-b-white"
					role="status"
					aria-label="Loading"
				></div>
				<div class="absolute inset-0 flex items-center justify-center">
					<span class="animate-pulse text-2xl" aria-hidden="true">✨</span>
				</div>
			</div>
			<div class="min-h-14 text-center">
				{#if hasMounted}
					{#key loadingMsgIndex}
						<p
							class="animate-[slideInUp_0.5s_ease-out] text-[clamp(1.4rem,1.8vw,100rem)] font-semibold tracking-wide"
						>
							{loadingMessages[loadingMsgIndex].title}
						</p>
						<p class="mt-1 text-[clamp(1rem,1.2vw,100rem)] text-white/60">
							{loadingMessages[loadingMsgIndex].subtitle}
						</p>
					{/key}
				{/if}
				<p class="mt-3 flex justify-center gap-1.5" aria-hidden="true">
					<span
						class="animation-duration-[0.9s] size-2 animate-bounce rounded-full bg-white/70 [animation-delay:0ms]"
					></span>
					<span
						class="animation-duration-[0.9s] size-2 animate-bounce rounded-full bg-white/70 [animation-delay:150ms]"
					></span>
					<span
						class="animation-duration-[0.9s] size-2 animate-bounce rounded-full bg-white/70 [animation-delay:300ms]"
					></span>
				</p>
			</div>
		</div>
	{:else if classesQuery.error}
		<div class="flex h-full flex-col items-center justify-center text-center text-white">
			<CircleAlert class="mb-4 size-16 text-red-300" aria-label="Alert" />
			<p class="text-[clamp(1.5rem,3vw,100rem)] font-bold">Failed to load class statistics</p>
		</div>
	{:else if classesQuery.data}
		<div class="relative z-10 flex h-full min-h-0 w-full max-w-full min-w-0 flex-col">
			<div class="relative z-10 grid min-h-0 min-w-0 flex-1 grid-cols-7 grid-rows-2 gap-2 sm:gap-3">
				{#each classes as entry, idx (entry.classId)}
					{@const rank = entry.rank}
					{@const isTop3 = rank >= 1 && rank <= 3}
					{@const isFirst = rank === 1}
					{@const color = palette[idx % palette.length]}
					{@const filterClass = `filter-c${(idx % 4) + 1}`}
					<article
						class="relative z-10 flex min-h-0 max-w-full min-w-0 flex-col overflow-hidden border {filterClass} {isFirst
							? 'organic-border border-amber-400/35 bg-amber-500/10 shadow-[0_0_28px_rgba(251,191,36,0.35),0_12px_32px_rgba(251,191,36,0.18)] backdrop-blur-2xl'
							: theme.card}"
					>
						<div
							class="flex min-h-0 flex-col gap-1 border-b px-[clamp(0.5rem,0.7vw,100rem)] py-[clamp(0.45rem,0.6vw,100rem)] {isFirst
								? 'border-amber-400/20'
								: 'border-indigo-200/15'}"
						>
							<div class="flex items-center justify-between gap-2">
								<p
									class="truncate text-[clamp(0.85rem,1.05vw,100rem)] font-black tracking-wide {theme.titleFont} {theme.panelTitle}"
								>
									{entry.displayName}
								</p>
								{#if isTop3}
									<span
										class="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[clamp(0.7rem,0.8vw,100rem)] font-black {rankColors[
											rank
										]}"
									>
										{#if rank === 1}<Trophy
												class="size-[clamp(0.9rem,1vw,100rem)]"
												aria-label="Trophy"
											/>{:else}<Medal
												class="size-[clamp(0.9rem,1vw,100rem)]"
												aria-label="Medal"
											/>{/if}
										{rankBadges[rank]}
									</span>
								{:else}<span
										class="shrink-0 text-[clamp(0.65rem,0.75vw,100rem)] font-bold text-white/25"
										>#{rank}</span
									>{/if}
							</div>
							<p
								class="text-center text-[clamp(1.6rem,2.2vw,100rem)] leading-none font-black {theme.pointsGlow}"
							>
								{#key entry.totalPoints}<span class="animate-house-pop">{entry.totalPoints}</span
									>{/key}
							</p>
						</div>
						<div class="flex min-h-0 flex-1 items-center justify-center px-1 py-1">
							{#if categories.length > 0}
								<RadarChart
									data={getRadarData(entry)}
									features={categories}
									ticks={radarTicks}
									minValue={radarMinValue}
									maxValue={radarMaxValue}
									colors={[color]}
									size={radarSize}
								/>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</div>
	{/if}
</section>

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
	.animate-house-pop {
		display: inline-block;
		animation: housePop 0.85s cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}
	@keyframes housePop {
		0% {
			transform: scale(0.35) rotate(-9deg);
			opacity: 0;
			filter: brightness(1.9) drop-shadow(0 0 0 rgba(120, 220, 255, 0));
		}
		28% {
			transform: scale(1.42) rotate(5deg);
			opacity: 1;
			filter: brightness(1.85) drop-shadow(0 0 22px rgba(120, 220, 255, 1));
		}
		48% {
			transform: scale(0.9) rotate(-3deg);
			filter: brightness(1.3) drop-shadow(0 0 14px rgba(120, 220, 255, 0.85));
		}
		68% {
			transform: scale(1.1) rotate(2deg);
		}
		85% {
			transform: scale(0.97) rotate(-1deg);
		}
		100% {
			transform: scale(1) rotate(0);
			filter: brightness(1) drop-shadow(0 0 24px rgba(120, 220, 255, 0.8));
		}
	}
	.font-cinzel {
		font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
	}
	.font-cormorant {
		font-family: 'Cormorant Garamond', Georgia, serif;
	}
	.organic-border {
		position: relative;
		border: none;
		border-radius: 22px 16px 20px 14px / 14px 20px 16px 22px;
	}
	.organic-border::before {
		content: '';
		position: absolute;
		inset: 0;
		border: 1.5px solid rgba(199, 210, 254, 0.24);
		border-radius: inherit;
		pointer-events: none;
		z-index: 2;
	}
	.filter-c1.organic-border::before {
		filter: url(#hand-drawn-c1);
	}
	.filter-c2.organic-border::before {
		filter: url(#hand-drawn-c2);
	}
	.filter-c3.organic-border::before {
		filter: url(#hand-drawn-c3);
	}
	.filter-c4.organic-border::before {
		filter: url(#hand-drawn-c4);
	}
	.vignette {
		background: radial-gradient(
			circle at 50% 0%,
			transparent 0%,
			rgba(0, 0, 0, 0) 45%,
			rgba(0, 0, 0, 0.28) 78%,
			rgba(0, 0, 0, 0.55) 100%
		);
	}
	.star {
		position: absolute;
		border-radius: 9999px;
		background: #dbe7ff;
		box-shadow: 0 0 8px 1px rgba(150, 200, 255, 0.85);
		pointer-events: none;
		animation: twinkle 3.5s ease-in-out infinite;
		animation-delay: var(--delay, 0s);
	}
	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.15;
			transform: scale(0.7);
		}
		50% {
			opacity: 1;
			transform: scale(1.2);
		}
	}
</style>
