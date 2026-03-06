<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Trophy, TrendingUp, Users, Star, CircleAlert } from '@lucide/svelte';
	import RadarChart from '$lib/components/RadarChart.svelte';

	// Import house logos
	import LogoHeracles from '$lib/components/LogoHeracles.svelte';
	import LogoWukong from '$lib/components/LogoWukong.svelte';
	import LogoIxbalam from '$lib/components/LogoIxbalam.svelte';
	import LogoSetna from '$lib/components/LogoSetna.svelte';

	type House = 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna';

	// House colors for theming
	const houseColors: Record<
		House,
		{ bg: string; border: string; text: string; lightBg: string; accent: string }
	> = {
		Heracles: {
			bg: 'bg-red-600',
			border: 'border-red-600',
			text: 'text-red-700',
			lightBg: 'bg-red-50',
			accent: 'text-red-500'
		},
		Wukong: {
			bg: 'bg-amber-600',
			border: 'border-amber-600',
			text: 'text-amber-700',
			lightBg: 'bg-amber-50',
			accent: 'text-amber-500'
		},
		Ixbalam: {
			bg: 'bg-emerald-600',
			border: 'border-emerald-600',
			text: 'text-emerald-700',
			lightBg: 'bg-emerald-50',
			accent: 'text-emerald-500'
		},
		Setna: {
			bg: 'bg-blue-600',
			border: 'border-blue-600',
			text: 'text-blue-700',
			lightBg: 'bg-blue-50',
			accent: 'text-blue-500'
		}
	};

	// House logos mapping
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

	// Rank badges
	const rankBadges: Record<number, string> = {
		1: '🥇',
		2: '🥈',
		3: '🥉'
	};

	const housesQuery = useQuery(api.students.getHouseStats, () => ({}));

	// Get max points for spider chart normalization
	const globalMax = $derived(
		housesQuery.data?.houses
			? Math.max(
					...housesQuery.data.houses.flatMap((h) =>
						Object.values(h.pointsByCategory).map((v) => Number(v))
					)
				)
			: 100
	);

	// Get min points (could be negative) for spider chart
	const globalMin = $derived(
		housesQuery.data?.houses
			? Math.min(
					...housesQuery.data.houses.flatMap((h) =>
						Object.values(h.pointsByCategory).map((v) => Number(v))
					)
				)
			: 0
	);

	// Get categories from the data
	const categories = $derived(housesQuery.data?.categories || []);

	const radarMinValue = $derived(Math.min(globalMin, 0));
	const radarMaxValue = $derived(Math.max(globalMax, 0));
	const radarTicks = $derived.by(() => {
		if (radarMaxValue === radarMinValue) return [radarMinValue];

		const step = (radarMaxValue - radarMinValue) / 4;
		return Array.from({ length: 5 }, (_, index) => Math.round(radarMinValue + step * index));
	});

	// Helper function to convert pointsByCategory to RadarChart format
	function getRadarData(houseData: { house?: string; pointsByCategory?: Record<string, number> }) {
		if (!houseData?.pointsByCategory) return [];
		const data: Record<string, number> = {};
		for (const [key, value] of Object.entries(houseData.pointsByCategory)) {
			data[key] = Number(value); // Preserve original value (can be negative)
		}
		return [{ label: houseData.house || 'Unknown', ...data }];
	}

	// Get houses sorted by rank
	const sortedHouses = $derived(
		housesQuery.data?.houses.slice().sort((a, b) => a.rank - b.rank) || []
	);
</script>

<svelte:head>
	<title>Houses Competition - HWIS Point System</title>
</svelte:head>

