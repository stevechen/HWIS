<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
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

	const evaluationsQuery = useQuery(api.evaluations.listRecent, () => ({
		limit: 50,
		showAll: undefined
	}));

	// Transform query data to EvaluationEntry format
	const evaluations = $derived.by(() => {
		if (evaluationsQuery.data) {
			return evaluationsQuery.data.map((e) => ({
				_id: e._id,
				value: e.value,
				category: e.category,
				subCategory: e.subCategory,
				details: e.details,
				timestamp: e.timestamp,
				englishName: e.englishName,
				grade: e.grade,
				studentId: e.studentId,
				teacherId: e.teacherId,
				isAdmin: false
			})) as EvaluationEntry[];
		}
		return [];
	});

	// Sort state
	let sortAscending = $state(false);
	// Show details state
	let showDetails = $state(false);

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

	// Sorted evaluations
	const sortedEvaluations = $derived.by(() => {
		const evals = evaluations;
		if (sortAscending) {
			return [...evals].sort((a, b) => a.timestamp - b.timestamp);
		}
		return [...evals].sort((a, b) => b.timestamp - a.timestamp);
	});

	function canEditEntry(entry: EvaluationEntry): boolean {
		return entry.teacherId === currentUserId;
	}

	function handleCardClick(_entry: EvaluationEntry): void {
		// Navigation is handled by href
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
</script>

<div class="mx-auto max-w-6xl p-8">
	{#if !evaluationsQuery.isLoading && evaluations.length > 0}
		<div class="mb-6 flex justify-end">
			<Button onclick={() => void goto('/evaluations/new')}>
				<Plus class="size-4" />
				New
			</Button>
		</div>
	{/if}

	{#if evaluationsQuery.isLoading}
		<div class="text-muted-foreground py-16 text-center">Loading history...</div>
	{:else if evaluations.length === 0}
		<div class="bg-card border-input rounded-lg border p-8 text-center">
			<p class="text-muted-foreground mb-6">No evaluations found. Start by awarding some points!</p>
			<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
		</div>
	{:else}
		<EvaluationsTimeline
			evaluations={sortedEvaluations}
			title="Recent"
			showStudentName={true}
			showTeacherFilter={false}
			showLegend={false}
			showTeacherName={false}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentId}`}
			onCardClick={handleCardClick}
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
