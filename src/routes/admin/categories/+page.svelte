<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { goto } from '$app/navigation';
	import { Plus, Trash2, Pencil, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';

	const currentUser = useQuery(api.users.viewer, {});
	const categoriesQuery = useQuery(api.categories.list, {});
	const client = useConvexClient();
	const apiAny = api as any;

	let showForm = $state(false);
	let editingId = $state<Id<'point_categories'> | null>(null);
	let originalCategoryName = $state('');
	let categoryName = $state('');
	let subCategories = $state<string[]>([]);
	let newSubCategory = $state('');
	let isSubmitting = $state(false);
	let categoryToDelete = $state<any>(null);
	let relatedCount = $state(0);
	let subCategoryWarning = $state<{ subCategory: string; count: number } | null>(null);

	function startAdd() {
		categoryName = '';
		subCategories = [];
		editingId = null;
		originalCategoryName = '';
		showForm = true;
	}

	function startEdit(category: any) {
		categoryName = category.name;
		originalCategoryName = category.name;
		subCategories = [...category.subCategories];
		editingId = category._id;
		showForm = true;
	}

	function cancelForm() {
		showForm = false;
		categoryName = '';
		subCategories = [];
		editingId = null;
		originalCategoryName = '';
		subCategoryWarning = null;
	}

	async function removeSubCategory(index: number) {
		const subToRemove = subCategories[index];

		if (originalCategoryName && editingId) {
			const count = await client.query(apiAny.categories.getSubCategoryEvaluationCount, {
				categoryName: originalCategoryName,
				subCategory: subToRemove
			});

			if (count > 0) {
				subCategoryWarning = { subCategory: subToRemove, count };
				return;
			}
		}

		subCategories = subCategories.filter((_, i) => i !== index);
	}

	function confirmRemoveSubCategory() {
		if (!subCategoryWarning) return;
		const index = subCategories.indexOf(subCategoryWarning!.subCategory);
		if (index > -1) {
			subCategories = subCategories.filter((_, i) => i !== index);
		}
		subCategoryWarning = null;
	}

	function addSubCategory() {
		if (newSubCategory.trim()) {
			subCategories = [...subCategories, newSubCategory.trim()];
			newSubCategory = '';
		}
	}

	async function handleSubmit() {
		if (!categoryName.trim()) return;

		isSubmitting = true;
		try {
			if (editingId) {
				await client.mutation(api.categories.update, {
					id: editingId,
					name: categoryName.trim(),
					subCategories
				});
			} else {
				await client.mutation(api.categories.create, {
					name: categoryName.trim(),
					subCategories
				});
			}
			cancelForm();
		} catch (err) {
			console.error(err);
		} finally {
			isSubmitting = false;
		}
	}

	function confirmDelete(category: any) {
		categoryToDelete = category;
		relatedCount = 0;
		checkRelatedCount();
	}

	async function checkRelatedCount() {
		if (!categoryToDelete) return;
		const count = await client.query(apiAny.categories.getEvaluationCount, {
			categoryName: categoryToDelete.name
		});
		relatedCount = count;
	}

	async function handleDelete() {
		if (!categoryToDelete) return;

		isSubmitting = true;
		try {
			await client.mutation(api.categories.remove, {
				id: categoryToDelete._id
			});
			categoryToDelete = null;
		} catch (err) {
			console.error(err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="container mx-auto max-w-6xl py-8">
	<header class="mb-8 flex items-start justify-between">
		<div class="flex items-start gap-6">
			<Button variant="outline" onclick={() => goto('/admin')}>← Back to Admin</Button>
			<div>
				<h1 class="text-foreground mb-1 text-2xl font-semibold">Categories</h1>
				<p class="text-muted-foreground">Manage point categories and sub-categories.</p>
			</div>
		</div>
		<ThemeToggle />
	</header>

	<div class="bg-card rounded-lg border shadow-sm">
		{#if categoriesQuery.isLoading}
			<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
				<div class="border-muted border-t-primary h-8 w-8 animate-spin rounded-full border-3"></div>
				<p>Loading categories...</p>
			</div>
		{:else if categoriesQuery.data}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-50">Category</Table.Head>
						<Table.Head>Sub-Categories</Table.Head>
						<Table.Head class="w-25 text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each categoriesQuery.data as category}
						<Table.Row>
							<Table.Cell>
								<span class="font-medium">{category.name}</span>
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-wrap gap-1">
									{#if category.subCategories.length === 0}
										<span class="text-muted-foreground text-sm">—</span>
									{:else}
										{#each category.subCategories as sub}
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
										title="Edit"
									>
										<Pencil class="h-4 w-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onclick={() => confirmDelete(category)}
										title="Delete"
									>
										<Trash2 class="text-destructive h-4 w-4" />
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>

			{#if categoriesQuery.data.length === 0}
				<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
					<p>No categories yet.</p>
					<Button onclick={startAdd}>
						<Plus class="mr-2 h-4 w-4" />
						Add First Category
					</Button>
				</div>
			{/if}
		{/if}
	</div>

	{#if showForm}
		<div class="bg-card mt-6 rounded-lg border p-6 shadow-sm">
			<h2 class="mb-4 text-lg font-semibold">{editingId ? 'Edit Category' : 'Add New Category'}</h2>

			<div class="space-y-4">
				<div>
					<label for="category-name" class="mb-2 block text-sm font-medium">Category Name</label>
					<Input
						id="category-name"
						bind:value={categoryName}
						placeholder="e.g., Creativity"
						class="max-w-md"
					/>
				</div>

				<div>
					<label for="sub-category-input" class="mb-2 block text-sm font-medium"
						>Sub-Categories (optional)</label
					>
					{#if subCategories.length > 0}
						<div class="mb-3 flex flex-wrap gap-2">
							{#each subCategories as sub, i}
								<Badge variant="secondary" class="flex items-center gap-1 pl-2">
									{sub}
									<Button
										variant="ghost"
										size="icon"
										class="h-4 w-4 p-0 hover:bg-transparent"
										onclick={() => removeSubCategory(i)}
									>
										<X class="h-3 w-3" />
									</Button>
								</Badge>
							{/each}
						</div>
					{/if}

					{#if subCategoryWarning}
						<div
							class="mb-3 rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950"
						>
							<p class="text-sm text-yellow-800 dark:text-yellow-200">
								<strong>{subCategoryWarning.count}</strong> evaluation{subCategoryWarning.count !==
								1
									? 's'
									: ''} use "{subCategoryWarning.subCategory}". Removing it will make those
								evaluations show an invalid sub-category.
							</p>
							<div class="mt-2 flex gap-2">
								<Button size="sm" variant="outline" onclick={() => (subCategoryWarning = null)}>
									Cancel
								</Button>
								<Button size="sm" onclick={confirmRemoveSubCategory}>Remove Anyway</Button>
							</div>
						</div>
					{/if}

					<div class="flex max-w-md gap-2">
						<Input
							bind:value={newSubCategory}
							placeholder="Add sub-category"
							onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubCategory())}
						/>
						<Button variant="outline" onclick={addSubCategory}>Add</Button>
					</div>
				</div>

				<div class="flex gap-2 pt-4">
					<Button onclick={handleSubmit} disabled={!categoryName.trim() || isSubmitting}>
						{isSubmitting ? 'Saving...' : 'Save'}
					</Button>
					<Button variant="outline" onclick={cancelForm} disabled={isSubmitting}>Cancel</Button>
				</div>
			</div>
		</div>
	{:else}
		<Button class="mt-6" onclick={startAdd}>
			<Plus class="mr-2 h-4 w-4" />
			Add Category
		</Button>
	{/if}

	{#if categoryToDelete}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onclick={() => (categoryToDelete = null)}
			onkeydown={(e) => e.key === 'Escape' && (categoryToDelete = null)}
			role="button"
			tabindex="0"
		>
			<div
				class="bg-popover text-popover-foreground mx-4 w-full max-w-md rounded-lg border p-6 shadow-lg"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.key === 'Escape' && (categoryToDelete = null)}
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				<h3 class="mb-2 text-lg font-semibold">Delete Category</h3>
				<p class="text-muted-foreground mb-4">
					Are you sure you want to delete "{categoryToDelete.name}"?
				</p>
				{#if categoryToDelete.subCategories.length > 0 || relatedCount > 0}
					<div
						class="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950"
					>
						{#if categoryToDelete.subCategories.length > 0}
							<p class="text-sm text-yellow-800 dark:text-yellow-200">
								This category has <strong>{categoryToDelete.subCategories.length}</strong>
								sub-category{categoryToDelete.subCategories.length !== 1 ? 's' : ''}.
							</p>
						{/if}
						{#if relatedCount > 0}
							<p class="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
								This will also delete <strong>{relatedCount}</strong> related evaluation record{relatedCount !==
								1
									? 's'
									: ''}.
							</p>
						{/if}
					</div>
				{:else}
					<p class="text-muted-foreground mb-4 text-sm">This action cannot be undone.</p>
				{/if}
				<div class="flex justify-end gap-2">
					<Button variant="outline" onclick={() => (categoryToDelete = null)}>Cancel</Button>
					<Button variant="destructive" onclick={handleDelete} disabled={isSubmitting}>
						{isSubmitting ? 'Deleting...' : 'Delete'}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