<div class="mx-auto px-4 py-8 container">
	<!-- Header -->
	<header class="mb-8 text-center">
		<h1 class="mb-2 font-bold text-gray-900 text-4xl">Houses Competition</h1>
		<p class="text-gray-600">Track our houses' progress and celebrate achievements!</p>
	</header>

	{#if housesQuery.isLoading}
		<div class="flex justify-center items-center py-20">
			<div class="border-gray-900 border-b-2 rounded-full w-12 h-12 animate-spin"></div>
		</div>
	{:else if housesQuery.error}
		<div class="py-20 text-center">
			<CircleAlert class="mx-auto mb-4 w-12 h-12 text-red-500" />
			<p class="text-red-600">Failed to load house statistics</p>
		</div>
	{:else if housesQuery.data}
		<!-- Overall Ranking Bar -->
		<div class="bg-white shadow-md mb-8 p-6 rounded-lg">
			<h2 class="flex items-center gap-2 mb-4 font-semibold text-xl">
				<Trophy class="w-5 h-5 text-yellow-500" />
				Overall Ranking
			</h2>
			<div class="flex flex-wrap justify-center items-center gap-4">
				{#each housesQuery.data.ranking as house, index (house)}
					{@const stats = housesQuery.data.houses.find((h) => h.house === house)}
					{@const rank = index + 1}
					<div
						class="flex items-center gap-2 rounded-full px-4 py-2 {houseColors[house as House]
							.lightBg} {houseColors[house as House].border} border-2"
					>
						<span class="text-2xl">{rankBadges[rank] || ''}</span>
						<span class="font-semibold {houseColors[house as House].text}">{house}</span>
						<span class="text-gray-600">- {stats?.totalPoints || 0} pts</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Houses Grid -->
		<div class="gap-6 grid grid-cols-1 md:grid-cols-2">
			{#each sortedHouses as houseData (houseData.house)}
				{@const house = houseData.house as House}
				{@const Logo = houseLogos[house]}
				{@const colors = houseColors[house]}
				{@const rank = houseData.rank}

				<div class="overflow-hidden rounded-xl border-t-4 bg-white shadow-lg {colors.border}">
					<!-- House Header -->
					<div class="{colors.lightBg} flex items-center justify-between px-6 py-4">
						<div class="flex items-center gap-3">
							<div class="size-12">
								<Logo />
							</div>
							<div>
								<h2 class="text-2xl font-bold {colors.text} flex items-center gap-2">
									{house}
									{#if rank <= 3}
										<span class="text-2xl">{rankBadges[rank]}</span>
									{/if}
								</h2>
								<p class="flex items-center gap-1 text-gray-600 text-sm">
									<Users class="w-4 h-4" />
									{houseData.studentCount} students
								</p>
							</div>
						</div>
						<div class="text-right">
							<p class="text-3xl font-bold {colors.text}">{houseData.totalPoints}</p>
							<p class="text-gray-500 text-xs">total points</p>
						</div>
					</div>

					<!-- House Content -->
					<div class="space-y-6 p-6">
						<!-- Spider/Radar Chart -->
						{#if categories.length > 0}
							<div class="flex justify-center">
									<RadarChart
										data={getRadarData(houseData)}
										features={categories}
										ticks={radarTicks}
										minValue={radarMinValue}
										maxValue={radarMaxValue}
										colors={[houseRadarColors[house]]}
										size={400}
									/>
							</div>
						{/if}

						<!-- Top Contributors -->
						<div>
							<h3 class="flex items-center gap-2 mb-3 font-semibold text-gray-700">
								<Star class="w-4 h-4 text-yellow-500" />
								Top Contributors
							</h3>
							{#if houseData.topContributors.length > 0}
								<ul class="space-y-2">
									{#each houseData.topContributors as contributor, index (contributor.studentId)}
										<li class="flex justify-between items-center">
											<span class="flex items-center gap-2">
												<span class="text-lg">{index + 1}.</span>
												<span class="font-medium">{contributor.englishName}</span>
											</span>
											<span class="{colors.accent} font-semibold"
												>+{contributor.totalPoints} pts</span
											>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-gray-500 text-sm">No contributions yet</p>
							{/if}
						</div>

						<!-- Growth Opportunities -->
						<div>
							<h3 class="flex items-center gap-2 mb-3 font-semibold text-gray-700">
								<TrendingUp class="w-4 h-4 text-green-500" />
								Growth Opportunities
							</h3>
							{#if houseData.growthOpportunities.length > 0}
								<ul class="space-y-2">
									{#each houseData.growthOpportunities as student (student.studentId)}
										<li class="flex justify-between items-center">
											<span class="font-medium">{student.englishName}</span>
											<span class="text-gray-500 text-sm">
												Can recover {student.pointsLost} pts
											</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-gray-500 text-sm">Great job! No points to recover</p>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
