<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CircleAlert, Medal, Star, TrendingUp, Trophy } from '@lucide/svelte';
	import RadarChart from '$lib/components/RadarChart.svelte';
	import { houseLogos } from '$lib/assets/house-logos';
	import { useViewer } from '$lib/viewer.svelte';

	let viewportWidth = $state(1920);

	const loadingMessages = [
		{ title: 'Summoning house magic…', subtitle: 'the Great Hall is waking up' },
		{ title: 'Polishing the house cups…', subtitle: 'still a few smudges left' },
		{ title: 'Herding house elves…', subtitle: 'they’re shy but willing' },
		{ title: 'Counting every kind act…', subtitle: 'even the tiny ones count' },
		{ title: 'Waking the portraits…', subtitle: 'they have gossip to share' }
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
		// Star field (Enchanted Ceiling)
		const rand = (min: number, max: number) => min + Math.random() * (max - min);
		stars = Array.from({ length: 80 }, () => ({
			left: rand(0, 100),
			top: rand(0, 100),
			size: rand(1.5, 3.5),
			delay: rand(0, 5),
			dur: rand(2, 5)
		}));
		// Pick a random starter so refresh isn't always "Summoning"
		loadingMsgIndex = Math.floor(Math.random() * loadingMessages.length);
		hasMounted = true;
		// Rotate playful message while we wait for auth
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

	type House = 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna';

	// Star Ceiling — hard-locked theme (ported from prototype)
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

	const houseTheme: Record<
		House,
		{ accentText: string; accentBorder: string; accentBg: string; radar: string }
	> = {
		Heracles: {
			accentText: 'text-red-400',
			accentBorder: 'ring-red-400/50',
			accentBg: 'bg-red-500/10',
			radar: '#f87171'
		},
		Wukong: {
			accentText: 'text-amber-400',
			accentBorder: 'ring-amber-400/50',
			accentBg: 'bg-amber-500/10',
			radar: '#fbbf24'
		},
		Ixbalam: {
			accentText: 'text-emerald-400',
			accentBorder: 'ring-emerald-400/50',
			accentBg: 'bg-emerald-500/10',
			radar: '#34d399'
		},
		Setna: {
			accentText: 'text-blue-400',
			accentBorder: 'ring-blue-400/50',
			accentBg: 'bg-blue-500/10',
			radar: '#60a5fa'
		}
	};

	const firstPlaceCard: Record<House, string> = {
		Heracles:
			'bg-red-500/10 border-red-400/35 shadow-[0_0_36px_rgba(248,113,113,0.48),0_12px_48px_rgba(248,113,113,0.22)]',
		Wukong:
			'bg-amber-500/10 border-amber-400/35 shadow-[0_0_36px_rgba(251,191,36,0.48),0_12px_48px_rgba(251,191,36,0.22)]',
		Ixbalam:
			'bg-emerald-500/10 border-emerald-400/35 shadow-[0_0_36px_rgba(52,211,153,0.48),0_12px_48px_rgba(52,211,153,0.22)]',
		Setna:
			'bg-blue-500/10 border-blue-400/35 shadow-[0_0_36px_rgba(96,165,250,0.48),0_12px_48px_rgba(96,165,250,0.22)]'
	};
	const firstPlaceHeader: Record<House, string> = {
		Heracles: 'border-red-400/20',
		Wukong: 'border-amber-400/20',
		Ixbalam: 'border-emerald-400/20',
		Setna: 'border-blue-400/20'
	};

	const houseRadarColors: Record<House, string> = {
		Heracles: '#f87171',
		Wukong: '#fbbf24',
		Ixbalam: '#34d399',
		Setna: '#60a5fa'
	};

	const rankBadges: Record<number, string> = {
		1: '1st',
		2: '2nd',
		3: '3rd',
		4: '4th'
	};
	const rankColors: Record<number, string> = {
		1: 'text-yellow-300',
		2: 'text-slate-200',
		3: 'text-orange-300',
		4: 'text-zinc-500'
	};

	const session = useViewer();
	const isAuthLoading = $derived(session.status === 'loading');

	const housesQuery = useQuery(api.students.getPublicHouseStats, () =>
		session.isApproved ? {} : 'skip'
	);

	const categories = $derived(housesQuery.data?.categories || []);
	const houses = $derived(housesQuery.data?.houses || []);

	const radarSize = $derived(Math.round(Math.min(Math.max(viewportWidth * 0.24, 280), 920)));

	const globalMax = $derived(
		housesQuery.data?.houses
			? Math.max(
					...housesQuery.data.houses.flatMap((h) =>
						Object.values(h.pointsByCategory).map((value) => Number(value))
					)
				)
			: 100
	);
	const globalMin = $derived(
		housesQuery.data?.houses
			? Math.min(
					...housesQuery.data.houses.flatMap((h) =>
						Object.values(h.pointsByCategory).map((value) => Number(value))
					)
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
			if (!allValues.includes(val)) {
				allValues.push(val);
			}
		}
		if (allValues.length < 2) {
			allValues.length = 0;
			allValues.push(radarMinValue);
			allValues.push(radarMaxValue);
		}
		return allValues;
	});
	function getRadarData(houseData: { house?: string; pointsByCategory?: Record<string, number> }) {
		if (!houseData?.pointsByCategory) return [];

		const data: Record<string, number> = {};
		for (const [key, value] of Object.entries(houseData.pointsByCategory)) {
			data[key] = Number(value);
		}

		return [{ label: houseData.house || 'Unknown', ...data }];
	}

	function toColumnMajor<T>(items: T[]): T[] {
		if (items.length <= 2) return items;
		const rows = Math.ceil(items.length / 2);
		const result: T[] = [];
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < 2; c++) {
				const idx = c * rows + r;
				if (idx < items.length) result.push(items[idx]);
			}
		}
		return result;
	}
