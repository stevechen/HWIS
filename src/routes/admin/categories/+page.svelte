<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Plus, Trash2, Pencil, X, Check } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';

	const client = useConvexClient();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const apiAny = api as any;

	const categoriesQuery = useQuery(api.categories.list, () => ({}));
	const categories = $derived(categoriesQuery.data ?? []);

	let showForm = $state(false);
	let editingId = $state<Id<'point_categories'> | null>(null);
	let categoryName = $state('');
	let subCategories = $state<string[]>([]);
	let newSubCategory = $state('');
	let isSubmitting = $state(false);
	let formError = $state('');
	let categoryToDelete = $state<{
		_id: Id<'point_categories'>;
		name: string;
		subCategories: string[];
	} | null>(null);
	let subCategoryWarning = $state<{ subCategory: string; count: number } | null>(null);
	let subCategoryToDelete = $state<{
		categoryId: Id<'point_categories'>;
		subCategory: string;
	} | null>(null);
	let toastMessage = $state<string | null>(null);
	let toastTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	function showToast(message: string) {
		toastMessage = message;
		if (toastTimeout) clearTimeout(toastTimeout);
		toastTimeout = setTimeout(() => {
			toastMessage = null;
		}, 3000);
	}

	function startAdd() {
		categoryName = '';
		subCategories = [];
		editingId = null;
		showForm = true;
	}

	function startEdit(category: {
		_id: Id<'point_categories'>;
		name: string;
		subCategories: string[];
	}) {
		editingId = category._id;
		categoryName = category.name;
		subCategories = [...category.subCategories];
		showForm = true;
	}

	function handleCancel() {
		showForm = false;
		editingId = null;
		categoryName = '';
		subCategories = [];
		newSubCategory = '';
		subCategoryToDelete = null;
	}

	async function handleSubmit() {
		if (!categoryName.trim()) return;

		isSubmitting = true;
		formError = '';
		try {
			if (editingId) {
				// Get evaluation count before update for toast notification
				const evalCount = await client.query(api.categories.getEvaluationCount, {
					categoryId: editingId
				});

				await client.mutation(api.categories.update, {
					id: editingId,
					name: categoryName,
					subCategories
				});

				// Show toast if there are evaluations affected
				if (evalCount > 0) {
					showToast(`Category updated. ${evalCount} evaluation(s) now display the new name.`);
				}
			} else {
				await client.mutation(api.categories.create, {
					name: categoryName,
					subCategories
				});
			}
			handleCancel();
		} catch (err) {
			formError = (err as Error).message || 'Failed to save category';
		} finally {
			isSubmitting = false;
		}
	}

	function addSubCategory() {
		const trimmed = newSubCategory.trim();
		if (trimmed && !subCategories.includes(trimmed)) {
			subCategories = [...subCategories, trimmed];
			newSubCategory = '';
		}
	}

	async function removeSubCategory(sub: string) {
		if (!editingId) return;

		// Check if this subcategory has evaluations
		try {
			const count = await client.query(api.categories.getSubCategoryEvaluationCount, {
				categoryId: editingId,
				subCategory: sub
			});

			if (count && count > 0) {
				// Show confirmation dialog
				subCategoryToDelete = { categoryId: editingId, subCategory: sub };
				subCategoryWarning = { subCategory: sub, count };
			} else {
				// No evaluations, just remove
				subCategories = subCategories.filter((s) => s !== sub);
			}
		} catch {
			// Error handled silently - just remove the subcategory
			subCategories = subCategories.filter((s) => s !== sub);
		}
	}

	function cancelSubCategoryDelete() {
		subCategoryToDelete = null;
		subCategoryWarning = null;
	}

	async function confirmSubCategoryDelete() {
		if (!subCategoryToDelete) return;

		isSubmitting = true;
		const subToDelete = subCategoryToDelete;
		try {
			// Delete evaluations and remove subcategory
			await client.mutation(api.categories.removeSubCategory, {
				categoryId: subToDelete.categoryId,
				subCategory: subToDelete.subCategory
			});
			// Update local state
			subCategories = subCategories.filter((s) => s !== subToDelete.subCategory);
			subCategoryToDelete = null;
			subCategoryWarning = null;
		} catch {
			// Error handled silently
		} finally {
			isSubmitting = false;
		}
	}

	async function confirmDelete(category: {
		_id: Id<'point_categories'>;
		name: string;
		subCategories: string[];
	}) {
		categoryToDelete = category;
		subCategoryWarning = null;

		// Check for evaluations with this category (any subcategory)
		try {
			const count = await client.query(api.categories.getEvaluationCount, {
				categoryId: category._id
			});
			if (count && count > 0) {
				subCategoryWarning = {
					subCategory: 'all subcategories',
					count
				};
			}
		} catch {
			// Error handled silently
		}
	}

	function cancelDelete() {
		categoryToDelete = null;
		subCategoryWarning = null;
	}

	async function handleDelete() {
		if (!categoryToDelete) return;

		isSubmitting = true;
		try {
			await client.mutation(api.categories.remove, {
				id: categoryToDelete._id
			});
			categoryToDelete = null;
		} catch {
			// Error handled silently
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if toastMessage}
	<div
		class="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-white shadow-lg"
		role="alert"
	>
		<Check class="size-5" />
		<span>{toastMessage}</span>
	</div>
{/if}

<div class="container mx-auto max-w-6xl py-8">
	<div class="bg-card rounded-lg border shadow-sm">
		<Table.Root aria-label="Categories">
			<Table.Header class="text-red">
				<Table.Row>
					<Table.Head class="w-50">Category</Table.Head>
					<Table.Head>Sub-Categories</Table.Head>
					<Table.Head class="w-25 text-center">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each categories as category (category._id)}
					<Table.Row>
						<Table.Cell>
							<span class="font-medium">{category.name}</span>
						</Table.Cell>
						<Table.Cell>
							<div class="flex flex-wrap gap-1">
								{#if category.subCategories.length === 0}
									<span class="text-muted-foreground text-sm">—</span>
								{:else}
									{#each category.subCategories as sub, i (i)}
										<Badge variant="secondary" class="text-xs">{sub}</Badge>
									{/each}
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-right">
							<div class="flex justify-end gap-1">
								<Button
									variant="ghost"
									size="icon"
									onclick={() => startEdit(category)}
									aria-label="Edit"
								>
									<Pencil class="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => confirmDelete(category)}
									aria-label="Delete"
								>
									<Trash2 class="size-4" />
								</Button>
							</div>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={3} class="py-8 text-center">
							<p class="text-muted-foreground">No categories yet.</p>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<div class="mt-6 flex justify-end">
		<Button onclick={startAdd}>
			<Plus class="mr-2 size-4" />
			Add new category
		</Button>
	</div>
</div>

{#if showForm}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold">{editingId ? 'Edit Category' : 'Add New Category'}</h2>
				<Button variant="ghost" size="icon" onclick={handleCancel} aria-label="Close">
					<X class="size-4" />
				</Button>
			</div>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<div class="space-y-4">
					{#if formError}
						<div
							class="rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
						>
							{formError}
						</div>
					{/if}
					<div>
						<label class="text-sm font-medium" for="categoryName">Category Name</label>
						<Input
							id="categoryName"
							bind:value={categoryName}
							placeholder="e.g., Academic Excellence"
							class="mt-1"
						/>
					</div>

					<div>
						<label class="text-sm font-medium" for="subCategory">Sub-Categories</label>
						<div class="mt-1 flex gap-2">
							<Input
								id="subCategory"
								bind:value={newSubCategory}
								placeholder="Add sub-category"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addSubCategory();
									}
								}}
							/>
							<Button type="button" variant="outline" onclick={addSubCategory}>Add</Button>
						</div>

						{#if subCategories.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each subCategories as sub (sub)}
									<Badge variant="secondary" class="flex items-center gap-1">
										{sub}
										<button
											type="button"
											onclick={() => removeSubCategory(sub)}
											class="text-xs hover:text-red-500"
											aria-label="Remove {sub}"
										>
											×
										</button>
									</Badge>
								{/each}
							</div>
						{/if}
					</div>

					<div class="flex justify-end gap-2 pt-4">
						<Button type="button" variant="outline" onclick={handleCancel}>Cancel</Button>
						<Button type="submit" disabled={isSubmitting || !categoryName.trim()}>
							{editingId ? 'Update' : 'Save'}
						</Button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if categoryToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
			<h2 class="mb-2 text-xl font-semibold">Delete Category</h2>
			<p class="text-muted-foreground mb-4">
				Are you sure you want to delete "{categoryToDelete.name}"?
			</p>

			{#if subCategoryWarning}
				<div class="bg-destructive/10 text-destructive mb-4 rounded-md p-3 text-sm">
					<strong>Warning:</strong>
					This category has evaluations. {subCategoryWarning.count} evaluation(s) will be permanently
					deleted.
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={cancelDelete}>Cancel</Button>
				<Button variant="destructive" onclick={handleDelete} disabled={isSubmitting}>Delete</Button>
			</div>
		</div>
	</div>
{/if}

{#if subCategoryToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-label="Confirm remove sub-category"
		aria-modal="true"
	>
		<div class="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
			<h2 class="mb-2 text-xl font-semibold">Remove Sub-Category</h2>
			<p class="text-muted-foreground mb-4">
				Are you sure you want to remove "{subCategoryToDelete.subCategory}"?
			</p>

			{#if subCategoryWarning}
				<div class="bg-destructive/10 text-destructive mb-4 rounded-md p-3 text-sm">
					<strong>Warning:</strong>
					This sub-category has {subCategoryWarning.count} evaluation(s) that will be permanently deleted.
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={cancelSubCategoryDelete}>Cancel</Button>
				<Button variant="destructive" onclick={confirmSubCategoryDelete} disabled={isSubmitting}>
					Remove
				</Button>
			</div>
		</div>
	</div>
{/if}
