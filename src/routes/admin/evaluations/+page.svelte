<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';
	import {
		transformEvaluation,
		createFilterSummaryState,
		createEvaluationDisplayState
	} from '$lib/evaluations';
	import {
		FilterInput,
		FilterSummaryToast,
		EvaluationsLoadingState,
		EvaluationsErrorState,
		EvaluationsEmptyState,
		EvaluationsControls
	} from '$lib/evaluations/components';
	import { Button } from '$lib/components/ui/button';
	import { Loader, EyeClosed, Drama } from '@lucide/svelte';
	import { onDestroy, onMount, untrack } from 'svelte';

	// Filter states
	let studentFilter = $state('');
	let teacherFilter = $state('');

	// Show unenrolled toggle - default to OFF, no persistence
	let showUnenrolled = $state(false);

	function toggleShowUnenrolled(): void {
		showUnenrolled = !showUnenrolled;
	}

	// Show teacher name toggle - default to OFF, no persistence
	let showTeacherName = $state(false);

	function toggleShowTeacherName(): void {
		showTeacherName = !showTeacherName;
	}

	function handleToggleSort(): void {
		displayState.sortAscending = !displayState.sortAscending;
	}

	function handleToggleShowUnenrolled(): void {
		showUnenrolled = !showUnenrolled;
	}

	function handleToggleShowDetails(): void {
		displayState.showDetails = !displayState.showDetails;
	}

	// Use shared state management
	const filterSummary = createFilterSummaryState();
	const displayState = createEvaluationDisplayState();

	// Pagination state
	let cursor = $state<string | null>(null);
	let accumulatedEvaluations = $state<EvaluationEntry[]>([]);
	let isDone = $state(false);
	let isLoadingMore = $state(false);

	// Track previous filter values to detect changes
	// Use regular variables (not $state) to avoid infinite reactive loops
	let prevStudentFilter = '';
	let prevTeacherFilter = '';
	let prevShowUnenrolled = false;
	let prevSortAscending = false;

	// Determine if any filters are active
	const hasActiveFilters = $derived(!!(studentFilter?.trim() || teacherFilter?.trim()));

	// Update filter summary when filters change
	$effect(() => {
		filterSummary.updateSummary(!!(studentFilter || teacherFilter));
	});

	// Reset pagination when filters or sort change
	$effect(() => {
		const filtersChanged =
			studentFilter !== prevStudentFilter ||
			teacherFilter !== prevTeacherFilter ||
			showUnenrolled !== prevShowUnenrolled ||
			displayState.sortAscending !== prevSortAscending;

		if (filtersChanged) {
			cursor = null;
			accumulatedEvaluations = [];
			isDone = false;
			isLoadingMore = false;

			// Update previous values
			prevStudentFilter = studentFilter;
			prevTeacherFilter = teacherFilter;
			prevShowUnenrolled = showUnenrolled;
			prevSortAscending = displayState.sortAscending;
		}
	});

	// Query args for non-paginated query (used when filters are active)
	const nonPaginatedQueryArgs = $derived({
		studentFilter: studentFilter || undefined,
		teacherFilter: teacherFilter || undefined,
		showUnenrolled
	});

	// Query args for paginated query (used when no filters are active)
	const paginatedQueryArgs = $derived({
		studentFilter: undefined,
		teacherFilter: undefined,
		showUnenrolled,
		sortAscending: displayState.sortAscending,
		paginationOpts: {
			cursor: cursor,
			numItems: 20
		}
	});

	// Non-paginated query for filtered results (fetches all, filters server-side)
	const nonPaginatedQuery = useQuery(
		api.evaluations.listAllEvaluations,
		() => nonPaginatedQueryArgs
	);

	// Paginated query for unfiltered results (infinite scroll)
	const paginatedQuery = useQuery(
		api.evaluations.listAllEvaluationsPaginated,
		() => paginatedQueryArgs
	);

	// Handle non-paginated query results (when filters are active)
	$effect(() => {
		if (hasActiveFilters && nonPaginatedQuery.data) {
			const results = nonPaginatedQuery.data.map(transformEvaluation);
			// Sort by timestamp based on sort order
			const sorted = displayState.sortAscending
				? results.sort((a, b) => a.timestamp - b.timestamp)
				: results.sort((a, b) => b.timestamp - a.timestamp);
			accumulatedEvaluations = sorted;
			isDone = true;
			isLoadingMore = false;
		}
	});

	// Handle paginated query results - accumulate pages (when no filters)
	$effect(() => {
		if (!hasActiveFilters && paginatedQuery.data) {
			const newPage = paginatedQuery.data.page.map(transformEvaluation);

			// Use untrack to read cursor without tracking it (prevents infinite loop)
			const currentCursor = untrack(() => cursor);

			if (currentCursor === null) {
				// First load or filter reset - replace all
				accumulatedEvaluations = newPage;
			} else {
				// Append to existing, avoiding duplicates
				// Use untrack to read accumulatedEvaluations without tracking it
				const existing = untrack(() => accumulatedEvaluations);
				const existingIds = new Set(existing.map((e) => e._id));
				const uniqueNew = newPage.filter((e) => !existingIds.has(e._id));
				accumulatedEvaluations = [...existing, ...uniqueNew];
			}

			isDone = paginatedQuery.data.isDone;
			isLoadingMore = false;
		}
	});

	// Load more function (only used for paginated/infinite scroll mode)
	function loadMore() {
		// Don't load more if filters are active (using non-paginated query)
		if (hasActiveFilters) return;
		if (isDone || isLoadingMore || paginatedQuery.isLoading) return;
		if (!paginatedQuery.data?.continueCursor) return;

		isLoadingMore = true;
		cursor = paginatedQuery.data.continueCursor;
	}

	// Intersection observer for infinite scroll
	let sentinelElement: HTMLElement | null = $state(null);
	let observer: IntersectionObserver | null = null;

	onMount(() => {
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !isDone && !isLoadingMore) {
					loadMore();
				}
			},
			{ rootMargin: '100px' }
		);

		if (sentinelElement) {
			observer.observe(sentinelElement);
		}
	});

	onDestroy(() => {
		observer?.disconnect();
		filterSummary.cleanup();
	});

	// Re-observe when sentinel changes
	$effect(() => {
		if (sentinelElement && observer) {
			observer.disconnect();
			observer.observe(sentinelElement);
		}
	});

	function handleCardClick(_entry: EvaluationEntry): void {
		void _entry;
	}
