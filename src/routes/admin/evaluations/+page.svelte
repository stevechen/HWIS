<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Search, User } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import { Input } from '$lib/components/ui/input';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

	let { data }: { data: { testRole?: string } } = $props();

	const isTestMode = $derived(!!data.testRole);

	// Fetch user to check role
	const user = useQuery(api.users.viewer, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	// Fetch all evaluations
	const evaluationsQuery = useQuery(api.evaluations.listAllEvaluations, () => ({
		limit: 100,
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
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
	const sortedEvaluations = $derived(() => {
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

	function handleCardClick(entry: EvaluationEntry) {
		// Navigation handled by href
	}
</script>

<div class="mx-auto max-w-6xl p-8">
	<header class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" onclick={() => void goto('/admin')}>
				<ArrowLeft class="size-4" />
				<span class="ml-2 hidden sm:inline">Back to Admin</span>
			</Button>
			<h1 class="text-foreground text-lg font-semibold sm:text-2xl">All Evaluation Review</h1>
		</div>
		<ThemeToggle />
	</header>

	{#if evaluationsQuery.isLoading}
		<div class="text-muted-foreground py-16 text-center">Loading evaluations...</div>
	{:else if evaluationsQuery.error}
		<div class="bg-card border-destructive rounded-lg border p-8 text-center">
			<p class="text-destructive">Error loading evaluations: {evaluationsQuery.error.message}</p>
		</div>
	{:else if evaluations.length === 0}
		<div class="bg-card border-input rounded-lg border p-8 text-center">
			<p class="text-muted-foreground mb-6">No evaluations found.</p>
		</div>
	{:else}
		<!-- Filters Section -->
		<div class="bg-card mb-6 rounded-lg border p-4">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
					<!-- Student Name Filter -->
					<div class="relative">
						<Search
							class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
						/>
						<Input
							type="text"
							placeholder="Search by student name..."
							bind:value={studentFilter}
							class="w-full pl-9 sm:w-64"
						/>
					</div>

					<!-- Teacher Name Filter -->
					<div class="relative">
						<User class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
						<select
							bind:value={teacherFilter}
							class="bg-background border-input focus:ring-ring h-10 w-full rounded-md border px-3 pr-8 pl-9 shadow-sm transition-colors focus:ring-1 focus:outline-none sm:w-48"
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
				<p class="text-muted-foreground mt-3 text-sm">
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
			evaluations={sortedEvaluations()}
			title="All Evaluations"
			showStudentName={true}
			isAdmin={true}
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
