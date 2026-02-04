<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Search, User } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

	// Fetch all evaluations
	const evaluationsQuery = useQuery(api.evaluations.listAllEvaluations, () => ({
		limit: 100
	}));

	// Filter states
	let studentFilter = $state('');
	let teacherFilter = $state('');

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

	// Get unique teacher names for dropdown
	const uniqueTeachers = $derived([...new Set(evaluations.map((e) => e.teacherName))].sort());

	// Filtered evaluations
	const filteredEvaluations = $derived.by(() => {
		return evaluations.filter((e: EvaluationEntry) => {
			const matchesStudent =
				!studentFilter ||
				(e.englishName?.toLowerCase() ?? '').includes(studentFilter.toLowerCase());
			const matchesTeacher = !teacherFilter || e.teacherName === teacherFilter;
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

	function clearFilters() {
		studentFilter = '';
		teacherFilter = '';
	}

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
		<!-- Filters Section -->
		<div class="bg-card mb-6 p-4 border rounded-lg">
			<div class="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4">
				<div class="flex sm:flex-row flex-col sm:items-center gap-4">
					<!-- Student Name Filter -->
					<div class="relative">
						<Search class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
						<Input
							type="text"
							placeholder="Search by student name..."
							bind:value={studentFilter}
							class="pl-9 w-full sm:w-64"
						/>
					</div>

					<!-- Teacher Name Filter -->
					<div class="relative">
						<User class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
						<select
							bind:value={teacherFilter}
							class="bg-background shadow-sm px-3 pr-8 pl-9 border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring w-full sm:w-48 h-10 transition-colors"
						>
							<option value="">All Teachers</option>
							{#each uniqueTeachers as teacher (teacher)}
								<option value={teacher}>{teacher}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Clear Filters Button -->
				{#if studentFilter || teacherFilter}
					<Button variant="outline" size="sm" onclick={clearFilters}>Clear Filters</Button>
				{/if}
			</div>

			<!-- Filter Summary -->
			{#if studentFilter || teacherFilter}
				<p class="mt-3 text-muted-foreground text-sm">
					Showing {filteredEvaluations.length} of {evaluations.length} evaluations
					{#if studentFilter && teacherFilter}
						matching student "{studentFilter}" and teacher "{teacherFilter}"
					{:else if studentFilter}
						matching student "{studentFilter}"
					{:else if teacherFilter}
						for teacher "{teacherFilter}"
					{/if}
				</p>
			{/if}
		</div>

		<EvaluationsTimeline
			evaluations={sortedEvaluations}
			title="All Evaluations"
			showStudentName={true}
			showTeacherFilter={false}
			showLegend={false}
			showTeacherName={true}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentId}`}
			onCardClick={handleCardClick}
			bind:sortAscending
			bind:showDetails
		/>
	{/if}
</div>
