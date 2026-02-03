<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

	let { data }: { data: { testRole?: string; demo?: string; studentId?: string } } = $props();

	// Demo mode flags
	const isDemo = $derived(!!data.demo || !!data.testRole);
	const demoRole = $derived(data.demo || data.testRole || 'teacher');
	const isTestMode = $derived(!!data.testRole || !!data.demo);

	// Fetch user to check role
	const userQuery = $derived.by(() => {
		if (isDemo) return undefined;
		return useQuery(api.users.viewer, () => ({
			testToken: isTestMode ? 'test-token' : undefined
		}));
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

	// Demo student data
	const demoStudent = {
		_id: 'demo-student-id',
		englishName: 'John Smith',
		chineseName: '張約翰',
		studentId: 'SE2024001',
		grade: 10,
		classSection: 'A'
	};

	// Demo evaluation data
	const demoEvaluations: EvaluationEntry[] = [
		{
			_id: 'eval-1',
			value: 5,
			category: 'Academic',
			subCategory: 'Homework',
			details: 'Excellent homework submission - all problems solved correctly',
			timestamp: Date.now() - 1000 * 60 * 60 * 24,
			teacherName: 'Ms. Johnson',
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
			isAdmin: true
		}
	];

	// Real Convex queries
	const studentQuery = $derived.by(() => {
		if (isDemo) return undefined;
		const studentId = data.studentId as Id<'students'>;
		return useQuery(api.evaluations.getStudent, () => ({
			studentId,
			testToken: isTestMode ? 'test-token' : undefined
		}));
	});

	const teacherEvalsQuery = $derived.by(() => {
		if (isDemo) return undefined;
		if (isAdmin) return undefined;
		const studentId = data.studentId as Id<'students'>;
		return useQuery(api.evaluations.getStudentEvaluationsByTeacher, () => ({
			studentId,
			testToken: isTestMode ? 'test-token' : undefined
		}));
	});

	const allEvalsQuery = $derived.by(() => {
		if (isDemo) return undefined;
		if (!isAdmin) return undefined;
		const studentId = data.studentId as Id<'students'>;
		return useQuery(api.evaluations.getStudentEvaluationsAll, () => ({
			studentId,
			testToken: isTestMode ? 'test-token' : undefined
		}));
	});

	// Get student data
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

	// State for sorting and display
	let sortAscending = $state(false);
	let showDetails = $state(false);
	let teacherFilter = $state('');

	// Get unique teachers
	const uniqueTeachers = $derived(() => {
		const teachers = [...new Set(evaluations.map((e) => e.teacherName))];
		return teachers.sort();
	});

	// Combined and filtered evaluations
	const filteredEvaluations = $derived(() => {
		let all = [...evaluations];
		if (teacherFilter) {
			all = all.filter((e) => e.teacherName === teacherFilter);
		}
		all.sort((a, b) => {
			return sortAscending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
		});
		return all;
	});

	function handleTeacherFilterChange(value: string) {
		teacherFilter = value;
	}
</script>

<div class="mx-auto max-w-6xl p-8">
	<header class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" onclick={() => void (window.location.href = '/evaluations')}>
				<ArrowLeft class="size-4" />
				<span class="ml-2 hidden sm:inline">Back to Evaluations</span>
			</Button>
			<h1 class="text-foreground text-lg font-semibold sm:text-2xl">
				<span class="hidden sm:inline">Evaluation History - </span>
				<span>G{student.grade} - {student.englishName}</span>
			</h1>
			{#if isDemo}
				<span
					class="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
				>
					DEMO MODE ({demoRole.toUpperCase()})
				</span>
			{/if}
		</div>
		<ThemeToggle />
	</header>

	<!-- Loading State -->
	{#if !isDemo && (userQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading user data...</div>
	{:else if !isDemo && (studentQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading student data...</div>
	{:else if !isDemo && isAdmin && (allEvalsQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading evaluation history...</div>
	{:else if !isDemo && !isAdmin && (teacherEvalsQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading your evaluations...</div>
	{:else}
		<EvaluationsTimeline
			evaluations={filteredEvaluations()}
			title={isAdmin ? 'All Points History' : 'Your Assigned Points'}
			showStudentName={false}
			studentGrade={student.grade}
			{isAdmin}
			showTeacherFilter={isAdmin}
			uniqueTeachers={uniqueTeachers()}
			selectedTeacherFilter={teacherFilter}
			onTeacherFilterChange={handleTeacherFilterChange}
			showLegend={true}
			showTeacherName={isAdmin}
			bind:sortAscending
			bind:showDetails
		/>
	{/if}
</div>
