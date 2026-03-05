<script lang="ts">
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';
	import ScoreTallyBar from '$lib/components/timeline/ScoreTallyBar.svelte';
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
	import { Button } from '$lib/components/ui/button';
	import { Users, EyeClosed } from '@lucide/svelte';

	let { data }: { data: { demo?: string; studentId?: string } } = $props();

	// Demo mode flags
	const isDemo = $derived(!!data.demo);
	const demoRole = $derived(data.demo || 'teacher');

	// Fetch user to check role (always call useQuery at top level)
	const userQuery = useQuery(api.users.viewer, () => (isDemo ? 'skip' : {}));

	// Determine if user is admin
	const isAdmin = $derived.by(() => {
		if (isDemo) {
			return demoRole === 'admin' || demoRole === 'super';
		}
		if (!userQuery.isLoading && userQuery.data?.role) {
			return userQuery.data.role === 'admin' || userQuery.data.role === 'super';
		}
		return false;
	});

	// Determine if user is a teacher (not admin, not super)
	const isTeacher = $derived.by(() => {
		if (isDemo) {
			return demoRole === 'teacher';
		}
		if (!userQuery.isLoading && userQuery.data?.role) {
			return userQuery.data.role === 'teacher';
		}
		return false;
	});

	// Determine if user is a student
	const isStudent = $derived.by(() => {
		if (isDemo) {
			return demoRole === 'student';
		}
		if (!userQuery.isLoading && userQuery.data?.role) {
			return userQuery.data.role === 'student';
		}
		return false;
	});

	// Get student's enrollment status
	const enrollmentStatus = $derived.by(() => {
		if (isDemo) return 'Enrolled';
		const data = userQuery.data as { enrollmentStatus?: string } | undefined;
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
	const currentUserId = $derived(isDemo ? demoUserId : userQuery.data?._id);

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
	// Use 'skip' pattern for conditional queries - always call useQuery at top level
	const studentQueryById = useQuery(api.evaluations.getStudent, () =>
		isDemo || !useConvexIdQuery ? 'skip' : { studentId: urlStudentId as Id<'students'> }
	);
	const studentQueryByCode = useQuery(api.evaluations.getStudentByStudentIdCode, () =>
		isDemo || useConvexIdQuery ? 'skip' : { studentIdCode: urlStudentId }
	);

	const teacherEvalsQueryById = useQuery(api.evaluations.getStudentEvaluationsByTeacher, () =>
		isDemo || isAdmin || !useConvexIdQuery ? 'skip' : { studentId: urlStudentId as Id<'students'> }
	);
	const teacherEvalsQueryByCode = useQuery(
		api.evaluations.getStudentEvaluationsByTeacherByStudentIdCode,
		() => (isDemo || isAdmin || useConvexIdQuery ? 'skip' : { studentIdCode: urlStudentId })
	);

	const allEvalsQueryById = useQuery(api.evaluations.getStudentEvaluationsAll, () =>
		isDemo || !isAdmin || !useConvexIdQuery ? 'skip' : { studentId: urlStudentId as Id<'students'> }
	);
	const allEvalsQueryByCode = useQuery(
		api.evaluations.getStudentEvaluationsAllByStudentIdCode,
		() => (isDemo || !isAdmin || useConvexIdQuery ? 'skip' : { studentIdCode: urlStudentId })
	);

	// Student-specific anonymous evaluation query (no teacher names)
	const studentAnonymousEvalsQuery = useQuery(api.evaluations.getStudentEvaluationsAnonymous, () =>
		isDemo || !isStudent ? 'skip' : {}
	);

	// Derived values to get the active query data
	const studentQuery = $derived(useConvexIdQuery ? studentQueryById : studentQueryByCode);
	const teacherEvalsQuery = $derived(
		useConvexIdQuery ? teacherEvalsQueryById : teacherEvalsQueryByCode
	);
	const allEvalsQuery = $derived(useConvexIdQuery ? allEvalsQueryById : allEvalsQueryByCode);

	const student = $derived.by(() => {
		if (isDemo) return demoStudent;
		return studentQuery.data;
	});

	// Get evaluations data
	const evaluations = $derived.by(() => {
		if (isDemo) {
			return isAdmin ? demoEvaluations : demoEvaluations.filter((e) => !e.isAdmin);
		}
		// Student view: anonymous evaluations (no teacher names)
		if (isStudent) {
			if (studentAnonymousEvalsQuery.isLoading) return [];
			if (studentAnonymousEvalsQuery.error) return [];
			return studentAnonymousEvalsQuery.data ?? [];
		}
		if (isAdmin) {
			if (allEvalsQuery.isLoading) return [];
			if (allEvalsQuery.error) return [];
			return allEvalsQuery.data ?? [];
		}
		if (teacherEvalsQuery.isLoading) return [];
		if (teacherEvalsQuery.error) return [];
		return teacherEvalsQuery.data ?? [];
	});

	// Filter state
	let teacherFilter = $state('');

	// Show teacher name toggle - default to OFF for privacy (admin only)
	let showTeacherName = $state(false);

	function toggleShowTeacherName(): void {
		showTeacherName = !showTeacherName;
	}

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
		// Access student to track dependency
		const s = student;
		// Student data has englishName but grade is in class data
		// For now, just show the student name without grade
		if (s && 'englishName' in s && s.englishName) {
			$headerTitleOverride = `${s.englishName} Evaluations`;
		}
	});

	// Determine loading state
	const isLoading = $derived.by(() => {
		if (isDemo) return false;
		if (userQuery.isLoading) return true;
		if (studentQuery.isLoading) return true;
		if (isStudent && studentAnonymousEvalsQuery.isLoading) return true;
		if (isAdmin && allEvalsQuery.isLoading) return true;
		if (!isAdmin && !isStudent && teacherEvalsQuery.isLoading) return true;
		return false;
	});

	// Determine loading message
	const loadingMessage = $derived.by(() => {
		if (userQuery.isLoading) return 'Loading user data...';
		if (studentQuery.isLoading) return 'Loading student data...';
		if (isAdmin) return 'Loading evaluations...';
		return 'Loading your evaluations...';
	});

	// Sticky tally bar state
	let tallyBarRef = $state<HTMLDivElement | null>(null);
	let isTallyBarSticky = $state(false);

	function handleScroll() {
		if (!tallyBarRef) return;
		const rect = tallyBarRef.getBoundingClientRect();
		const isBelowViewport = rect.top > window.innerHeight;
		isTallyBarSticky = isBelowViewport;
	}
