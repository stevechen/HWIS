<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Plus, Funnel, Loader } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import type { Id } from '$convex/_generated/dataModel';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

	const user = useQuery(api.users.viewer, () => ({}));
	const client = useConvexClient();
	const categoriesQuery = useQuery(api.categories.list, () => ({}));

	const isAdmin = $derived.by(() => {
		if (!user.isLoading && user.data?.role) {
			return user.data.role === 'admin' || user.data.role === 'super';
		}
		return false;
	});

	const currentUserId = $derived(user.data?._id);

	// Filter state
	let studentFilter = $state('');
	let showSummary = $state(false);
	let summaryTimeout: ReturnType<typeof setTimeout>;

	// Pagination state
	let cursor = $state<string | null | undefined>(undefined);
	let accumulatedEvaluations = $state<EvaluationEntry[]>([]);
	let isLoadingMore = $state(false);
	let nextCursor = $state<string | null | undefined>(undefined); // Track when loadMore is triggered

	$effect(() => {
		if (studentFilter) {
			showSummary = true;
			clearTimeout(summaryTimeout);
			summaryTimeout = setTimeout(() => {
				showSummary = false;
			}, 3000);
		} else {
			showSummary = false;
		}
	});

	// Reset accumulated evaluations when filter changes
	$effect(() => {
		if (studentFilter !== undefined) {
			cursor = undefined;
			nextCursor = undefined;
			accumulatedEvaluations = [];
		}
	});

	// Fetch evaluations with pagination
	const evaluationsQuery = useQuery(api.evaluations.listRecent, () => ({
		limit: 50,
		cursor: cursor ?? undefined,
		studentFilter: studentFilter || undefined
	}));

	// Transform query data to EvaluationEntry format
	function transformEvaluation(e: {
		_id: string;
		value: number;
		category: string;
		subCategory?: string;
		details?: string;
		timestamp: number;
		englishName: string;
		grade: number;
		studentId: string;
		studentIdCode: string;
		teacherId: string;
	}): EvaluationEntry {
		return {
			_id: e._id,
			value: e.value,
			category: e.category,
			subCategory: e.subCategory,
			details: e.details,
			timestamp: e.timestamp,
			englishName: e.englishName,
			grade: e.grade,
			studentId: e.studentId,
			studentIdCode: e.studentIdCode,
			teacherId: e.teacherId,
			isAdmin: false
		};
	}

	// Accumulate pagination results when query updates with nextCursor set (load more triggered)
	$effect(() => {
		if (!evaluationsQuery.data) return;

		// If loadMore was triggered and we got new data, accumulate it
		if (nextCursor !== undefined) {
			// Check if the response has new data (cursor should have changed from nextCursor)
			if (evaluationsQuery.data.evaluations.length > 0) {
				const newEvals = evaluationsQuery.data.evaluations || [];
				const existingIds = new Set(accumulatedEvaluations.map((e) => e._id));
				const uniqueNew = newEvals.filter((e) => !existingIds.has(e._id)).map(transformEvaluation);

				if (uniqueNew.length > 0) {
					accumulatedEvaluations = [...accumulatedEvaluations, ...uniqueNew];
				}
			}

			// Clear loadMore state
			nextCursor = undefined;
			isLoadingMore = false;
		} else if (accumulatedEvaluations.length === 0) {
			// Initial load - just set accumulatedEvaluations from query
			accumulatedEvaluations = evaluationsQuery.data.evaluations.map(transformEvaluation);
		}
	});

	// Display evaluations
	const evaluations = $derived.by(() => {
		if (accumulatedEvaluations.length > 0) {
			return accumulatedEvaluations;
		}
		if (evaluationsQuery.data) {
			return evaluationsQuery.data.evaluations.map(transformEvaluation);
		}
		return [];
	});

	// Filtered evaluations
	const filteredEvaluations = $derived.by(() => {
		return [...evaluations].sort((a, b) => b.timestamp - a.timestamp);
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

	function canEditEntry(entry: EvaluationEntry): boolean {
		return entry.teacherId === currentUserId;
	}

	function handleCardClick(_entry: EvaluationEntry): void {
		void _entry;
	}

	function handleLongPress(entry: EvaluationEntry): void {
		selectedEvaluation = entry;
		editValue = entry.value;
		editCategory = entry.category;
		editSubCategory = entry.subCategory || '';
		editDetails = entry.details || '';
		editDialogOpen = true;
	}

	function handleDeleteRequest(entry: EvaluationEntry): void {
		selectedEvaluation = entry;
		deleteDialogOpen = true;
	}

	async function handleEditConfirm(): Promise<void> {
		if (!selectedEvaluation) return;

		editLoading = true;
		try {
			await client.mutation(api.evaluations.update, {
				id: selectedEvaluation._id as Id<'evaluations'>,
				value: editValue,
				category: editCategory,
				subCategory: editSubCategory,
				details: editDetails
			});

			editDialogOpen = false;
			selectedEvaluation = null;
		} finally {
			editLoading = false;
		}
	}

	async function handleDeleteConfirm(): Promise<void> {
		if (!selectedEvaluation) return;

		await client.mutation(api.evaluations.remove, {
			id: selectedEvaluation._id as Id<'evaluations'>
		});

		deleteDialogOpen = false;
		selectedEvaluation = null;
	}

	// Load more evaluations
	async function loadMore(): Promise<void> {
		if (isLoadingMore) return;
		if (!evaluationsQuery.data) return;
		if (evaluationsQuery.data.isDone) return;

		// Trigger a new query with the next cursor
		nextCursor = evaluationsQuery.data.cursor;
		cursor = nextCursor;
		isLoadingMore = true;
	}

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
</script>

<div class="mx-auto p-8 max-w-6xl">
	{#if evaluationsQuery.isLoading && accumulatedEvaluations.length === 0}
		<div class="flex justify-center items-center gap-2 py-16 text-muted-foreground text-center">
			<Loader class="size-5 animate-spin" />
			Loading history...
		</div>
	{:else if evaluationsQuery.error}
		<div class="bg-card p-8 border border-destructive rounded-lg text-center">
			<p class="text-destructive">Error loading evaluations: {evaluationsQuery.error.message}</p>
		</div>
	{:else if evaluations.length === 0}
		<div class="bg-card p-8 border border-input rounded-lg text-center">
			<p class="mb-6 text-muted-foreground">No evaluations found. Start by awarding some points!</p>
			<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
		</div>
	{:else}
		<EvaluationsTimeline
			evaluations={sortedEvaluations}
			showStudentName={true}
			showTeacherName={false}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentIdCode}`}
			onCardClick={handleCardClick}
			bind:sortAscending
			bind:showDetails
			enableLongPress={true}
			onLongPress={handleLongPress}
			{canEditEntry}
		>
			{#snippet children()}
				<!-- Filters Section with New Button -->
				<div class="flex sm:flex-row flex-col sm:items-center gap-4">
					<Button onclick={() => void goto('/evaluations/new')}>
						<Plus class="size-4" />
						New
					</Button>

					<!-- Filter Input -->
					<div class="relative">
						<Funnel class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
						<Input
							type="text"
							placeholder="Filter by student(s)…"
							bind:value={studentFilter}
							class="pl-9 w-full sm:w-64"
						/>
					</div>
				</div>

				<!-- Filter Summary -->
				{#if showSummary}
					<div class="bottom-6 left-1/2 z-50 fixed -translate-x-1/2">
						<p class="bg-card/90 shadow-lg backdrop-blur-sm px-4 py-2 rounded-full text-sm">
							Showing {filteredEvaluations.length} evaluations matching student "{studentFilter}"
						</p>
					</div>
				{/if}
			{/snippet}
		</EvaluationsTimeline>

		{#if evaluationsQuery.data && !evaluationsQuery.data.isDone && evaluations.length > 0}
			<div class="flex justify-center mt-4">
				<Button variant="outline" onclick={loadMore} disabled={isLoadingMore}>
					{#if isLoadingMore}
						<Loader class="mr-2 size-4 animate-spin" />
						Loading...
					{:else}
						More
					{/if}
				</Button>
			</div>
		{/if}
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
					editDialogOpen = false;
					deleteDialogOpen = true;
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
