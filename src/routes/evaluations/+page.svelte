<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Plus, ArrowUp, ArrowDown, ListChevronsUpDown, ListChevronsDownUp } from '@lucide/svelte';
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

	// Update filter summary when filter changes
	$effect(() => {
		filterSummary.updateSummary(!!studentFilter);
	});

	// Cleanup on destroy
	onDestroy(() => {
		filterSummary.cleanup();
	});

	// Fetch all evaluations
	const evaluationsQuery = useQuery(api.evaluations.listRecent, () => ({
		studentFilter: studentFilter || undefined
	}));

	// Sorted evaluations
	const sortedEvaluations = $derived.by(() => {
		if (!evaluationsQuery.data) return [];
		// Handle both array and object return types from listRecent
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
		return sortEvaluations(evals, displayState.sortAscending);
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
	{#if evaluationsQuery.isLoading}
		<EvaluationsLoadingState message="Loading history..." />
	{:else if evaluationsQuery.error}
		<EvaluationsErrorState message={evaluationsQuery.error.message} />
	{:else if sortedEvaluations.length === 0}
		<EvaluationsEmptyState message="No evaluations found. Start by awarding some points!">
			<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
		</EvaluationsEmptyState>
	{:else}
		<EvaluationsTimeline
			evaluations={sortedEvaluations}
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
		>
			{#snippet children()}
				<!-- Filters Section -->
				<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
					<Button onclick={() => void goto('/evaluations/new')}>
						<Plus class="size-4" />
						New
					</Button>

					<FilterInput
						bind:value={studentFilter}
						placeholder="Filter by student(s)…"
						ariaLabel="Filter by student"
						class="w-full sm:w-64"
					/>
				</div>
			{/snippet}
		</EvaluationsTimeline>

		<FilterSummaryToast
			show={filterSummary.showSummary}
			count={sortedEvaluations.length}
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

<DeleteEvaluationDialog bind:open={deleteDialogOpen} evaluation={selectedEvaluation} />
