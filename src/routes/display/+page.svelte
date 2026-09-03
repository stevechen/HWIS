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

	onMount(() => {
		if (!browser) return;
		document.documentElement.style.overflow = 'hidden';
		document.body.style.overflow = 'hidden';
		const updateWidth = () => {
			viewportWidth = window.innerWidth;
		};
		updateWidth();
		window.addEventListener('resize', updateWidth);
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

	const houseColors: Record<
		House,
		{
			bg: string;
			border: string;
			text: string;
			lightBg: string;
			accent: string;
			glow: string;
		}
	> = {
		Heracles: {
			bg: 'bg-red-600',
			border: 'border-red-500',
			text: 'text-red-700',
			lightBg: 'bg-red-50',
			accent: 'text-red-600',
			glow: 'shadow-red-200/70'
		},
		Wukong: {
			bg: 'bg-amber-500',
			border: 'border-amber-500',
			text: 'text-amber-700',
			lightBg: 'bg-amber-50',
			accent: 'text-amber-600',
			glow: 'shadow-amber-200/70'
		},
		Ixbalam: {
			bg: 'bg-emerald-600',
			border: 'border-emerald-500',
			text: 'text-emerald-700',
			lightBg: 'bg-emerald-50',
			accent: 'text-emerald-600',
			glow: 'shadow-emerald-200/70'
		},
		Setna: {
			bg: 'bg-blue-600',
			border: 'border-blue-500',
			text: 'text-blue-700',
			lightBg: 'bg-blue-50',
			accent: 'text-blue-600',
			glow: 'shadow-blue-200/70'
		}
	};

	const houseRadarColors: Record<House, string> = {
		Heracles: '#dc2626',
		Wukong: '#d97706',
		Ixbalam: '#059669',
		Setna: '#2563eb'
	};

	const rankBadges: Record<number, string> = {
		1: '1st',
		2: '2nd',
		3: '3rd',
		4: '4th'
	};
	const rankColors: Record<number, string> = {
		1: 'bg-yellow-100 text-yellow-800 ring-yellow-300',
		2: 'bg-slate-100 text-slate-700 ring-slate-300',
		3: 'bg-orange-100 text-orange-800 ring-orange-300',
		4: 'bg-slate-50 text-slate-500 ring-slate-200'
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
</svelte:head>

<section
	class="house-display-page h-screen overflow-hidden bg-slate-950 p-[clamp(0.75rem,1.5vw,100rem)] text-slate-950"
>
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
			<div class="min-h-[3.5rem] text-center">
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
						class="size-2 animate-bounce rounded-full bg-white/70 [animation-delay:0ms] [animation-duration:0.9s]"
					></span>
					<span
						class="size-2 animate-bounce rounded-full bg-white/70 [animation-delay:150ms] [animation-duration:0.9s]"
					></span>
					<span
						class="size-2 animate-bounce rounded-full bg-white/70 [animation-delay:300ms] [animation-duration:0.9s]"
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
		<div class="flex h-full min-h-0 w-full max-w-full min-w-0 flex-col">
			<div class="grid min-h-0 min-w-0 flex-1 grid-cols-4 grid-rows-1 gap-3 sm:gap-4">
				{#each houses as houseData (houseData.house)}
					{@const house = houseData.house as House}
					{@const Logo = houseLogos[house]}
					{@const colors = houseColors[house]}
					<article
						class="house-{house} grid min-h-0 max-w-full min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_clamp(6rem,8vw,100rem)_clamp(6rem,10vw,100rem)] overflow-hidden rounded-lg border-t-8 bg-white shadow-xl {colors.border} {colors.glow}"
					>
						<div
							class="{colors.lightBg} grid min-h-0 min-w-0 grid-cols-[auto_1fr] items-center gap-3 px-[clamp(0.65rem,1.1vw,100rem)] py-[clamp(0.55rem,0.85vw,100rem)]"
						>
							<div class="flex shrink-0 flex-col items-center gap-1">
								<div class="size-[clamp(4rem,6.5vw,100rem)]">
									<Logo />
								</div>
							</div>
							<div class="flex h-full min-w-0 flex-col items-end justify-between">
								<div
									class="mx-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-[clamp(1.1rem,1.4vw,100rem)] font-black ring-2 {rankColors[
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
									class="text-[clamp(2.8rem,5vw,100rem)] leading-none font-black {colors.text} pr-4"
								>
									{#key houseData.totalPoints}
										<span class="animate-scale-in">{houseData.totalPoints}</span>
									{/key}
								</p>
							</div>
						</div>

						<div
							class="flex min-h-0 min-w-0 items-center justify-center border-b border-slate-100 px-4 py-2"
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
							class="min-h-0 overflow-hidden border-b border-slate-100 px-[clamp(0.75rem,1vw,100rem)] py-[clamp(0.6rem,1vw,100rem)] pb-4"
						>
							<h3
								class="mb-1 flex items-center gap-2 text-[clamp(1rem,1.2vw,100rem)] font-black text-slate-700"
							>
								<Star class="size-[clamp(1.2rem,1.5vw,100rem)] text-yellow-500" aria-label="Star" />
								Top Contributors
							</h3>
							{#if houseData.topContributors && houseData.topContributors.length > 0}
								<ul
									class="name-grid relative grid grid-cols-2 gap-x-3 gap-y-1.5 pr-0 pl-0 text-[clamp(0.6rem,1vw,100rem)] leading-tight"
								>
									{#each toColumnMajor(houseData.topContributors) as contributor (contributor.studentId)}
										<li class="animate-list-item flex min-w-0 items-center gap-2">
											<span class="shrink-0 font-black {colors.accent}">
												{#key contributor.totalPoints}
													<span class="animate-scale-in">+{contributor.totalPoints}</span>
												{/key}
											</span>
											<span class="min-w-0 truncate font-semibold">{contributor.englishName}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-[clamp(1rem,1.3vw,100rem)] font-medium text-slate-500">
									No contributions yet
								</p>
							{/if}
						</div>

						<div class="min-h-0 overflow-hidden px-[clamp(0.75rem,1vw,100rem)] py-3 pb-5">
							<h3
								class="mb-1 flex items-center gap-2 text-[clamp(1rem,1.2vw,100rem)] font-black text-slate-700"
							>
								<TrendingUp
									class="size-[clamp(1.2rem,1.5vw,100rem)] text-green-600"
									aria-label="Trending"
								/>
								Growth Opportunities
							</h3>
							{#if houseData.growthOpportunities.length > 0}
								<ul
									class="name-grid relative grid grid-cols-2 gap-x-3 gap-y-1.5 pr-0 pl-0 text-[clamp(0.6rem,1vw,100rem)] leading-tight"
								>
									{#each toColumnMajor(houseData.growthOpportunities) as student (student.studentId)}
										<li class="animate-list-item flex min-w-0 items-center gap-2">
											<span class="shrink-0 text-slate-500">
												{#key student.pointsLost}
													<span class="animate-scale-in">{student.pointsLost}</span>
												{/key}
											</span>
											<span class="min-w-0 truncate font-semibold">{student.englishName}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-[clamp(1rem,1.2vw,100rem)] font-medium text-slate-500">
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

	.animate-list-item {
		animation: slideInUp 1s ease-out;
		animation-fill-mode: both;
	}

	.name-grid::before {
		content: '';
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		width: 1px;
		background: rgb(226 232 240 / 0.6);
		transform: translateX(-50%);
		pointer-events: none;
	}
</style>
