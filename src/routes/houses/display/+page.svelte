<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CircleAlert, Medal, Star, TrendingUp, Trophy } from '@lucide/svelte';
	import RadarChart from '$lib/components/RadarChart.svelte';
	import LogoHeracles from '$lib/components/LogoHeracles.svelte';
	import LogoWukong from '$lib/components/LogoWukong.svelte';
	import LogoIxbalam from '$lib/components/LogoIxbalam.svelte';
	import LogoSetna from '$lib/components/LogoSetna.svelte';

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

	const houseLogos: Record<House, typeof LogoHeracles> = {
		Heracles: LogoHeracles,
		Wukong: LogoWukong,
		Ixbalam: LogoIxbalam,
		Setna: LogoSetna
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

	const housesQuery = useQuery(api.students.getHouseStats, () => ({}));

	const categories = $derived(housesQuery.data?.categories || []);
	const houses = $derived(housesQuery.data?.houses || []);

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

		const step = (radarMaxValue - radarMinValue) / 4;
		return Array.from({ length: 5 }, (_, index) => Math.round(radarMinValue + step * index));
	});
	function getRadarData(houseData: { house?: string; pointsByCategory?: Record<string, number> }) {
		if (!houseData?.pointsByCategory) return [];

		const data: Record<string, number> = {};
		for (const [key, value] of Object.entries(houseData.pointsByCategory)) {
			data[key] = Number(value);
		}

		return [{ label: houseData.house || 'Unknown', ...data }];
	}
</script>

<svelte:head>
	<title>HWIS House Points</title>
</svelte:head>

<section
	class="house-display-page min-h-screen overflow-hidden bg-slate-950 p-[clamp(0.75rem,1.5vw,2rem)] text-slate-950"
>
	{#if housesQuery.isLoading}
		<div class="flex h-full items-center justify-center text-white">
			<div
				class="size-16 animate-spin rounded-full border-4 border-white/20 border-b-white"
				role="status"
				aria-label="Loading"
			></div>
		</div>
	{:else if housesQuery.error}
		<div class="flex h-full flex-col items-center justify-center text-center text-white">
			<CircleAlert class="mb-4 size-16 text-red-300" aria-label="Alert" />
			<p class="text-[clamp(1.5rem,3vw,3rem)] font-bold">Failed to load house statistics</p>
		</div>
	{:else if housesQuery.data}
		<div class="grid h-full min-h-0 grid-rows-[auto_1fr] gap-3 sm:gap-4">
			<header class="flex min-h-0 items-center text-white">
				<h1 class="text-[clamp(2.2rem,3.5vw,5.8rem)] leading-none font-black">HWIS House Points</h1>
			</header>

			<div class="grid min-h-0 grid-cols-4 gap-3 sm:gap-4">
				{#each houses as houseData (houseData.house)}
					{@const house = houseData.house as House}
					{@const Logo = houseLogos[house]}
					{@const colors = houseColors[house]}
					<article
						class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_clamp(6rem,10vw,9rem)_clamp(6rem,10vw,9rem)] overflow-hidden rounded-lg border-t-8 bg-white shadow-xl {colors.border} {colors.glow}"
					>
						<div
							class="{colors.lightBg} grid min-h-0 grid-cols-[auto_1fr] items-center gap-3 px-[clamp(0.65rem,1.1vw,1rem)] py-[clamp(0.55rem,0.85vw,0.8rem)]"
						>
							<div class="flex shrink-0 flex-col items-center gap-1">
								<div class="size-[clamp(4rem,6.5vw,8rem)]">
									<Logo />
								</div>
								<h2 class="text-[clamp(1.5rem,2vw,2.5rem)] font-black {colors.text} text-center">
									{house}
								</h2>
							</div>
							<div class="flex h-full min-w-0 flex-col items-end justify-between pr-6">
								<div
									class="mx-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-[clamp(1.1rem,1.4vw,1.5rem)] font-black ring-2 {rankColors[
										houseData.rank
									] || rankColors[4]}"
								>
									{#if houseData.rank === 1}
										<Trophy class="size-[clamp(1.2rem,1.6vw,1.8rem)]" aria-label="Trophy" />
									{:else}
										<Medal class="size-[clamp(1.2rem,1.6vw,1.8rem)]" aria-label="Medal" />
									{/if}
									{rankBadges[houseData.rank] || `${houseData.rank}th`}
								</div>
								<p class="text-[clamp(2.8rem,5vw,6rem)] leading-none font-black {colors.text} pr-4">
									{#key houseData.totalPoints}
										<span class="animate-scale-in">{houseData.totalPoints}</span>
									{/key}
								</p>
							</div>
						</div>

						<div
							class="flex min-h-0 items-center justify-center border-b border-slate-100 px-4 py-2"
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
										size={460}
									/>
								</div>
							{/if}
						</div>

						<div
							class="min-h-0 overflow-hidden border-b border-slate-100 px-[clamp(1.5rem,2vw,2rem)] py-[clamp(0.6rem,1vw,1rem)] pb-4"
						>
							<h3
								class="mb-1 flex items-center gap-2 text-[clamp(1rem,1.2vw,1.2rem)] font-black text-slate-700"
							>
								<Star class="size-[clamp(1.2rem,1.5vw,1.5rem)] text-yellow-500" aria-label="Star" />
								Top Contributors
							</h3>
							{#if houseData.topContributors && houseData.topContributors.length > 0}
								<ul
									class="grid grid-cols-2 gap-x-3 gap-y-1.5 pr-6 pl-2 text-[clamp(0.8rem,1vw,1.1rem)] leading-tight"
								>
									{#each houseData.topContributors as contributor, index (contributor.studentId)}
										<li class="animate-list-item flex min-w-0 items-center justify-between gap-2">
											<span class="min-w-0 truncate font-semibold">
												{index + 1}. {contributor.englishName}
											</span>
											<span class="shrink-0 font-black {colors.accent}">
												{#key contributor.totalPoints}
													<span class="animate-scale-in">+{contributor.totalPoints}</span>
												{/key}
											</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-[clamp(1rem,1.3vw,1.3rem)] font-medium text-slate-500">
									No contributions yet
								</p>
							{/if}
						</div>

						<div class="min-h-0 overflow-hidden px-[clamp(1.5rem,2vw,2rem)] py-3 pb-5">
							<h3
								class="mb-1 flex items-center gap-2 text-[clamp(1rem,1.2vw,1.2rem)] font-black text-slate-700"
							>
								<TrendingUp
									class="size-[clamp(1.2rem,1.5vw,1.5rem)] text-green-600"
									aria-label="Trending"
								/>
								Growth Opportunities
							</h3>
							{#if houseData.growthOpportunities.length > 0}
								<ul
									class="grid grid-cols-2 gap-x-3 gap-y-1.5 pr-6 pl-2 text-[clamp(0.8rem,1vw,1.1rem)] leading-tight"
								>
									{#each houseData.growthOpportunities as student (student.studentId)}
										<li class="animate-list-item flex min-w-0 items-center justify-between gap-2">
											<span class="min-w-0 truncate font-semibold">{student.englishName}</span>
											<span class="shrink-0 text-slate-500">
												{#key student.pointsLost}
													<span class="animate-scale-in">{student.pointsLost}</span>
												{/key}
											</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-[clamp(1rem,1.3vw,1.3rem)] font-medium text-slate-500">
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
</style>
