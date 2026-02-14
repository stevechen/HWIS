<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import type { EvaluationEntry } from '$lib/components/timeline/types';

	interface Props {
		open: boolean;
		evaluation: EvaluationEntry | null;
		onClose: () => void;
		onDelete: () => void;
		isDemo?: boolean;
	}

	let { open = $bindable(), evaluation, onClose, onDelete, isDemo = false }: Props = $props();

	const client = useConvexClient();
	const categoriesQuery = useQuery(api.categories.list, () => ({}));

	// Form state
	let editValue = $state(0);
	let editCategoryId = $state('');
	let editSubCategory = $state('');
	let editDetails = $state('');
	let editLoading = $state(false);

	// Sync form state when evaluation changes
	$effect(() => {
		if (evaluation) {
			editValue = evaluation.value;
			editCategoryId = evaluation.categoryId || '';
			editSubCategory = evaluation.subCategory || '';
			editDetails = evaluation.details || '';
		}
	});

	async function handleSave(): Promise<void> {
		if (!evaluation) return;

		editLoading = true;
		try {
			if (isDemo) {
				open = false;
			} else {
				await client.mutation(api.evaluations.update, {
					id: evaluation._id as Id<'evaluations'>,
					value: editValue,
					categoryId: editCategoryId as Id<'point_categories'>,
					subCategory: editSubCategory,
					details: editDetails
				});
				open = false;
			}
		} finally {
			editLoading = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content aria-label="Edit Evaluation">
		<Dialog.Header>
			<Dialog.Title>Edit Evaluation</Dialog.Title>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<!-- Category -->
			<div class="space-y-2">
				<label class="text-sm font-medium" for="category-select">Category</label>
				<Select.Root type="single" bind:value={editCategoryId}>
					<Select.Trigger id="category-select" aria-label="Select category">
						{#if categoriesQuery.isLoading}
							Loading...
						{:else if editCategoryId && categoriesQuery.data}
							{categoriesQuery.data.find((c) => c._id === editCategoryId)?.name ||
								'Select Category'}
						{:else}
							Select Category
						{/if}
					</Select.Trigger>
					<Select.Content>
						{#each categoriesQuery.data || [] as cat (cat._id)}
							<Select.Item value={cat._id}>{cat.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- SubCategory - only show if selected category has subcategories -->
			{#if editCategoryId && categoriesQuery.data?.find((c) => c._id === editCategoryId)?.subCategories?.length}
				<div class="space-y-2">
					<label class="text-sm font-medium" for="subcategory-select">Subcategory</label>
					<Select.Root type="single" bind:value={editSubCategory}>
						<Select.Trigger id="subcategory-select" aria-label="Select subcategory">
							{editSubCategory || 'Select Subcategory'}
						</Select.Trigger>
						<Select.Content>
							{#each categoriesQuery.data.find((c) => c._id === editCategoryId)?.subCategories || [] as sub (sub)}
								<Select.Item value={sub}>{sub}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			<!-- Points -->
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
			<Button variant="outline" onclick={onClose}>Cancel</Button>
			<Button variant="destructive" onclick={onDelete}>Delete</Button>
			<Button onclick={handleSave} disabled={editLoading}>
				{editLoading ? 'Saving...' : 'Save Changes'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
