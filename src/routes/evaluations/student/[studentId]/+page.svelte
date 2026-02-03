<script lang="ts">
	import {
		ArrowLeft,
		ArrowUp,
		ArrowDown,
		Award,
		CircleMinus,
		Star,
		User,
		Calendar,
		Eye
	} from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';

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
	const demoEvaluations = [
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

	// Track hovered card index
	let hoveredIndex = $state<number | null>(null);

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

	function formatDate(ts: number) {
		const date = new Date(ts);
		return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
	}

	function toggleSort() {
		sortAscending = !sortAscending;
	}

	function toggleDetails() {
		showDetails = !showDetails;
	}

	function getNodeColor(eval_: { value: number }) {
		if (eval_.value >= 0) return 'bg-emerald-500';
		return 'bg-red-500';
	}

	function getCardBorderColor(eval_: { isAdmin: boolean; value: number }) {
		if (eval_.isAdmin) return 'border-purple-300 dark:border-purple-600';
		if (eval_.value >= 0) return 'border-emerald-200 dark:border-emerald-800';
		return 'border-red-200 dark:border-red-800';
	}

	function getCategoryColor() {
		return 'text-foreground';
	}

	function getTeacherNameColor(eval_: { isAdmin: boolean }) {
		if (eval_.isAdmin) return 'text-purple-600 dark:text-purple-400 font-semibold';
		return 'text-muted-foreground';
	}

	function getPointsBadgeClasses(eval_: { value: number }) {
		if (eval_.value >= 0)
			return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400';
		return 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400';
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

	<!-- Timeline Controls -->
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-xl font-semibold">{isAdmin ? 'Points' : 'Your Assigned Points'}</h2>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={toggleSort}
				title={sortAscending ? 'Oldest First' : 'Newest First'}
			>
				{#if sortAscending}
					<ArrowUp class="size-4" />
				{:else}
					<ArrowDown class="size-4" />
				{/if}
			</Button>

			{#if isAdmin}
				<select
					bind:value={teacherFilter}
					class="bg-background border-input focus:ring-ring h-9 rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus:ring-1 focus:outline-none"
				>
					<option value="">All Teachers</option>
					{#each uniqueTeachers() as teacher (teacher)}
						<option value={teacher}>{teacher}</option>
					{/each}
				</select>
			{/if}

			<Button
				variant="outline"
				size="sm"
				onclick={toggleDetails}
				title={showDetails ? 'Hide Details' : 'Show Details'}
			>
				<Eye class="size-4" />
			</Button>
		</div>
	</div>

	<!-- Loading State -->
	{#if !isDemo && (userQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading user data...</div>
	{:else if !isDemo && (studentQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading student data...</div>
	{:else if !isDemo && isAdmin && (allEvalsQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading evaluation history...</div>
	{:else if !isDemo && !isAdmin && (teacherEvalsQuery?.isLoading ?? false)}
		<div class="text-muted-foreground py-12 text-center">Loading your evaluations...</div>
	{:else if filteredEvaluations().length === 0}
		<div class="text-muted-foreground py-12 text-center">
			No evaluations found for this student.
		</div>
	{:else}
		<!-- Timeline -->
		<div class="bg-background relative">
			<!-- Central Line (sm+) -->
			<div
				class="border-border absolute top-0 bottom-0 left-1/2 hidden w-0.5 -translate-x-1/2 border-l sm:block"
			></div>

			<div class="relative flex min-h-25 flex-col gap-6 py-4">
				{#each filteredEvaluations() as eval_, index (eval_._id)}
					<!-- Timeline Item -->
					{#if index % 2 === 0}
						<!-- Odd item: Date on LEFT, Node center, Content on RIGHT -->
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
							<!-- Date on Left -->
							<div
								class="text-muted-foreground flex flex-col items-end justify-center self-center pr-2 text-right sm:w-full sm:min-w-38"
							>
								<div class="flex items-center gap-1 text-xs">
									<Calendar class="size-3" />
									<span>{formatDate(eval_.timestamp)}</span>
								</div>
								{#if isAdmin}
									<div class="mt-1 flex items-center gap-1 text-xs">
										<User class="size-3" />
										<span class={getTeacherNameColor(eval_)}>{eval_.teacherName}</span>
									</div>
								{/if}
							</div>

							<!-- Node Center -->
							<div class="z-10 flex items-center justify-center">
								<div
									class="border-background size-3 rounded-full border-2 {getNodeColor(eval_)}"
								></div>
							</div>

							<!-- Content on Right -->
							<div class="flex justify-start self-center pl-2 sm:w-full">
								<div
									class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										eval_
									)}"
									role="group"
									onmouseenter={() => (hoveredIndex = index)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
										<span class="text-sm font-semibold {getCategoryColor()}">{eval_.category}</span>
										{#if eval_.subCategory}
											<span class="text-muted-foreground hidden text-xs sm:inline">›</span>
											<span class="text-muted-foreground text-xs">{eval_.subCategory}</span>
										{/if}
									</div>
									<div
										class="overflow-hidden transition-all duration-300 {showDetails ||
										hoveredIndex === index
											? 'max-h-50 opacity-100'
											: 'max-h-0 opacity-0'}"
									>
										{#if eval_.details}
											<p class="text-muted-foreground text-xs">{eval_.details}</p>
										{/if}
									</div>
									<div
										class="absolute -top-2 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
											eval_
										)}"
									>
										{#if eval_.isAdmin}
											<Star class="size-4" />
										{:else if eval_.value >= 0}
											<Award class="size-4" />
										{:else}
											<CircleMinus class="size-4" />
										{/if}
										<span>{eval_.value > 0 ? '+' : ''}{eval_.value}</span>
									</div>
								</div>
							</div>
						</div>
					{:else}
						<!-- Even item: Content on LEFT, Node center, Date on RIGHT -->
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
							<!-- Content on Left -->
							<div class="flex justify-end self-center pr-2 sm:w-full">
								<div
									class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										eval_
									)}"
									role="group"
									onmouseenter={() => (hoveredIndex = index)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
										<span class="text-sm font-semibold {getCategoryColor()}">{eval_.category}</span>
										{#if eval_.subCategory}
											<span class="text-muted-foreground hidden text-xs sm:inline">›</span>
											<span class="text-muted-foreground text-xs">{eval_.subCategory}</span>
										{/if}
									</div>
									<div
										class="overflow-hidden transition-all duration-300 {showDetails ||
										hoveredIndex === index
											? 'max-h-50 opacity-100'
											: 'max-h-0 opacity-0'}"
									>
										{#if eval_.details}
											<p class="text-muted-foreground text-xs">{eval_.details}</p>
										{/if}
									</div>
									<div
										class="absolute -top-2 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
											eval_
										)}"
									>
										{#if eval_.isAdmin}
											<Star class="size-4" />
										{:else if eval_.value >= 0}
											<Award class="size-4" />
										{:else}
											<CircleMinus class="size-4" />
										{/if}
										<span>{eval_.value > 0 ? '+' : ''}{eval_.value}</span>
									</div>
								</div>
							</div>

							<!-- Node Center -->
							<div class="z-10 flex items-center justify-center">
								<div
									class="border-background size-3 rounded-full border-2 {getNodeColor(eval_)}"
								></div>
							</div>

							<!-- Date on Right -->
							<div
								class="text-muted-foreground flex flex-col items-start justify-center self-center pl-2 sm:w-full sm:min-w-38"
							>
								<div class="flex items-center gap-1 text-xs">
									<Calendar class="size-3" />
									<span>{formatDate(eval_.timestamp)}</span>
								</div>
								{#if isAdmin}
									<div class="mt-1 flex items-center gap-1 text-xs">
										<User class="size-3" />
										<span class={getTeacherNameColor(eval_)}>{eval_.teacherName}</span>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<!-- Legend -->
	<div
		class="bg-card text-muted-foreground fixed right-0 bottom-0 left-0 z-50 flex items-center justify-center gap-6 border-t p-3 text-sm shadow-lg"
	>
		<div class="flex items-center gap-2">
			<div class="h-3 w-3 rounded-full bg-emerald-500"></div>
			<span>Positive Points</span>
		</div>
		<div class="flex items-center gap-2">
			<div class="h-3 w-3 rounded-full bg-red-500"></div>
			<span>Negative Points</span>
		</div>
	</div>

	<div class="h-16"></div>
</div>
