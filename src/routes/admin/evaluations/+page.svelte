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
		EvaluationStates,
		EvaluationsControls
	} from '$lib/evaluations/components';
	import { Button } from '$lib/components/ui/button';
	import { Loader, EyeClosed, Users } from '@lucide/svelte';
	import { createPaginatedList } from '$lib/stores/paginatedList.svelte';
	import { onDestroy } from 'svelte';

	// Filter states
	let studentFilter = $state('');
	let teacherFilter = $state('');

	// Show unenrolled toggle - default to OFF, no persistence
	let showUnenrolled = $state(false);

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
	const paginated = createPaginatedList<EvaluationEntry>('100px');
	let sentinelElement = $state<HTMLElement | null>(null);

	// Determine if any filters are active
	const hasActiveFilters = $derived(!!(studentFilter?.trim() || teacherFilter?.trim()));

	// Update filter summary when filters change
	$effect(() => {
		filterSummary.updateSummary(!!(studentFilter || teacherFilter));
	});

	// Reset pagination when filters or sort change
	$effect(() => {
		paginated.reset(
			JSON.stringify({
				studentFilter,
				teacherFilter,
				showUnenrolled,
				sortAscending: displayState.sortAscending
			})
		);
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
			cursor: paginated.cursor,
			numItems: 20
		}
	});

	// Non-paginated query for filtered results (fetches all, filters server-side)
	// Skipped when no filters are active — only the paginated query subscribes then.
	const nonPaginatedQuery = useQuery(api.evaluations.listAllEvaluations, () =>
		hasActiveFilters ? nonPaginatedQueryArgs : 'skip'
	);

	// Paginated query for unfiltered results (infinite scroll)
	// Skipped when filters are active — only the non-paginated query subscribes then.
	const paginatedQuery = useQuery(api.evaluations.listAllEvaluationsPaginated, () =>
		hasActiveFilters ? 'skip' : paginatedQueryArgs
	);

	// Handle non-paginated query results (when filters are active)
	$effect(() => {
		if (hasActiveFilters && nonPaginatedQuery.data) {
			const results = nonPaginatedQuery.data.map(transformEvaluation);
			// Sort by timestamp based on sort order
			const sorted = displayState.sortAscending
				? results.sort((a, b) => a.timestamp - b.timestamp)
				: results.sort((a, b) => b.timestamp - a.timestamp);
			paginated.accept({ page: sorted, isDone: true, continueCursor: null });
		}
	});

	// Handle paginated query results - accumulate pages (when no filters)
	$effect(() => {
		if (hasActiveFilters || !Array.isArray(paginatedQuery.data?.page)) return;
		paginated.accept({
			page: paginatedQuery.data.page.map(transformEvaluation),
			isDone: paginatedQuery.data.isDone,
			continueCursor: paginatedQuery.data.continueCursor
		});
	});

	// Intersection observer for infinite scroll — owned by the paginated store
	$effect(() => {
		paginated.bindSentinel(sentinelElement);
	});

	onDestroy(() => {
		paginated.destroy();
		filterSummary.cleanup();
	});

	function handleCardClick(_entry: EvaluationEntry): void {
		void _entry;
	}
</script>

<div class="mx-auto max-w-6xl p-8 pt-0">
	<!-- Filters Section - Sticky for easy access while scrolling -->
	<EvaluationsControls
		sortTestId="admin-evaluations.sort"
		unenrolledTestId="admin-evaluations.unenrolled"
		detailsTestId="admin-evaluations.details"
		sortAscending={displayState.sortAscending}
		{showUnenrolled}
		showDetails={displayState.showDetails}
		onToggleSort={handleToggleSort}
		onToggleShowUnenrolled={handleToggleShowUnenrolled}
		onToggleShowDetails={handleToggleShowDetails}
	>
		<FilterInput
			testId="admin-evaluations.filter-student"
			bind:value={studentFilter}
			placeholder="Filter by student name..."
			ariaLabel="Filter by student name"
			class="w-full sm:w-64"
		/>
		<FilterInput
			testId="admin-evaluations.filter-teacher"
			bind:value={teacherFilter}
			placeholder="Filter by teacher..."
			ariaLabel="Filter by teacher"
			class="w-full sm:w-64"
		/>
		{#snippet extraToggles()}
			<Button
				testId="admin-evaluations.toggle-teacher-name"
				aria-label={showTeacherName ? 'Hide teacher name' : 'Show teacher name'}
				variant="outline"
				size="sm"
				onclick={toggleShowTeacherName}
				title={showTeacherName ? 'Hide teacher name' : 'Show teacher name'}
			>
				{#if showTeacherName}
					<Users class="size-4" />
				{:else}
					<EyeClosed class="size-4" />
				{/if}
			</Button>
		{/snippet}
	</EvaluationsControls>

	{#if (hasActiveFilters ? nonPaginatedQuery.isLoading : paginatedQuery.isLoading) && paginated.cursor === null}
		<EvaluationStates state="loading" testId="admin-evaluations.loading" />
	{:else if hasActiveFilters ? nonPaginatedQuery.error : paginatedQuery.error}
		<EvaluationStates
			state="error"
			testId="admin-evaluations.error"
			errorMessage={(hasActiveFilters ? nonPaginatedQuery.error : paginatedQuery.error)?.message ||
				'An error occurred'}
		/>
	{:else if paginated.items.length === 0}
		<EvaluationStates
			state="empty"
			testId="admin-evaluations.empty"
			message={hasActiveFilters
				? 'No evaluations match your search criteria.'
				: 'No evaluations found.'}
		/>
	{:else}
		<EvaluationsTimeline
			regionTestId="admin-evaluations.timeline"
			cardTestIdPrefix="admin-evaluations.card"
			sortTestId="admin-evaluations.sort"
			detailsTestId="admin-evaluations.details"
			unenrolledTestId="admin-evaluations.unenrolled"
			emptyTestId="admin-evaluations.empty-timeline"
			evaluations={paginated.items}
			showStudentName={true}
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
		<div data-testid="admin-evaluations.sentinel" bind:this={sentinelElement} class="h-4"></div>

		<!-- Loading indicator -->
		{#if paginated.isLoadingMore}
			<div data-testid="admin-evaluations.loading-more" class="flex justify-center py-4">
				<Loader class="text-muted-foreground size-6 animate-spin" />
			</div>
		{/if}

		<!-- End of list indicator -->
		{#if paginated.isDone && paginated.items.length > 0}
			<div
				data-testid="admin-evaluations.no-more"
				class="text-muted-foreground py-4 text-center text-sm"
			>
				No more evaluations
			</div>
		{/if}
	{/if}

	<FilterSummaryToast
		testId="admin-evaluations.filter-summary"
		show={filterSummary.showSummary}
		count={paginated.items.length}
	/>
</div>