</script>

<div class="mx-auto max-w-6xl p-8 pt-0">
	<!-- Filters Section - Sticky for easy access while scrolling -->
	<EvaluationsControls
		sortAscending={displayState.sortAscending}
		{showUnenrolled}
		showDetails={displayState.showDetails}
		onToggleSort={handleToggleSort}
		onToggleShowUnenrolled={handleToggleShowUnenrolled}
		onToggleShowDetails={handleToggleShowDetails}
	>
		{#snippet children()}
			<FilterInput
				bind:value={studentFilter}
				placeholder="Filter by student name..."
				ariaLabel="Filter by student name"
				class="w-full sm:w-64"
			/>
			<FilterInput
				bind:value={teacherFilter}
				placeholder="Filter by teacher..."
				ariaLabel="Filter by teacher"
				class="w-full sm:w-64"
			/>
		{/snippet}
		{#snippet extraToggles()}
			<Button
				aria-label={showTeacherName ? 'Hide teacher name' : 'Show teacher name'}
				variant="outline"
				size="sm"
				onclick={toggleShowTeacherName}
				title={showTeacherName ? 'Hide teacher name' : 'Show teacher name'}
			>
				{#if showTeacherName}
					<Drama class="size-4" />
				{:else}
					<EyeClosed class="size-4" />
				{/if}
			</Button>
		{/snippet}
	</EvaluationsControls>

	{#if (hasActiveFilters ? nonPaginatedQuery.isLoading : paginatedQuery.isLoading) && cursor === null}
		<EvaluationsLoadingState />
	{:else if hasActiveFilters ? nonPaginatedQuery.error : paginatedQuery.error}
		<EvaluationsErrorState
			message={(hasActiveFilters ? nonPaginatedQuery.error : paginatedQuery.error)?.message ||
				'An error occurred'}
		/>
	{:else if accumulatedEvaluations.length === 0}
		<EvaluationsEmptyState
			message={hasActiveFilters
				? 'No evaluations match your search criteria.'
				: 'No evaluations found.'}
		/>
	{:else}
		<EvaluationsTimeline
			evaluations={accumulatedEvaluations}
			showStudentName={true}
			showTeacherFilter={false}
			{showTeacherName}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentIdCode}`}
			onCardClick={handleCardClick}
			bind:sortAscending={displayState.sortAscending}
			bind:showDetails={displayState.showDetails}
			{showUnenrolled}
			showControls={false}
		/>

		<!-- Load more sentinel -->
		<div bind:this={sentinelElement} class="h-4"></div>

		<!-- Loading indicator -->
		{#if isLoadingMore}
			<div class="flex justify-center py-4">
				<Loader class="text-muted-foreground size-6 animate-spin" />
			</div>
		{/if}

		<!-- End of list indicator -->
		{#if isDone && accumulatedEvaluations.length > 0}
			<div class="text-muted-foreground py-4 text-center text-sm">No more evaluations</div>
		{/if}
	{/if}

	<FilterSummaryToast show={filterSummary.showSummary} count={accumulatedEvaluations.length} />
</div>
