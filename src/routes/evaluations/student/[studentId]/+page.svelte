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

	// Determine if user is a teacher (not admin, not super)
	const isTeacher = $derived.by(() => {
		if (isDemo) {
			return demoRole === 'teacher';
		}
		if (userQuery && !userQuery.isLoading && userQuery.data?.role) {
			return userQuery.data.role === 'teacher';
		}
		return false;
	});

	// Determine if user is a student
	const isStudent = $derived.by(() => {
		if (isDemo) {
			return demoRole === 'student';
		}
		if (userQuery && !userQuery.isLoading && userQuery.data?.role) {
			return userQuery.data.role === 'student';
		}
		return false;
	});

	// Get student's enrollment status
	const enrollmentStatus = $derived.by(() => {
		if (isDemo) return 'Enrolled';
		const data = userQuery?.data as { enrollmentStatus?: string } | undefined;
		if (data?.enrollmentStatus) {
			return data.enrollmentStatus;
		}
		return null;
	});

	// Check if student is enrolled
	const isEnrolled = $derived.by(() => {
		return enrollmentStatus === 'Enrolled';
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

	// Student-specific anonymous evaluation query (no teacher names)
	const studentAnonymousEvalsQuery = $derived.by(() => {
		if (isDemo) return undefined;
		if (!isStudent) return undefined;
		return useQuery(api.evaluations.getStudentEvaluationsAnonymous, () => ({}));
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
		// Student view: anonymous evaluations (no teacher names)
		if (isStudent) {
			if (studentAnonymousEvalsQuery?.isLoading) return [];
			if (studentAnonymousEvalsQuery?.error) return [];
			return studentAnonymousEvalsQuery?.data ?? [];
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
		// Only apply teacher filter for non-students (students don't see teacher names)
		if (!isStudent && teacherFilter && teacherFilter.trim()) {
			all = all.filter((e) =>
				matchesMultiSearch(teacherFilter, (e as { teacherName?: string }).teacherName ?? '')
			);
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
		const s = student as { englishName?: string; grade?: number };
		if (s?.englishName && s?.grade !== undefined) {
			$headerTitleOverride = `G${s.grade} - ${s.englishName} Evaluations`;
		}
	});

	// Determine loading state
	const isLoading = $derived.by(() => {
		if (isDemo) return false;
		if (userQuery?.isLoading) return true;
		if (studentQuery?.isLoading) return true;
		if (isStudent && studentAnonymousEvalsQuery?.isLoading) return true;
		if (isAdmin && allEvalsQuery?.isLoading) return true;
		if (!isAdmin && !isStudent && teacherEvalsQuery?.isLoading) return true;
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
	{:else if isStudent && !isEnrolled}
		<!-- Access Denied for Not Enrolled Students -->
		<div class="flex flex-col justify-center items-center px-4 py-16 text-center">
			<div
				class="bg-red-50 dark:bg-red-900/20 p-8 border border-red-200 dark:border-red-800 rounded-lg max-w-md"
			>
				<svg
					class="mx-auto mb-4 w-12 h-12 text-red-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
					/>
				</svg>
				<h2 class="mb-2 font-semibold text-red-800 dark:text-red-200 text-xl">Access Denied</h2>
				<p class="text-red-600 dark:text-red-300">
					You are currently not enrolled. Please contact administration for assistance.
				</p>
			</div>
		</div>
	{:else}
		<EvaluationsTimeline
			evaluations={filteredEvaluations}
			showStudentName={false}
			studentGrade={(student as { grade?: number }).grade}
			showTeacherName={!isTeacher && !isStudent}
			bind:sortAscending={displayState.sortAscending}
			bind:showDetails={displayState.showDetails}
			enableLongPress={!isStudent}
			onLongPress={handleLongPress}
			canEditEntry={isStudent ? () => false : canEditEntry}
		>
			{#snippet children()}
				<!-- Filters Section -->
				<div class="flex sm:flex-row flex-col sm:items-center gap-4">
					<!-- Teacher Name Filter (hidden for teachers) -->
					{#if !isTeacher}
						<FilterInput
							bind:value={teacherFilter}
							placeholder="Filter by teacher(s)…"
							ariaLabel="Filter by teacher"
							class="w-full sm:w-48"
						/>
					{/if}
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
