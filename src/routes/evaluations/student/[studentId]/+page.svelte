<script lang="ts">
	import { browser } from '$app/environment';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditable } from '$convex/shared/evaluation_week';
	import { getEvaluationCapabilities } from '$convex/shared/authorization';
	import type { Id } from '$convex/_generated/dataModel';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';
	import RadarChart from '$lib/components/RadarChart.svelte';
	import ScoreTallyBar from '$lib/components/timeline/ScoreTallyBar.svelte';
	import {
		headerTitleOverride,
		setHeaderHouseBadge,
		clearHeaderHouseBadge,
		type HouseLogoComponent
	} from '$lib/stores/header';
	import { onDestroy } from 'svelte';
	import { useViewer } from '$lib/viewer.svelte';
	import { matchesMultiSearch } from '$convex/shared/evaluation_utils';
	import { sortEvaluations, createEvaluationDisplayState } from '$lib/evaluations';
	import {
		FilterInput,
		FilterSummaryToast,
		EvaluationStates,
		EditEvaluationDialog,
		DeleteEvaluationDialog
	} from '$lib/evaluations/components';
	import { Button } from '$lib/components/ui/button';
	import { Users, EyeClosed } from '@lucide/svelte';
	import LogoHeracles from '$lib/components/LogoHeracles.svelte';
	import LogoWukong from '$lib/components/LogoWukong.svelte';
	import LogoIxbalam from '$lib/components/LogoIxbalam.svelte';
	import LogoSetna from '$lib/components/LogoSetna.svelte';

	let { data }: { data: { studentId?: string } } = $props();

	// Settled viewer identity: status, actor, capabilities, and role flags.
	const session = useViewer();

	// Fetch all categories for radar chart
	const categoriesQuery = useQuery(api.categories.list, () => ({}));

	const actor = $derived(session.actor);
	const isStudent = $derived(session.isStudent);
	const isEnrolled = $derived(session.isEnrolled);
	const isAdmin = $derived(session.isAdmin);
	const isTeacher = $derived(session.isTeacher);
	const profileReady = $derived(session.status !== 'loading');

	// House logos mapping
	const houseLogos: Record<string, HouseLogoComponent> = {
		Heracles: LogoHeracles,
		Wukong: LogoWukong,
		Ixbalam: LogoIxbalam,
		Setna: LogoSetna
	};

	// Check if studentId is a Convex ID (format: tableName:hexString)
	// Convex IDs look like "students:abc123def456" or similar
	function isConvexId(id: string): boolean {
		// Convex IDs have format: tableName:id (e.g., "students:abc123")
		// The ID part is typically a hex-like string
		return /^[a-z][a-z0-9_-]*:[a-z0-9]+$/i.test(id);
	}

	// Determine if URL studentId is a Convex ID or custom studentId code (reactive)
	const urlStudentId = $derived(data.studentId || '');
	const useConvexIdQuery = $derived(isConvexId(urlStudentId));

	// Role-dependent queries must not fire until the profile has resolved:
	// while it is loading, isAdmin/isStudent are both false, which would make
	// an admin (or student) hit the teacher-only history query and throw
	// "Forbidden: Teacher history access required".
	// (`profileReady` derives from the viewer session's settle state.)

	// Student record (for students, derived from auth; for staff, fetched by URL param)
	const studentQueryById = useQuery(api.evaluations.getStudent, () =>
		!profileReady || isStudent || !useConvexIdQuery
			? 'skip'
			: { studentId: urlStudentId as Id<'students'> }
	);
	const studentQueryByCode = useQuery(api.evaluations.getStudentByStudentIdCode, () =>
		!profileReady || isStudent || useConvexIdQuery ? 'skip' : { studentIdCode: urlStudentId }
	);

	const teacherEvalsQueryById = useQuery(api.evaluations.getStudentEvaluationsByTeacher, () =>
		!profileReady || isAdmin || isStudent || !useConvexIdQuery
			? 'skip'
			: { studentId: urlStudentId as Id<'students'> }
	);
	const teacherEvalsQueryByCode = useQuery(
		api.evaluations.getStudentEvaluationsByTeacherByStudentIdCode,
		() =>
			!profileReady || isAdmin || isStudent || useConvexIdQuery
				? 'skip'
				: { studentIdCode: urlStudentId }
	);

	const allEvalsQueryById = useQuery(api.evaluations.getStudentEvaluationsAll, () =>
		!profileReady || !isAdmin || !useConvexIdQuery
			? 'skip'
			: { studentId: urlStudentId as Id<'students'> }
	);
	const allEvalsQueryByCode = useQuery(
		api.evaluations.getStudentEvaluationsAllByStudentIdCode,
		() => (!profileReady || !isAdmin || useConvexIdQuery ? 'skip' : { studentIdCode: urlStudentId })
	);

	// Student-specific anonymous evaluation query (no teacher names)
	const studentAnonymousEvalsQuery = useQuery(api.evaluations.getStudentEvaluationsAnonymous, () =>
		!profileReady || !isStudent ? 'skip' : {}
	);

	// Derived values to get the active query data
	const studentQuery = $derived(useConvexIdQuery ? studentQueryById : studentQueryByCode);
	const teacherEvalsQuery = $derived(
		useConvexIdQuery ? teacherEvalsQueryById : teacherEvalsQueryByCode
	);
	const allEvalsQuery = $derived(useConvexIdQuery ? allEvalsQueryById : allEvalsQueryByCode);

	const student = $derived(isStudent ? session.viewer : studentQuery.data);

	// Get student's house
	const studentHouse = $derived.by(() => {
		const s = student as { house?: string } | undefined;
		return s?.house || null;
	});

	// Get evaluations data
	const evaluations = $derived.by(() => {
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

	const displayState = createEvaluationDisplayState();
	const showFilterSummary = $derived(!!teacherFilter);

	// Cleanup on destroy
	onDestroy(() => {
		$headerTitleOverride = '';
		clearHeaderHouseBadge();
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

	// Radar categories - combine evaluation categories with all available categories
	// Category order for radar chart - matches houses page order
	const CATEGORY_ORDER = [
		'Responsibility',
		'Excellence',
		'Service',
		'Persistence',
		'Enthusiasm',
		'Collaboration',
		'Timeliness'
	];

	const radarCategories = $derived.by(() => {
		const categories: string[] = [];

		// Get categories from all available sources
		if (categoriesQuery.data) {
			// Real mode: use all categories from the database
			for (const cat of categoriesQuery.data) {
				if (cat.name && !categories.includes(cat.name)) {
					categories.push(cat.name);
				}
			}
		}

		// Also add any categories from evaluations that might not be in the category list
		for (const evaluation of evaluations) {
			const category = evaluation.category?.trim();
			if (category && !categories.includes(category)) {
				categories.push(category);
			}
		}

		// Sort categories according to CATEGORY_ORDER, then alphabetically for unknown categories
		return categories.sort((a, b) => {
			const orderA = CATEGORY_ORDER.indexOf(a);
			const orderB = CATEGORY_ORDER.indexOf(b);
			if (orderA !== -1 && orderB !== -1) {
				return orderA - orderB;
			}
			if (orderA !== -1) return -1;
			if (orderB !== -1) return 1;
			return a.localeCompare(b);
		});
	});

	const radarCategoryTotals = $derived.by(() => {
		return radarCategories.map((category) => ({
			category,
			total: filteredEvaluations
				.filter((evaluation) => evaluation.category === category)
				.reduce((sum, evaluation) => sum + evaluation.value, 0)
		}));
	});

	const radarData = $derived.by(() => {
		if (radarCategoryTotals.length === 0) {
			return [];
		}

		return [
			{
				label:
					student && 'englishName' in student && student.englishName
						? student.englishName
						: 'Student',
				...Object.fromEntries(radarCategoryTotals.map(({ category, total }) => [category, total]))
			}
		];
	});

	const radarMinValue = $derived.by(() => {
		if (radarCategoryTotals.length === 0) return 0;
		return Math.min(0, ...radarCategoryTotals.map(({ total }) => total));
	});

	const radarMaxValue = $derived.by(() => {
		if (radarCategoryTotals.length === 0) return 10;
		return Math.max(0, ...radarCategoryTotals.map(({ total }) => total));
	});

	const radarTicks = $derived.by(() => {
		if (radarCategoryTotals.length === 0) {
			return [0, 2, 4, 6, 8];
		}

		if (radarMaxValue === radarMinValue) {
			return [radarMinValue];
		}

		// Generate unique tick values
		const allValues: number[] = [];
		const step = (radarMaxValue - radarMinValue) / 4;
		for (let i = 0; i <= 4; i++) {
			const val = Math.round(radarMinValue + step * i);
			if (!allValues.includes(val)) {
				allValues.push(val);
			}
		}
		// Ensure we have at least 2 values for the scale
		if (allValues.length < 2) {
			allValues.length = 0;
			allValues.push(radarMinValue);
			allValues.push(radarMaxValue);
		}
		return allValues;
	});

	function canEditEntry(entry: EvaluationEntry): boolean {
		if (!actor || !isEditable(entry.timestamp) || !entry.teacherId) return false;
		const capabilities = getEvaluationCapabilities(actor, {
			teacherId: entry.teacherId as Id<'users'>,
			isUnlocked: true
		});
		return capabilities.editAnyEvaluation || capabilities.editOwnEvaluation;
	}

	function handleLongPress(entry: EvaluationEntry): void {
		selectedEvaluation = entry;
		editDialogOpen = true;
	}

	function handleDeleteRequest(): void {
		deleteDialogOpen = true;
	}

	// Set header title override and house badge
	$effect(() => {
		if (!browser) return;
		// Access student and house to track dependency
		const s = student;
		const h = studentHouse;
		// Student data has englishName but grade is in class data
		// For now, just show the student name without grade
		if (s && 'englishName' in s && s.englishName) {
			$headerTitleOverride = `${s.englishName} Evaluations`;
			// Set house badge in header
			if (h && houseLogos[h as keyof typeof houseLogos]) {
				setHeaderHouseBadge(h, houseLogos[h as keyof typeof houseLogos]);
			} else {
				clearHeaderHouseBadge();
			}
		} else {
			clearHeaderHouseBadge();
		}
	});

	// Determine loading state
	const isLoading = $derived.by(() => {
		if (!profileReady) return true;
		if (studentQuery.isLoading) return true;
		if (isStudent && studentAnonymousEvalsQuery.isLoading) return true;
		if (isAdmin && allEvalsQuery.isLoading) return true;
		if (!isAdmin && !isStudent && teacherEvalsQuery.isLoading) return true;
		return false;
	});

	// Determine loading message
	const loadingMessage = $derived.by(() => {
		if (!profileReady) return 'Loading user data...';
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

<div
	class="mx-auto flex min-h-screen max-w-6xl flex-col p-8"
	data-testid="evaluations-student.root"
>
	<!-- Loading State -->
	{#if isLoading}
		<EvaluationStates
			state="loading"
			testId="evaluations-student.loading"
			message={loadingMessage}
		/>
	{:else if isStudent && !isEnrolled}
		<!-- Access Denied for Not Enrolled Students -->
		<div class="flex flex-col items-center justify-center px-4 py-16 text-center">
			<div
				class="max-w-md rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-900/20"
			>
				<svg
					class="mx-auto mb-4 h-12 w-12 text-red-400"
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
				<h2 class="mb-2 text-xl font-semibold text-red-800 dark:text-red-200">Access Denied</h2>
				<p class="text-red-600 dark:text-red-300">
					You are currently not enrolled. Please contact administration for assistance.
				</p>
			</div>
		</div>
	{:else}
		{#if isAdmin || isTeacher || isStudent}
			<div class="flex flex-col lg:flex-row lg:gap-12">
				{#if radarCategories.length > 0}
					<!-- Left column: Radar chart and category totals -->
					<div class="bg-card/80 shrink-0 rounded-2xl border p-5 shadow-sm lg:w-80">
						<div class="space-y-3">
							<div class="mt-4 flex justify-center">
								<RadarChart
									data={radarData}
									features={radarCategories}
									ticks={radarTicks}
									minValue={radarMinValue}
									maxValue={radarMaxValue}
									colors={['#2563eb']}
									size={280}
								/>
							</div>

							<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
								{#each radarCategoryTotals as { category, total } (category)}
									<div class="bg-background/70 rounded-xl border px-3 py-2">
										<p class="flex justify-between text-sm font-medium">
											{category}
											<span class={[total < 0 && 'text-red-600', 'text-sm text-green-600']}>
												{total >= 0 ? '+' : ''}{total} pts</span
											>
										</p>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Right column: Timeline -->
				<div class="flex min-w-0 flex-1 flex-col">
					<EvaluationsTimeline
						regionTestId="evaluations-student.timeline"
						cardTestIdPrefix="evaluations-student.card"
						sortTestId="evaluations-student.sort"
						detailsTestId="evaluations-student.details"
						emptyTestId="evaluations-student.empty-timeline"
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
						{#if isAdmin}
							<FilterInput
								testId="evaluations-student.filter-teacher"
								bind:value={teacherFilter}
								placeholder="Filter by teacher(s)…"
								ariaLabel="Filter by teacher"
								class="w-full sm:w-48"
							/>
						{/if}
						{#snippet extraToggles()}
							{#if isAdmin}
								<Button
									testId="evaluations-student.toggle-teacher-name"
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
						class="sticky bottom-0 mt-auto flex justify-center pt-4"
						class:opacity-0={isTallyBarSticky}
						class:pointer-events-none={isTallyBarSticky}
					>
						<div
							class="bg-background/60 rounded-full px-4 py-2 shadow-lg backdrop-blur-sm transition-all duration-300"
						>
							<ScoreTallyBar evaluations={filteredEvaluations} />
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Floating Tally Bar (appears when scrolled past) -->
		<div
			class="pointer-events-none fixed right-0 bottom-4 left-0 z-20 flex justify-center transition-all duration-300"
			class:opacity-0={!isTallyBarSticky}
			class:translate-y-4={!isTallyBarSticky}
			class:translate-y-0={isTallyBarSticky}
		>
			<div
				class="bg-background/60 pointer-events-auto rounded-full px-4 py-2 shadow-lg backdrop-blur-sm"
			>
				<ScoreTallyBar evaluations={filteredEvaluations} />
			</div>
		</div>

		<!-- Filter Summary -->
		<FilterSummaryToast
			testId="evaluations-student.filter-summary"
			show={showFilterSummary}
			count={filteredEvaluations.length}
			total={evaluations.length}
			filterLabel="teacher"
			filterValue={teacherFilter}
		/>
	{/if}
</div>

<!-- Edit Dialog -->
<EditEvaluationDialog
	dialogTestId="evaluations-student.edit-dialog"
	categoryTriggerTestId="evaluations-student.edit-dialog.category"
	pointButtonTestIdPrefix="evaluations-student.edit-dialog.point"
	detailsTestId="evaluations-student.edit-dialog.details"
	cancelTestId="evaluations-student.edit-dialog.cancel"
	deleteTestId="evaluations-student.edit-dialog.delete"
	saveTestId="evaluations-student.edit-dialog.save"
	bind:open={editDialogOpen}
	evaluation={selectedEvaluation}
	onClose={() => {
		editDialogOpen = false;
		selectedEvaluation = null;
	}}
	onDelete={handleDeleteRequest}
/>

<!-- Delete Confirmation Dialog -->
<DeleteEvaluationDialog
	dialogTestId="evaluations-student.delete-dialog"
	cancelTestId="evaluations-student.delete-dialog.cancel"
	deleteTestId="evaluations-student.delete-dialog.delete"
	bind:open={deleteDialogOpen}
	evaluation={selectedEvaluation}
/>
