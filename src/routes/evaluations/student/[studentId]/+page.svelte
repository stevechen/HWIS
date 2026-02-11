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
	import { Button } from '$lib/components/ui/button';

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

	// State for sorting and display
	let sortAscending = $state(false);
	let showDetails = $state(false);
	let teacherFilter = $state('');

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

	// Get unique teachers
	const uniqueTeachers = $derived.by(() => {
		const teachers = [...new Set(evaluations.map((e) => e.teacherName))];
		return teachers.sort();
	});

	// Combined and filtered evaluations
	const filteredEvaluations = $derived.by(() => {
		let all = [...evaluations];
		if (teacherFilter) {
			all = all.filter((e) => e.teacherName === teacherFilter);
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

	function handleTeacherFilterChange(value: string) {
		teacherFilter = value;
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
			$headerTitleOverride = `Evaluation History - G${student.grade} - ${student.englishName}`;
		}
	});

	onDestroy(() => {
		$headerTitleOverride = '';
	});
</script>

<div class="mx-auto max-w-6xl p-8">
	{#if isDemo}
		<div class="mb-6">
			<span
				class="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
			>
				DEMO MODE ({demoRole.toUpperCase()})
			</span>
		</div>
	{/if}

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
			evaluations={filteredEvaluations}
			title={isAdmin ? 'All Points History' : 'Your Assigned Points'}
			showStudentName={false}
			studentGrade={student.grade}
			showTeacherFilter={isAdmin}
			{uniqueTeachers}
			selectedTeacherFilter={teacherFilter}
			onTeacherFilterChange={handleTeacherFilterChange}
			showLegend={true}
			showTeacherName={isAdmin}
			bind:sortAscending
			bind:showDetails
			enableLongPress={true}
			onLongPress={handleLongPress}
			{canEditEntry}
		/>
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
				<label class="text-sm font-medium" for="category-select">Category</label>
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
				<label class="text-sm font-medium" for="subcategory-select">Subcategory</label>
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
				<legend class="text-sm font-medium">Points</legend>
				<div class="grid grid-cols-4 gap-2" role="group" aria-label="Point values">
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
				<label class="text-sm font-medium" for="evaluation-details">Details / Comments</label>
				<textarea
					id="evaluation-details"
					bind:value={editDetails}
					placeholder="Enter specific details..."
					class="bg-background border-input w-full rounded-md border p-3 text-sm"
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
