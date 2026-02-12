<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Funnel, Plus, Loader } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

	// Filter states
	let studentFilter = $state('');
	let teacherFilter = $state('');
	let showSummary = $state(false);
	let summaryTimeout: ReturnType<typeof setTimeout>;

	// Pagination state
	let cursor = $state<string | null | undefined>(undefined);
	let accumulatedEvaluations = $state<EvaluationEntry[]>([]);
	let isLoadingMore = $state(false);
	let nextCursor = $state<string | null | undefined>(undefined); // Track when loadMore is triggered

	$effect(() => {
		if (studentFilter || teacherFilter) {
			showSummary = true;
			clearTimeout(summaryTimeout);
			summaryTimeout = setTimeout(() => {
				showSummary = false;
			}, 3000);
		} else {
			showSummary = false;
		}
	});

	// Reset accumulated evaluations when filter changes
	$effect(() => {
		if (studentFilter !== undefined || teacherFilter !== undefined) {
			cursor = undefined;
			nextCursor = undefined;
			accumulatedEvaluations = [];
		}
	});

	// Fetch all evaluations with pagination support
	const evaluationsQuery = useQuery(api.evaluations.listAllEvaluations, () => ({
		limit: 50,
		cursor: cursor ?? undefined,
		studentFilter: studentFilter || undefined,
		teacherFilter: teacherFilter || undefined
	}));

	// Transform query data to EvaluationEntry format
	function transformEvaluation(e: {
		_id: string;
		value: number;
		category: string;
		subCategory?: string;
		details?: string;
		timestamp: number;
		englishName: string;
		grade: number;
		studentId: string;
		teacherName: string;
	}): EvaluationEntry {
		return {
			_id: e._id,
			value: e.value,
			category: e.category,
			subCategory: e.subCategory,
			details: e.details,
			timestamp: e.timestamp,
			englishName: e.englishName,
			grade: e.grade,
			studentId: e.studentId,
			teacherName: e.teacherName
		};
	}

	// Accumulate pagination results when query updates with nextCursor set (load more triggered)
	$effect(() => {
		if (!evaluationsQuery.data) return;

		// If loadMore was triggered and we got new data, accumulate it
		if (nextCursor !== undefined) {
			// Check if the response has new data (cursor should have changed from nextCursor)
			if (evaluationsQuery.data.evaluations.length > 0) {
				const newEvals = evaluationsQuery.data.evaluations || [];
				const existingIds = new Set(accumulatedEvaluations.map((e) => e._id));
				const uniqueNew = newEvals.filter((e) => !existingIds.has(e._id)).map(transformEvaluation);

				if (uniqueNew.length > 0) {
					accumulatedEvaluations = [...accumulatedEvaluations, ...uniqueNew];
				}
			}

			// Clear loadMore state
			nextCursor = undefined;
			isLoadingMore = false;
		} else if (accumulatedEvaluations.length === 0) {
			// Initial load - just set accumulatedEvaluations from query
			accumulatedEvaluations = evaluationsQuery.data.evaluations.map(transformEvaluation);
		}
	});

	// Display evaluations
	const displayEvaluations = $derived.by(() => {
		if (accumulatedEvaluations.length > 0) {
			return accumulatedEvaluations;
		}
		if (evaluationsQuery.data) {
			return evaluationsQuery.data.evaluations.map(transformEvaluation);
		}
		return [];
	});

	// Filtered evaluations - client-side sort only (filtering is server-side)
	const filteredEvaluations = $derived.by(() => {
		return [...displayEvaluations].sort((a, b) => b.timestamp - a.timestamp);
	});

	// Sort state
	let sortAscending = $state(false);
	// Show details state
	let showDetails = $state(false);

	// Sorted evaluations
	const sortedEvaluations = $derived.by(() => {
		const evals = filteredEvaluations;
		if (sortAscending) {
			return [...evals].sort((a, b) => a.timestamp - b.timestamp);
		}
		return [...evals].sort((a, b) => b.timestamp - a.timestamp);
	});

	function handleCardClick(_entry: EvaluationEntry): void {
		void _entry;
	}

	// Load more evaluations
	async function loadMore(): Promise<void> {
		if (isLoadingMore) return;
		if (!evaluationsQuery.data) return;
		if (evaluationsQuery.data.isDone) return;

		// Trigger a new query with the next cursor
		nextCursor = evaluationsQuery.data.cursor;
		cursor = nextCursor;
		isLoadingMore = true;
	}
</script>

<div class="mx-auto p-8 max-w-6xl">
	{#if evaluationsQuery.isLoading && accumulatedEvaluations.length === 0}
		<div class="flex justify-center items-center gap-2 py-16 text-muted-foreground text-center">
			<Loader class="size-5 animate-spin" />
			Loading evaluations...
		</div>
	{:else if evaluationsQuery.error}
		<div class="bg-card p-8 border border-destructive rounded-lg text-center">
			<p class="text-destructive">Error loading evaluations: {evaluationsQuery.error.message}</p>
		</div>
	{:else if displayEvaluations.length === 0}
		<div class="bg-card p-8 border border-input rounded-lg text-center">
			<p class="mb-6 text-muted-foreground">No evaluations found.</p>
		</div>
	{:else}
		<EvaluationsTimeline
			evaluations={sortedEvaluations}
			showStudentName={true}
			showTeacherFilter={false}
			showTeacherName={true}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentId}`}
			onCardClick={handleCardClick}
			bind:sortAscending
			bind:showDetails
		>
			{#snippet children()}
				<!-- Filters Section -->
				<div class="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4">
					<!-- New Button and Filters -->
					<div class="flex sm:flex-row flex-col sm:items-center gap-4">
						<Button onclick={() => void goto('/evaluations/new')}>
							<Plus class="size-4" />
							New
						</Button>

						<!-- Student Name Filter -->
						<div class="relative">
							<Funnel
								class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2"
							/>
							<Input
								type="text"
								placeholder="Filter by student(s)…"
								bind:value={studentFilter}
								class="pl-9 w-full sm:w-64"
							/>
						</div>

						<!-- Teacher Name Filter -->
						<div class="relative">
							<Funnel
								class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2"
							/>
							<Input
								type="text"
								placeholder="Filter by teacher(s)…"
								bind:value={teacherFilter}
								class="pl-9 w-full sm:w-48"
							/>
						</div>
					</div>
				</div>

				<!-- Filter Summary -->
				{#if showSummary}
					<div class="bottom-6 left-1/2 z-50 fixed -translate-x-1/2">
						<p class="bg-card/90 shadow-lg backdrop-blur-sm px-4 py-2 rounded-full text-sm">
							Showing {filteredEvaluations.length} evaluations
							{#if studentFilter && teacherFilter}
								matching student "{studentFilter}" and teacher "{teacherFilter}"
							{:else if studentFilter}
								matching student "{studentFilter}"
							{:else if teacherFilter}
								for teacher "{teacherFilter}"
							{/if}
						</p>
					</div>
				{/if}
			{/snippet}
		</EvaluationsTimeline>

		{#if evaluationsQuery.data && !evaluationsQuery.data.isDone && displayEvaluations.length > 0}
			<div class="flex justify-center mt-4">
				<Button variant="outline" onclick={loadMore} disabled={isLoadingMore}>
					{#if isLoadingMore}
						<Loader class="mr-2 size-4 animate-spin" />
						Loading...
					{:else}
						More
					{/if}
				</Button>
			</div>
		{/if}
	{/if}
</div>
