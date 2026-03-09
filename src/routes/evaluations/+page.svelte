<script lang="ts">
	/* eslint-disable svelte/no-useless-children-snippet */
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
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
		EvaluationsEmptyState,
		EvaluationsControls,
		EditEvaluationDialog,
		DeleteEvaluationDialog
	} from '$lib/evaluations/components';
	import { onDestroy } from 'svelte';

	const user = useQuery(api.users.viewer, () => ({}));
	const currentUserId = $derived(user.data?._id);

	// Filter state
	let studentFilter = $state('');

	// Use shared state management
	const filterSummary = createFilterSummaryState();
	const displayState = createEvaluationDisplayState();

	// Pagination state
	let cursor = $state<string | null>(null);
	let accumulatedEvaluations = $state<EvaluationEntry[]>([]);

	// Track previous filter value to detect changes
	let prevStudentFilter = '';

	// Update filter summary when filter changes
	$effect(() => {
		filterSummary.updateSummary(!!studentFilter);
	});

	// Reset pagination when filter changes
	$effect(() => {
		if (studentFilter !== prevStudentFilter) {
			cursor = null;
			accumulatedEvaluations = [];
			prevStudentFilter = studentFilter;
		}
	});

	// Toggle sort
	function handleToggleSort() {
		displayState.sortAscending = !displayState.sortAscending;
	}

	// Toggle show details
	function handleToggleShowDetails() {
		displayState.showDetails = !displayState.showDetails;
	}

	// Cleanup on destroy
	onDestroy(() => {
		filterSummary.cleanup();
	});

	// Query args
	const queryArgs = $derived({
		studentFilter: studentFilter || undefined
	});

	// Fetch evaluations
	const evaluationsQuery = useQuery(api.evaluations.listRecent, () => queryArgs);

	// Handle query results
	$effect(() => {
		if (evaluationsQuery.data) {
			// Handle both array and object return types
			const data = Array.isArray(evaluationsQuery.data)
				? evaluationsQuery.data
				: 'evaluations' in evaluationsQuery.data
					? evaluationsQuery.data.evaluations
					: [];

			const evals = data.map((e) =>
				transformEvaluation({
					...e,
					isAdmin: false
				})
			);
			accumulatedEvaluations = sortEvaluations(evals, displayState.sortAscending);
		}
	});

	// Dialog states
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let selectedEvaluation = $state<EvaluationEntry | null>(null);

	function canEditEntry(entry: EvaluationEntry): boolean {
		return entry.teacherId === currentUserId;
	}

	function handleCardClick(_entry: EvaluationEntry): void {
		void _entry;
	}

	function handleLongPress(entry: EvaluationEntry): void {
		selectedEvaluation = entry;
		editDialogOpen = true;
	}

	function handleDeleteRequest(): void {
		deleteDialogOpen = true;
	}
</script>

<div class="mx-auto max-w-6xl p-8 pt-0">
	<!-- Filter Controls - Always at top, outside conditionals -->
	<EvaluationsControls
		sortAscending={displayState.sortAscending}
		showDetails={displayState.showDetails}
		onToggleSort={handleToggleSort}
		onToggleShowDetails={handleToggleShowDetails}
	>
		{#snippet children()}
			<FilterInput
				bind:value={studentFilter}
				placeholder="Filter by student(s)…"
				ariaLabel="Filter by student"
				class="w-full sm:w-64"
			/>
			<Button onclick={() => void goto('/evaluations/new')}>
				<Plus class="size-4" />
				New
			</Button>
		{/snippet}
	</EvaluationsControls>

	{#if evaluationsQuery.isLoading && cursor === null}
		<EvaluationsLoadingState message="Loading history..." />
	{:else if evaluationsQuery.error}
		<EvaluationsErrorState message={evaluationsQuery.error.message} />
	{:else if accumulatedEvaluations.length === 0}
		<EvaluationsEmptyState
			message={studentFilter
				? "No evaluations found for '" +
					studentFilter +
					"'. Try a different filter or clear to see all."
				: 'No evaluations found. Start by awarding some points!'}
		>
			{#if !studentFilter}
				<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
			{/if}
		</EvaluationsEmptyState>
	{:else}
		<EvaluationsTimeline
			evaluations={accumulatedEvaluations}
			showStudentName={true}
			showTeacherName={false}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentIdCode}`}
			onCardClick={handleCardClick}
			bind:sortAscending={displayState.sortAscending}
			bind:showDetails={displayState.showDetails}
			enableLongPress={true}
			onLongPress={handleLongPress}
			{canEditEntry}
			showControls={false}
		/>

		<FilterSummaryToast
			show={filterSummary.showSummary}
			count={accumulatedEvaluations.length}
			filterLabel="student"
			filterValue={studentFilter}
		/>
	{/if}
</div>

<EditEvaluationDialog
	bind:open={editDialogOpen}
	evaluation={selectedEvaluation}
	onClose={() => {
		editDialogOpen = false;
		selectedEvaluation = null;
	}}
	onDelete={handleDeleteRequest}
/>

<DeleteEvaluationDialog
	bind:open={deleteDialogOpen}
	evaluation={selectedEvaluation}
	onDelete={() => {
		selectedEvaluation = null;
	}}
/>