</script>

<svelte:window onscroll={handleScroll} />

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
			{showTeacherName}
			bind:sortAscending={displayState.sortAscending}
			bind:showDetails={displayState.showDetails}
			enableLongPress={!isStudent}
			onLongPress={handleLongPress}
			canEditEntry={isStudent ? () => false : canEditEntry}
		>
			{#snippet children()}
				<!-- Filter input only -->
				{#if !isTeacher}
					<FilterInput
						bind:value={teacherFilter}
						placeholder="Filter by teacher(s)…"
						ariaLabel="Filter by teacher"
						class="w-full sm:w-48"
					/>
				{/if}
			{/snippet}
			{#snippet extraToggles()}
				{#if isAdmin}
					<Button
						aria-label={showTeacherName ? 'Hide teacher name' : 'Show teacher name'}
						variant="outline"
						size="sm"
						onclick={toggleShowTeacherName}
						title={showTeacherName ? 'Hide teacher name' : 'Show teacher name'}
					>
						{#if showTeacherName}
							<Users class="size-4" />
						{:else}
							<EyeClosed class="size-4" />
						{/if}
					</Button>
				{/if}
			{/snippet}
		</EvaluationsTimeline>

		<!-- Score Tally Bar - sticky at bottom of timeline, then floats when scrolled past -->
		<div
			bind:this={tallyBarRef}
			class="flex justify-center mt-4"
			class:opacity-0={isTallyBarSticky}
			class:pointer-events-none={isTallyBarSticky}
		>
			<div
				class="bg-background/60 shadow-lg backdrop-blur-sm px-4 py-2 rounded-full transition-all duration-300"
			>
				<ScoreTallyBar evaluations={filteredEvaluations} />
			</div>
		</div>

		<!-- Floating Tally Bar (appears when scrolled past) -->
		<div
			class="right-0 bottom-4 left-0 z-20 fixed flex justify-center transition-all duration-300 pointer-events-none"
			class:opacity-0={!isTallyBarSticky}
			class:translate-y-4={!isTallyBarSticky}
			class:translate-y-0={isTallyBarSticky}
		>
			<div
				class="bg-background/60 shadow-lg backdrop-blur-sm px-4 py-2 rounded-full pointer-events-auto"
			>
				<ScoreTallyBar evaluations={filteredEvaluations} />
			</div>
		</div>

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
