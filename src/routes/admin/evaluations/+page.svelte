<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';
	import {
		transformEvaluation,
		sortEvaluations,
		createFilterSummaryState,
		createEvaluationDisplayState
	} from '$lib/evaluations';
	import {
		FilterInput,
		FilterSummaryToast,
		EvaluationsLoadingState,
		EvaluationsErrorState,
		EvaluationsEmptyState
	} from '$lib/evaluations/components';
	import { onDestroy } from 'svelte';

	// Filter states
	let studentFilter = $state('');
	let teacherFilter = $state('');

	// Show unenrolled toggle - default to OFF, no persistence
	let showUnenrolled = $state(false);

	function toggleShowUnenrolled(): void {
		showUnenrolled = !showUnenrolled;
	}

	// Use shared state management
	const filterSummary = createFilterSummaryState();
	const displayState = createEvaluationDisplayState();

	// Update filter summary when filters change
	$effect(() => {
		filterSummary.updateSummary(!!(studentFilter || teacherFilter));
	});

	// Cleanup on destroy
	onDestroy(() => {
		filterSummary.cleanup();
	});

	// Query args - showUnenrolled defaults to false
	const evaluationsQueryArgs = $derived({
		studentFilter: studentFilter || undefined,
		teacherFilter: teacherFilter || undefined,
		showUnenrolled
	});

	// The evaluations query
	const evaluationsQuery = useQuery(api.evaluations.listAllEvaluations, () => evaluationsQueryArgs);

	// Sorted evaluations - directly from query data (reactive)
	const sortedEvaluations = $derived.by(() => {
		if (!evaluationsQuery.data) return [];
		const evals = evaluationsQuery.data.map(transformEvaluation);
		return sortEvaluations(evals, displayState.sortAscending);
	});

	function handleCardClick(_entry: EvaluationEntry): void {
		void _entry;
	}
</script>

<div class="mx-auto p-8 max-w-6xl">
	{#if evaluationsQuery.isLoading}
		<EvaluationsLoadingState />
	{:else if evaluationsQuery.error}
		<EvaluationsErrorState message={evaluationsQuery.error.message} />
	{:else if sortedEvaluations.length === 0}
		<EvaluationsEmptyState />
	{:else}
		<EvaluationsTimeline
			evaluations={sortedEvaluations}
			showStudentName={true}
			showTeacherFilter={false}
			showTeacherName={true}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentIdCode}`}
			onCardClick={handleCardClick}
			bind:sortAscending={displayState.sortAscending}
			bind:showDetails={displayState.showDetails}
			{showUnenrolled}
			onToggleShowUnenrolled={toggleShowUnenrolled}
		>
			{#snippet children()}
				<!-- Filters Section -->
				<div class="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4">
					<div class="flex sm:flex-row flex-col gap-4">
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
					</div>
				</div>
			{/snippet}
		</EvaluationsTimeline>

		<FilterSummaryToast show={filterSummary.showSummary} count={sortedEvaluations.length} />
	{/if}
</div>
