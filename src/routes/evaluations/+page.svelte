<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import {
		Calendar,
		User,
		Plus,
		ArrowLeft,
		Award,
		CircleMinus,
		ArrowUp,
		ArrowDown,
		Eye
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	let { data }: { data: { testRole?: string } } = $props();

	const isTestMode = $derived(!!data.testRole);

	// Fetch user to check role (for both test mode and real mode)
	const user = useQuery(api.users.viewer, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	const isAdmin = $derived.by(() => {
		// Check test mode first
		if (data.testRole === 'admin' || data.testRole === 'super') {
			return true;
		}
		// Check real mode from database
		if (!user.isLoading && user.data?.role) {
			return user.data.role === 'admin' || user.data.role === 'super';
		}
		return false;
	});

	const evaluations = useQuery(api.evaluations.listRecent, () => ({
		limit: 50,
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	// Sort state
	let sortAscending = $state(false);
	// Show details state
	let showDetails = $state(false);
	// Track hovered card index
	let hoveredIndex = $state<number | null>(null);

	function formatDate(ts: number) {
		const date = new Date(ts);
		return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
	}

	function toggleSort() {
		sortAscending = !sortAscending;
	}

	function toggleDetails() {
		showDetails = !showDetails;
	}

	function getCardBorderColor(value: number) {
		if (value >= 0) return 'border-emerald-200 dark:border-emerald-800';
		return 'border-red-200 dark:border-red-800';
	}

	function getPointsBadgeClasses(value: number) {
		if (value >= 0)
			return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400';
		return 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400';
	}

	// Sorted evaluations
	const sortedEvaluations = $derived(() => {
		const evals = evaluations.data || [];
		if (sortAscending) {
			return [...evals].sort((a, b) => a.timestamp - b.timestamp);
		}
		return [...evals].sort((a, b) => b.timestamp - a.timestamp);
	});
</script>

<div class="mx-auto max-w-6xl p-8">
	<header class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			{#if isAdmin}
				<Button variant="outline" onclick={() => void goto('/admin')}>
					<ArrowLeft class="size-4" />
					<span class="ml-2 hidden sm:inline">Back to Admin</span>
				</Button>
			{/if}
			<h1 class="text-foreground text-lg font-semibold sm:text-2xl">Evaluation History</h1>
		</div>
		<div class="flex items-center gap-2">
			<ThemeToggle />
			<Button onclick={() => void goto('/evaluations/new')}>
				<Plus class="size-4" />
				New
			</Button>
		</div>
	</header>

	<!-- Timeline Controls -->
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-xl font-semibold">Recent</h2>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={toggleSort}
				title={sortAscending ? 'Newest First' : 'Oldest First'}
			>
				{#if sortAscending}
					<ArrowDown class="size-4" />
				{:else}
					<ArrowUp class="size-4" />
				{/if}
				<span class="ml-2 hidden sm:inline">{sortAscending ? 'Oldest First' : 'Newest First'}</span>
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={toggleDetails}
				title={showDetails ? 'Hide Details' : 'Show Details'}
			>
				<Eye class="size-4" />
			</Button>
		</div>
	</div>

	{#if evaluations.isLoading}
		<div class="text-muted-foreground py-16 text-center">Loading history...</div>
	{:else if evaluations.data?.length === 0}
		<Card.Root class="p-8 text-center">
			<Card.Content class="pt-6">
				<p class="text-muted-foreground mb-6">
					No evaluations found. Start by awarding some points!
				</p>
				<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<!-- Timeline -->
		<div class="bg-background relative">
			<!-- Central Line -->
			<div
				class="border-border absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 border-l"
			></div>

			<div class="relative flex min-h-25 flex-col gap-6 py-4">
				{#each sortedEvaluations() as eval_, index (eval_._id)}
					<!-- Timeline Item -->
					{#if index % 2 === 0}
						<!-- Even item: Content on RIGHT, Node center, Date on LEFT -->
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
							<!-- Date on Left -->
							<div
								class="text-muted-foreground flex flex-col items-end justify-center self-center pr-2 text-right sm:w-full sm:min-w-38"
							>
								<div class="flex items-center gap-1 text-xs">
									<Calendar class="size-3" />
									<span>{formatDate(eval_.timestamp)}</span>
								</div>
							</div>

							<!-- Node Center (small dot) -->
							<div class="z-10 flex items-center justify-center">
								<div
									class="border-background size-3 rounded-full border-2 {eval_.value >= 0
										? 'bg-emerald-500'
										: 'bg-red-500'}"
								></div>
							</div>

							<!-- Content on Right -->
							<div class="flex justify-start self-center pl-2 sm:w-full">
								<a
									href="/evaluations/student/{eval_.studentId}"
									class="bg-card relative block max-w-40 rounded-lg border p-3 no-underline shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										eval_.value
									)}"
									onmouseenter={() => (hoveredIndex = index)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<div class="mb-1 flex items-center gap-2 text-sm">
										<User class="size-3" />
										<span class="font-semibold">{eval_.englishName}</span>
										<span class="bg-muted rounded-full px-2 py-0.5 text-xs">G{eval_.grade}</span>
									</div>
									<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
										<span class="text-muted-foreground text-xs">{eval_.category}</span>
										{#if eval_.subCategory}
											<span class="text-muted-foreground hidden text-xs sm:inline">›</span>
											<span class="text-muted-foreground text-xs">{eval_.subCategory}</span>
										{/if}
									</div>
									<div
										class="overflow-hidden transition-all duration-300 {showDetails ||
										hoveredIndex === index
											? 'max-h-20 opacity-100'
											: 'max-h-0 opacity-0'}"
									>
										{#if eval_.details}
											<p class="text-muted-foreground text-xs">{eval_.details}</p>
										{/if}
									</div>
									<div
										class="absolute -top-2 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
											eval_.value
										)}"
									>
										{#if eval_.value >= 0}
											<Award class="size-4" />
										{:else}
											<CircleMinus class="size-4" />
										{/if}
										<span>{eval_.value > 0 ? '+' : ''}{eval_.value}</span>
									</div>
								</a>
							</div>
						</div>
					{:else}
						<!-- Odd item: Content on LEFT, Node center, Date on RIGHT -->
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
							<!-- Content on Left -->
							<div class="flex justify-end self-center pr-2 sm:w-full">
								<a
									href="/evaluations/student/{eval_.studentId}"
									class="bg-card relative block max-w-40 rounded-lg border p-3 no-underline shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										eval_.value
									)}"
									onmouseenter={() => (hoveredIndex = index)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<div class="mb-1 flex items-center gap-2 text-sm">
										<User class="size-3" />
										<span class="font-semibold">{eval_.englishName}</span>
										<span class="bg-muted rounded-full px-2 py-0.5 text-xs">G{eval_.grade}</span>
									</div>
									<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
										<span class="text-muted-foreground text-xs">{eval_.category}</span>
										{#if eval_.subCategory}
											<span class="text-muted-foreground hidden text-xs sm:inline">›</span>
											<span class="text-muted-foreground text-xs">{eval_.subCategory}</span>
										{/if}
									</div>
									<div
										class="overflow-hidden transition-all duration-300 {showDetails ||
										hoveredIndex === index
											? 'max-h-20 opacity-100'
											: 'max-h-0 opacity-0'}"
									>
										{#if eval_.details}
											<p class="text-muted-foreground text-xs">{eval_.details}</p>
										{/if}
									</div>
									<div
										class="absolute -top-2 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
											eval_.value
										)}"
									>
										{#if eval_.value >= 0}
											<Award class="size-4" />
										{:else}
											<CircleMinus class="size-4" />
										{/if}
										<span>{eval_.value > 0 ? '+' : ''}{eval_.value}</span>
									</div>
								</a>
							</div>

							<!-- Node Center (small dot) -->
							<div class="z-10 flex items-center justify-center">
								<div
									class="border-background size-3 rounded-full border-2 {eval_.value >= 0
										? 'bg-emerald-500'
										: 'bg-red-500'}"
								></div>
							</div>

							<!-- Date on Right -->
							<div
								class="text-muted-foreground flex flex-col items-start justify-center self-center pl-2 text-left sm:w-full sm:min-w-38"
							>
								<div class="flex items-center gap-1 text-xs">
									<Calendar class="size-3" />
									<span>{formatDate(eval_.timestamp)}</span>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>
