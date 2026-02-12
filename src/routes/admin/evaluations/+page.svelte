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

	// Sort state
	let sortAscending = $state(false);
	// Show details state
	let showDetails = $state(false);

	// Show unenrolled toggle - default to OFF, no persistence
	let showUnenrolled = $state(false);

	// Toggle function - just updates local state (resets on page reload)
	function toggleShowUnenrolled(): void {
		showUnenrolled = !showUnenrolled;
	}

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

	// Query args - showUnenrolled defaults to false
	const evaluationsQueryArgs = $derived({
		studentFilter: studentFilter || undefined,
		teacherFilter: teacherFilter || undefined,
		showUnenrolled
	});

	// The evaluations query
	const evaluationsQuery = useQuery(api.evaluations.listAllEvaluations, () => evaluationsQueryArgs);

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
		studentIdCode: string;
		teacherName: string;
		status?: 'Enrolled' | 'Not Enrolled';
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
			studentIdCode: e.studentIdCode,
			teacherName: e.teacherName,
			status: e.status
		};
	}

	// Sorted evaluations - directly from query data (reactive)
	const sortedEvaluations = $derived.by(() => {
		if (!evaluationsQuery.data) return [];

		const evals = evaluationsQuery.data.map(transformEvaluation);
		return sortAscending
			? [...evals].sort((a, b) => a.timestamp - b.timestamp)
			: [...evals].sort((a, b) => b.timestamp - a.timestamp);
	});

	function handleCardClick(_entry: EvaluationEntry): void {
		void _entry;
	}
</script>

<div class="mx-auto p-8 max-w-6xl">
	{#if evaluationsQuery.isLoading}
		<div class="flex justify-center items-center gap-2 py-16 text-muted-foreground text-center">
			<Loader class="size-5 animate-spin" />
			Loading evaluations...
		</div>
	{:else if evaluationsQuery.error}
		<div class="bg-card p-8 border border-destructive rounded-lg text-center">
			<p class="text-destructive">Error loading evaluations: {evaluationsQuery.error.message}</p>
		</div>
	{:else if sortedEvaluations.length === 0}
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
			cardHref={(entry) => `/evaluations/student/${entry.studentIdCode}`}
			onCardClick={handleCardClick}
			bind:sortAscending
			bind:showDetails
			{showUnenrolled}
			onToggleShowUnenrolled={toggleShowUnenrolled}
		>
			{#snippet children()}
				<!-- Filters Section -->
				<div class="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4">
					<div class="flex sm:flex-row flex-col gap-4">
						<div class="relative w-full sm:w-64">
							<Funnel
								class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2"
							/>
							<Input
								bind:value={studentFilter}
								placeholder="Filter by student name..."
								class="pl-9"
								aria-label="Filter by student name"
							/>
						</div>
						<div class="relative w-full sm:w-64">
							<Funnel
								class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2"
							/>
							<Input
								bind:value={teacherFilter}
								placeholder="Filter by teacher..."
								class="pl-9"
								aria-label="Filter by teacher"
							/>
						</div>
					</div>
					<div class="flex gap-2">
						{#if showSummary}
							<div class="flex items-center gap-2 text-muted-foreground text-sm">
								<span
									>Showing {sortedEvaluations.length} evaluation{sortedEvaluations.length === 1
										? ''
										: 's'}</span
								>
							</div>
						{/if}
					</div>
				</div>
			{/snippet}
		</EvaluationsTimeline>
	{/if}
</div>