</script>

<svelte:head>
	<title>HWIS House Points</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cormorant+Garamond:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<section
	class="house-display-page relative flex h-screen flex-col overflow-hidden {theme.section} {theme.font} p-[clamp(0.75rem,1.5vw,100rem)]"
>
	<!-- Hand-drawn filters — per-house seeds so wobble is not cloned -->
	<svg style="position: absolute; width: 0; height: 0;" aria-hidden="true">
		<defs>
			<filter id="hand-drawn-heracles">
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="1"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
			<filter id="hand-drawn-wukong">
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="7"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
			<filter id="hand-drawn-ixbalam">
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="13"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
			<filter id="hand-drawn-setna">
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.04"
					numOctaves="3"
					seed="21"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="3"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
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
	{#if isAuthLoading || housesQuery.isLoading}
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
	{:else if housesQuery.error}
		<div class="flex h-full flex-col items-center justify-center text-center text-white">
			<CircleAlert class="mb-4 size-16 text-red-300" aria-label="Alert" />
			<p class="text-[clamp(1.5rem,3vw,100rem)] font-bold">Failed to load house statistics</p>
		</div>
	{:else if housesQuery.data}
		<div class="relative z-10 flex h-full min-h-0 w-full max-w-full min-w-0 flex-col">
			<div class="relative z-10 grid min-h-0 min-w-0 flex-1 grid-cols-4 grid-rows-1 gap-3 sm:gap-4">
				{#each houses as houseData (houseData.house)}
					{@const house = houseData.house as House}
					{@const Logo = houseLogos[house]}
					{@const hc = houseTheme[house]}
					{@const isFirst = houseData.rank === 1}
					<article
						class="house-{house} relative z-10 grid min-h-0 max-w-full min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_clamp(6rem,8vw,100rem)_clamp(6rem,10vw,100rem)] overflow-hidden border {isFirst
							? `organic-border ${firstPlaceCard[house]} backdrop-blur-2xl`
							: theme.card}"
					>
						<div
							class="grid min-h-0 min-w-0 grid-cols-[auto_1fr] items-center gap-3 border-b px-[clamp(0.65rem,1.1vw,100rem)] py-[clamp(0.55rem,0.85vw,100rem)] {isFirst
								? firstPlaceHeader[house]
								: 'border-indigo-200/15'}"
						>
							<div class="flex shrink-0 flex-col items-center gap-1">
								<div
									class="crest-pulse flex size-[clamp(4rem,6.5vw,100rem)] items-center justify-center rounded-full p-3 ring-2 {hc.accentBg} {hc.accentBorder} {hc.accentText}"
								>
									<Logo />
								</div>
							</div>
							<div class="flex h-full min-w-0 flex-col items-end justify-between">
								<div
									class="mx-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-[clamp(1.1rem,1.4vw,100rem)] font-black {rankColors[
										houseData.rank
									] || rankColors[4]}"
								>
									{#if houseData.rank === 1}
										<Trophy class="size-[clamp(1.2rem,1.6vw,100rem)]" aria-label="Trophy" />
									{:else}
										<Medal class="size-[clamp(1.2rem,1.6vw,100rem)]" aria-label="Medal" />
									{/if}
									{rankBadges[houseData.rank] || `${houseData.rank}th`}
								</div>
								<p
									class="text-[clamp(2.8rem,5vw,100rem)] leading-none font-black {theme.pointsGlow} pr-4"
								>
									{#key houseData.totalPoints}
										<span class="animate-house-pop">{houseData.totalPoints}</span>
									{/key}
								</p>
							</div>
						</div>

						<div
							class="flex min-h-0 min-w-0 items-center justify-center border-b px-4 py-2 {theme.divider}"
						>
							{#if categories.length > 0}
								<div class="origin-center scale-100">
									<RadarChart
										data={getRadarData(houseData)}
										features={categories}
										ticks={radarTicks}
										minValue={radarMinValue}
										maxValue={radarMaxValue}
										colors={[houseRadarColors[house]]}
										size={radarSize}
									/>
								</div>
							{/if}
						</div>

						<div
							class="min-h-0 overflow-hidden border-b px-[clamp(0.75rem,1vw,100rem)] py-[clamp(0.6rem,1vw,100rem)] pb-4 {theme.divider}"
						>
							<h3
								class="mb-1 flex items-center gap-2 text-[clamp(1rem,1.2vw,100rem)] font-black {theme.panelTitle} {theme.titleFont}"
							>
								<Star class="size-[clamp(1.2rem,1.5vw,100rem)] text-yellow-400" aria-label="Star" />
								Top Contributors
							</h3>
							{#if houseData.topContributors && houseData.topContributors.length > 0}
								<ul
									class="relative grid grid-cols-2 gap-x-3 gap-y-1.5 pr-0 pl-0 text-[clamp(0.6rem,1vw,100rem)] leading-tight"
								>
									{#each toColumnMajor(houseData.topContributors) as contributor (contributor.studentId)}
										<li class="animate-list-item flex min-w-0 items-center gap-2">
											<span class="shrink-0 font-black {hc.accentText}">
												{#key contributor.totalPoints}
													<span class="animate-scale-in">+{contributor.totalPoints}</span>
												{/key}
											</span>
											<span class="min-w-0 truncate font-semibold">{contributor.englishName}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-[clamp(1rem,1.3vw,100rem)] font-medium text-indigo-200/60">
									No contributions yet
								</p>
							{/if}
						</div>

						<div class="min-h-0 overflow-hidden px-[clamp(0.75rem,1vw,100rem)] py-3 pb-5">
							<h3
								class="mb-1 flex items-center gap-2 text-[clamp(1rem,1.2vw,100rem)] font-black {theme.panelTitle} {theme.titleFont}"
							>
								<TrendingUp
									class="size-[clamp(1.2rem,1.5vw,100rem)] text-emerald-400"
									aria-label="Trending"
								/>
								Growth Opportunities
							</h3>
							{#if houseData.growthOpportunities.length > 0}
								<ul
									class="relative grid grid-cols-2 gap-x-3 gap-y-1.5 pr-0 pl-0 text-[clamp(0.6rem,1vw,100rem)] leading-tight"
								>
									{#each toColumnMajor(houseData.growthOpportunities) as student (student.studentId)}
										<li class="animate-list-item flex min-w-0 items-center gap-2">
											<span class="shrink-0 font-bold text-red-400">
												{#key student.pointsLost}
													<span class="animate-scale-in">{student.pointsLost}</span>
												{/key}
											</span>
											<span class="min-w-0 truncate font-semibold">{student.englishName}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-[clamp(1rem,1.2vw,100rem)] font-medium text-indigo-200/60">
									No points to recover
								</p>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</div>
	{/if}
</section>

<style>
	@keyframes scaleIn {
		0% {
			transform: scale(0.5);
			opacity: 0;
		}
		50% {
			transform: scale(1.2);
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

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

	.animate-scale-in {
		display: inline-block;
		animation: scaleIn 2s ease-out;
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

	.animate-list-item {
		animation: slideInUp 1s ease-out;
		animation-fill-mode: both;
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
		filter: url(#hand-drawn-heracles);
		pointer-events: none;
		z-index: 2;
	}
	.house-Heracles.organic-border {
		border-radius: 24px 14px 22px 16px / 16px 22px 14px 24px;
	}
	.house-Heracles.organic-border::before {
		filter: url(#hand-drawn-heracles);
	}
	.house-Wukong.organic-border {
		border-radius: 18px 24px 14px 20px / 20px 14px 24px 18px;
	}
	.house-Wukong.organic-border::before {
		filter: url(#hand-drawn-wukong);
	}
	.house-Ixbalam.organic-border {
		border-radius: 20px 18px 26px 12px / 12px 26px 18px 20px;
	}
	.house-Ixbalam.organic-border::before {
		filter: url(#hand-drawn-ixbalam);
	}
	.house-Setna.organic-border {
		border-radius: 16px 20px 18px 24px / 24px 18px 20px 16px;
	}
	.house-Setna.organic-border::before {
		filter: url(#hand-drawn-setna);
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

	.crest-pulse {
		animation: crestPulse 4s ease-in-out infinite;
	}
	@keyframes crestPulse {
		0%,
		100% {
			transform: scale(1);
			box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.14);
		}
		50% {
			transform: scale(1.05);
			box-shadow: 0 0 0 14px rgba(255, 255, 255, 0);
		}
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
