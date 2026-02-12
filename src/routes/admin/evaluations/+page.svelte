<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Funnel, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

	// Helper function for multi-search matching
	function matchesMultiSearch(filter: string, value: string): boolean {
		if (!filter.trim()) return true;
		const searchTerms = filter
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean);
		if (searchTerms.length === 0) return true;
		return searchTerms.some((term) => value.toLowerCase().includes(term));
	}

	// Fetch all evaluations
	const evaluationsQuery = useQuery(api.evaluations.listAllEvaluations, () => ({
		limit: 100
	}));

	// Filter states
	let studentFilter = $state('');
	let teacherFilter = $state('');
	let showSummary = $state(false);
	let summaryTimeout: ReturnType<typeof setTimeout>;

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

	// Transform query data to EvaluationEntry format
	const evaluations = $derived.by(() => {
		if (evaluationsQuery.data) {
			return evaluationsQuery.data.map(
				(e: {
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
				}) => ({
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
				})
			) as EvaluationEntry[];
		}
		return [];
	});

	// Filtered evaluations
	const filteredEvaluations = $derived.by(() => {
		return evaluations.filter((e: EvaluationEntry) => {
			const matchesStudent = matchesMultiSearch(studentFilter, e.englishName ?? '');
			const matchesTeacher = matchesMultiSearch(teacherFilter, e.teacherName ?? '');
			return matchesStudent && matchesTeacher;
		});
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
		// Navigation handled by href
		void _entry;
	}
</script>

<div class="mx-auto p-8 max-w-6xl">
	{#if evaluationsQuery.isLoading}
		<div class="py-16 text-muted-foreground text-center">Loading evaluations...</div>
	{:else if evaluationsQuery.error}
		<div class="bg-card p-8 border border-destructive rounded-lg text-center">
			<p class="text-destructive">Error loading evaluations: {evaluationsQuery.error.message}</p>
		</div>
	{:else if evaluations.length === 0}
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
				<div class="p-4">
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
				</div>

				<!-- Filter Summary -->
				{#if showSummary}
					<div class="bottom-6 left-1/2 z-50 fixed -translate-x-1/2">
						<p class="bg-card/90 shadow-lg backdrop-blur-sm px-4 py-2 rounded-full text-sm">
							Showing {filteredEvaluations.length} of {evaluations.length} evaluations
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
	{/if}
</div>
