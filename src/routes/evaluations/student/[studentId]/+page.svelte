<script lang="ts">
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';
	import { headerTitleOverride } from '$lib/stores/header';
	import { onDestroy } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Funnel } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data }: { data: { demo?: string; studentId?: string } } = $props();

	// Demo mode flags
	const isDemo = $derived(!!data.demo);
	const demoRole = $derived(data.demo || 'teacher');

	// Fetch user to check role
	const userQuery = $derived.by(() => {
		if (isDemo) return undefined;
		return useQuery(api.users.viewer, () => ({}));
	});

	const client = useConvexClient();
	const categoriesQuery = useQuery(api.categories.list, () => ({}));

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

	// State for sorting and display
	let sortAscending = $state(false);
	let showDetails = $state(false);
	let teacherFilter = $state('');
	let showSummary = $state(false);
	let summaryTimeout: ReturnType<typeof setTimeout>;

	$effect(() => {
		if (teacherFilter) {
			showSummary = true;
			clearTimeout(summaryTimeout);
			summaryTimeout = setTimeout(() => {
				showSummary = false;
			}, 3000);
		} else {
			showSummary = false;
		}
	});

	// Dialog states
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let selectedEvaluation = $state<EvaluationEntry | null>(null);

	// Edit form state
	let editValue = $state(0);
	let editCategory = $state('');
	let editSubCategory = $state('');
	let editDetails = $state('');
	let editLoading = $state(false);

	// Combined and filtered evaluations
	const filteredEvaluations = $derived.by(() => {
		let all = [...evaluations];
		if (teacherFilter && teacherFilter.trim()) {
			all = all.filter((e) => matchesMultiSearch(teacherFilter, e.teacherName ?? ''));
		}
		all.sort((a, b) => {
			return sortAscending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
		});
		return all;
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
		editValue = entry.value;
		editCategory = entry.category;
		editSubCategory = entry.subCategory || '';
		editDetails = entry.details || '';
		editDialogOpen = true;
	}

	async function handleEditConfirm(): Promise<void> {
		if (!selectedEvaluation) return;

		editLoading = true;
		try {
			if (isDemo) {
				// Demo mode - just close the dialog
				editDialogOpen = false;
				selectedEvaluation = null;
			} else {
				await client.mutation(api.evaluations.update, {
					id: selectedEvaluation._id as Id<'evaluations'>,
					value: editValue,
					category: editCategory,
					subCategory: editSubCategory,
					details: editDetails
				});

				editDialogOpen = false;
				selectedEvaluation = null;
			}
		} finally {
			editLoading = false;
		}
	}

	async function handleDeleteConfirm(): Promise<void> {
		if (!selectedEvaluation) return;

		if (isDemo) {
			// Demo mode - just close the dialog
			deleteDialogOpen = false;
			selectedEvaluation = null;
		} else {
			await client.mutation(api.evaluations.remove, {
				id: selectedEvaluation._id as Id<'evaluations'>
			});

			deleteDialogOpen = false;
			selectedEvaluation = null;
		}
	}

	$effect(() => {
		if (!browser) return;
		if (student?.englishName && student?.grade !== undefined) {
			$headerTitleOverride = `G${student.grade} - ${student.englishName} Evaluations`;
		}
	});

	onDestroy(() => {
		$headerTitleOverride = '';
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
	{#if !isDemo && (userQuery?.isLoading ?? false)}
		<div class="py-12 text-muted-foreground text-center">Loading user data...</div>
	{:else if !isDemo && (studentQuery?.isLoading ?? false)}
		<div class="py-12 text-muted-foreground text-center">Loading student data...</div>
	{:else if !isDemo && isAdmin && (allEvalsQuery?.isLoading ?? false)}
		<div class="py-12 text-muted-foreground text-center">Loading evaluations...</div>
	{:else if !isDemo && !isAdmin && (teacherEvalsQuery?.isLoading ?? false)}
		<div class="py-12 text-muted-foreground text-center">Loading your evaluations...</div>
	{:else}
		<EvaluationsTimeline
			evaluations={filteredEvaluations}
			showStudentName={false}
			studentGrade={student.grade}
			showTeacherName={true}
			bind:sortAscending
			bind:showDetails
			enableLongPress={true}
			onLongPress={handleLongPress}
			{canEditEntry}
		>
			{#snippet children()}
				<!-- Filters Section -->
				<div class="flex sm:flex-row flex-col sm:items-center gap-4">
					<!-- Teacher Name Filter -->
					<div class="relative">
						<Funnel class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
						<Input
							type="text"
							placeholder="Filter by teacher(s)…"
							bind:value={teacherFilter}
							class="pl-9 w-full sm:w-48"
						/>
					</div>
				</div>

				<!-- Filter Summary -->
				{#if showSummary}
					<div class="bottom-6 left-1/2 z-50 fixed -translate-x-1/2">
						<p class="bg-card/90 shadow-lg backdrop-blur-sm px-4 py-2 rounded-full text-sm">
							Showing {filteredEvaluations.length} of {evaluations.length} evaluation{evaluations.length ===
							1
								? ''
								: 's'} for teacher "{teacherFilter}"
						</p>
					</div>
				{/if}
			{/snippet}
		</EvaluationsTimeline>
	{/if}
</div>

<!-- Edit Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content aria-label="Edit Evaluation">
		<Dialog.Header>
			<Dialog.Title>Edit Evaluation</Dialog.Title>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<!-- Category -->
			<div class="space-y-2">
				<label class="font-medium text-sm" for="category-select">Category</label>
				<Select.Root type="single" bind:value={editCategory}>
					<Select.Trigger id="category-select" aria-label="Select category">
						{editCategory || 'Select Category'}
					</Select.Trigger>
					<Select.Content>
						{#each categoriesQuery.data || [] as cat (cat._id)}
							<Select.Item value={cat.name}>{cat.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- SubCategory -->
			<div class="space-y-2">
				<label class="font-medium text-sm" for="subcategory-select">Subcategory</label>
				<Select.Root type="single" bind:value={editSubCategory}>
					<Select.Trigger id="subcategory-select" aria-label="Select subcategory">
						{editSubCategory || 'Select Subcategory'}
					</Select.Trigger>
					<Select.Content>
						<!-- Show subcategories based on selected category, or all if none selected -->
						{#each categoriesQuery.data?.find((c) => c.name === editCategory)?.subCategories || [] as sub (sub)}
							<Select.Item value={sub}>{sub}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- Points - Only -2, -1, +1, +2 -->
			<fieldset class="space-y-2">
				<legend class="font-medium text-sm">Points</legend>
				<div class="gap-2 grid grid-cols-4" role="group" aria-label="Point values">
					{#each [-2, -1, 1, 2] as p (p)}
						<Button
							type="button"
							variant={editValue === p ? 'default' : 'outline'}
							onclick={() => (editValue = p)}
							aria-label={p > 0 ? `Award ${p} points` : `Deduct ${Math.abs(p)} points`}
						>
							{p > 0 ? '+' : ''}{p}
						</Button>
					{/each}
				</div>
			</fieldset>

			<!-- Details -->
			<div class="space-y-2">
				<label class="font-medium text-sm" for="evaluation-details">Details / Comments</label>
				<textarea
					id="evaluation-details"
					bind:value={editDetails}
					placeholder="Enter specific details..."
					class="bg-background p-3 border border-input rounded-md w-full text-sm"
					rows="3"
					aria-label="Evaluation details"
				></textarea>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editDialogOpen = false)}>Cancel</Button>
			<Button
				variant="destructive"
				onclick={() => {
					deleteDialogOpen = true;
					editDialogOpen = false;
				}}>Delete</Button
			>
			<Button onclick={handleEditConfirm} disabled={editLoading}>
				{editLoading ? 'Saving...' : 'Save Changes'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content aria-label="Delete Evaluation">
		<Dialog.Header>
			<Dialog.Title>Delete Evaluation</Dialog.Title>
		</Dialog.Header>

		<p class="py-4">
			Are you sure you want to delete this evaluation? This action cannot be undone.
		</p>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={handleDeleteConfirm}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
