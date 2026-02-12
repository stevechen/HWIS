<script lang="ts">
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';
	import { headerTitleOverride } from '$lib/stores/header';
	import { onDestroy } from 'svelte';
	import {
		matchesMultiSearch,
		sortEvaluations,
		createFilterSummaryState,
		createEvaluationDisplayState
	} from '$lib/evaluations';
	import {
		FilterInput,
		FilterSummaryToast,
		EvaluationsLoadingState,
		EditEvaluationDialog,
		DeleteEvaluationDialog
	} from '$lib/evaluations/components';

	let { data }: { data: { demo?: string; studentId?: string } } = $props();

	// Demo mode flags
	const isDemo = $derived(!!data.demo);
	const demoRole = $derived(data.demo || 'teacher');

	// Fetch user to check role
	const userQuery = $derived.by(() => {
		if (isDemo) return undefined;
		return useQuery(api.users.viewer, () => ({}));
	});

	// Determine if user is admin
	const isAdmin = $derived.by(() => {
		if (isDemo) {
			return demoRole === 'admin' || demoRole === 'super';
		}
		if (userQuery && !userQuery.isLoading && userQuery.data?.role) {
			return userQuery.data.role === 'admin' || userQuery.data.role === 'super';
		}
		return false;
	});

	// Demo user ID for demo mode (used for ownership check)
	const demoUserId = 'demo-user-id';

	// Current user ID for ownership check
	const currentUserId = $derived(isDemo ? demoUserId : userQuery?.data?._id);

	// Demo student data
	const demoStudent = {
		_id: 'demo-student-id',
		englishName: 'John Smith',
		chineseName: '張約翰',
		studentId: 'SE2024001',
		grade: 10,
		classSection: 'A'
	};

	// Demo evaluation data with teacherId for ownership check
	const demoEvaluations: EvaluationEntry[] = [
		{
			_id: 'eval-1',
			value: 5,
			category: 'Academic',
			subCategory: 'Homework',
			details: 'Excellent homework submission - all problems solved correctly',
			timestamp: Date.now() - 1000 * 60 * 60 * 24,
			teacherName: 'Ms. Johnson',
			teacherId: demoUserId,
			isAdmin: false
		},
		{
			_id: 'eval-2',
			value: -3,
			category: 'Behavior',
			subCategory: 'Late Arrival',
			details: 'Arrived 15 minutes late to class without permission',
			timestamp: Date.now() - 1000 * 60 * 60 * 48,
			teacherName: 'Mr. Smith',
			teacherId: 'other-teacher-id',
			isAdmin: false
		},
		{
			_id: 'eval-3',
			value: 10,
			category: 'Academic',
			subCategory: 'Test Score',
			details: 'Outstanding performance on midterm exam - scored 95%',
			timestamp: Date.now() - 1000 * 60 * 60 * 72,
			teacherName: 'Ms. Johnson',
			teacherId: demoUserId,
			isAdmin: false
		},
		{
			_id: 'admin-eval-1',
			value: 15,
			category: 'Special',
			subCategory: 'Achievement',
			details: 'Student of the Month Award',
			timestamp: Date.now() - 1000 * 60 * 60 * 6,
			teacherName: 'Admin',
			teacherId: 'admin-user-id',
			isAdmin: true
		}
	];

	// Helper to check if studentId is a Convex ID (starts with lowercase letter followed by numbers)
	function isConvexId(id: string): boolean {
		return /^[a-z][\w-]*$/.test(id);
	}

	// Determine if URL studentId is a Convex ID or custom studentId code (reactive)
	const urlStudentId = $derived(data.studentId || '');
	const useConvexIdQuery = $derived(isConvexId(urlStudentId));

	// Real Convex queries - support both Convex ID and custom studentId code
	const studentQuery = $derived.by(() => {
		if (isDemo) return undefined;
		if (useConvexIdQuery) {
			const studentId = urlStudentId as Id<'students'>;
			return useQuery(api.evaluations.getStudent, () => ({
				studentId
			}));
		}
		// Use custom studentId code
		return useQuery(api.evaluations.getStudentByStudentIdCode, () => ({
			studentIdCode: urlStudentId
		}));
	});

	const teacherEvalsQuery = $derived.by(() => {
		if (isDemo) return undefined;
		if (isAdmin) return undefined;
		if (useConvexIdQuery) {
			const studentId = urlStudentId as Id<'students'>;
			return useQuery(api.evaluations.getStudentEvaluationsByTeacher, () => ({
				studentId
			}));
		}
		// Use custom studentId code
		return useQuery(api.evaluations.getStudentEvaluationsByTeacherByStudentIdCode, () => ({
			studentIdCode: urlStudentId
		}));
	});

	const allEvalsQuery = $derived.by(() => {
		if (isDemo) return undefined;
		if (!isAdmin) return undefined;
		if (useConvexIdQuery) {
			const studentId = urlStudentId as Id<'students'>;
			return useQuery(api.evaluations.getStudentEvaluationsAll, () => ({
				studentId
			}));
		}
		// Use custom studentId code
		return useQuery(api.evaluations.getStudentEvaluationsAllByStudentIdCode, () => ({
			studentIdCode: urlStudentId
		}));
	});

	const student = $derived.by(() => {
		if (isDemo) return demoStudent;
		if (studentQuery?.data) return studentQuery.data;
		return demoStudent;
	});

	// Get evaluations data
	const evaluations = $derived.by(() => {
		if (isDemo) {
			return isAdmin ? demoEvaluations : demoEvaluations.filter((e) => !e.isAdmin);
		}
		if (isAdmin) {
			if (allEvalsQuery?.isLoading) return [];
			if (allEvalsQuery?.error) return [];
			return allEvalsQuery?.data ?? [];
		}
		if (teacherEvalsQuery?.isLoading) return [];
		if (teacherEvalsQuery?.error) return [];
		return teacherEvalsQuery?.data ?? [];
	});

	// Filter state
	let teacherFilter = $state('');

	// Use shared state management
	const filterSummary = createFilterSummaryState();
	const displayState = createEvaluationDisplayState();

	// Update filter summary when filter changes
	$effect(() => {
		filterSummary.updateSummary(!!teacherFilter);
	});

	// Cleanup on destroy
	onDestroy(() => {
		filterSummary.cleanup();
		$headerTitleOverride = '';
	});

	// Dialog states
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let selectedEvaluation = $state<EvaluationEntry | null>(null);

	// Combined and filtered evaluations
	const filteredEvaluations = $derived.by(() => {
		let all = [...evaluations];
		if (teacherFilter && teacherFilter.trim()) {
			all = all.filter((e) => matchesMultiSearch(teacherFilter, e.teacherName ?? ''));
		}
		return sortEvaluations(all, displayState.sortAscending);
	});

	function canEditEntry(entry: EvaluationEntry): boolean {
		if (isDemo) {
			// In demo mode, allow editing all entries for testing
			return true;
		}
		return entry.teacherId === currentUserId;
	}

	function handleLongPress(entry: EvaluationEntry): void {
		selectedEvaluation = entry;
		editDialogOpen = true;
	}

	function handleDeleteRequest(): void {
		deleteDialogOpen = true;
	}

	// Set header title override
	$effect(() => {
		if (!browser) return;
		if (student?.englishName && student?.grade !== undefined) {
			$headerTitleOverride = `G${student.grade} - ${student.englishName} Evaluations`;
		}
	});

	// Determine loading state
	const isLoading = $derived.by(() => {
		if (isDemo) return false;
		if (userQuery?.isLoading) return true;
		if (studentQuery?.isLoading) return true;
		if (isAdmin && allEvalsQuery?.isLoading) return true;
		if (!isAdmin && teacherEvalsQuery?.isLoading) return true;
		return false;
	});

	// Determine loading message
	const loadingMessage = $derived.by(() => {
		if (userQuery?.isLoading) return 'Loading user data...';
		if (studentQuery?.isLoading) return 'Loading student data...';
		if (isAdmin) return 'Loading evaluations...';
		return 'Loading your evaluations...';
	});
</script>

<div class="mx-auto p-8 max-w-6xl">
	{#if isDemo}
		<div class="mb-6">
			<span
				class="bg-yellow-100 dark:bg-yellow-900 px-2 py-1 rounded-full text-yellow-800 dark:text-yellow-100 text-xs"
			>
				DEMO MODE ({demoRole.toUpperCase()})
			</span>
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<EvaluationsLoadingState message={loadingMessage} />
	{:else}
		<EvaluationsTimeline
			evaluations={filteredEvaluations}
			showStudentName={false}
			studentGrade={student.grade}
			showTeacherName={true}
			bind:sortAscending={displayState.sortAscending}
			bind:showDetails={displayState.showDetails}
			enableLongPress={true}
			onLongPress={handleLongPress}
			{canEditEntry}
		>
			{#snippet children()}
				<!-- Filters Section -->
				<div class="flex sm:flex-row flex-col sm:items-center gap-4">
					<!-- Teacher Name Filter -->
					<FilterInput
						bind:value={teacherFilter}
						placeholder="Filter by teacher(s)…"
						ariaLabel="Filter by teacher"
						class="w-full sm:w-48"
					/>
				</div>
			{/snippet}
		</EvaluationsTimeline>

		<!-- Filter Summary -->
		<FilterSummaryToast
			show={filterSummary.showSummary}
			count={filteredEvaluations.length}
			total={evaluations.length}
			filterLabel="teacher"
			filterValue={teacherFilter}
		/>
	{/if}
</div>

<!-- Edit Dialog -->
<EditEvaluationDialog
	bind:open={editDialogOpen}
	evaluation={selectedEvaluation}
	onClose={() => {
		editDialogOpen = false;
		selectedEvaluation = null;
	}}
	onDelete={handleDeleteRequest}
	{isDemo}
/>

<!-- Delete Confirmation Dialog -->
<DeleteEvaluationDialog bind:open={deleteDialogOpen} evaluation={selectedEvaluation} {isDemo} />
