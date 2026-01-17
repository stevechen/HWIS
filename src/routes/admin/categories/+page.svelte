<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { Plus, Trash2, Pencil, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';

	let {
		data
	}: {
		data: { testRole?: 'teacher' | 'admin' | 'super' };
	} = $props();

	const currentUser = useQuery(api.users.viewer, {});
	const client = useConvexClient();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const apiAny = api as any;

	let isTestMode = $state(false);
	let categories = $state<
		Array<{
			_id: Id<'point_categories'>;
			name: string;
			subCategories: string[];
			_creationTime: number;
		}>
	>([]);
	let categoriesLoading = $state(true);

	let isInitialLoad = $state(true);

	async function loadCategories(force = false) {
		if (!isInitialLoad && !force) return;
		categoriesLoading = true;

		if ((isTestMode || data?.testRole) && isInitialLoad) {
			try {
				await client.mutation(api.categories.seed, {});
			} catch (err) {
				console.log('Seed categories skipped or failed:', err);
			}
		}

		try {
			const result = await client.query(api.categories.list, {});
			categories = result || [];
		} catch (err) {
			console.error('Failed to load categories:', err);
			categories = [];
		} finally {
			categoriesLoading = false;
			isInitialLoad = false;
		}
	}

	$effect(() => {
		if (!browser) return;
		isTestMode =
			document.cookie.split('; ').find((row) => row.startsWith('hwis_test_auth=')) !== undefined;
	});

	$effect(() => {
		loadCategories();
	});

	$effect(() => {
		if (isTestMode || data?.testRole) return;
		if (browser && currentUser.isLoading === false) {
			if (currentUser.data?.role !== 'admin' && currentUser.data?.role !== 'super') {
				goto('/');
			}
		}
	});

	let showForm = $state(false);
	let editingId = $state<Id<'point_categories'> | null>(null);
	let originalCategoryName = $state('');
	let categoryName = $state('');
	let subCategories = $state<string[]>([]);
	let newSubCategory = $state('');
	let isSubmitting = $state(false);
	let categoryToDelete = $state<{
		_id: Id<'point_categories'>;
		name: string;
		subCategories: string[];
	} | null>(null);
	let relatedCount = $state(0);
	let subCategoryWarning = $state<{ subCategory: string; count: number } | null>(null);

	function startAdd() {
		categoryName = '';
		subCategories = [];
		editingId = null;
		originalCategoryName = '';
		showForm = true;
	}

	function startEdit(category: {
		_id: Id<'point_categories'>;
		name: string;
		subCategories: string[];
	}) {
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
			await loadCategories(true);
		} catch (err) {
			console.error(err);
		} finally {
			isSubmitting = false;
		}
	}

	function confirmDelete(category: {
		_id: Id<'point_categories'>;
		name: string;
		subCategories: string[];
	}) {
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
			await loadCategories(true);
		} catch (err) {
			console.error(err);
		} finally {
			isSubmitting = false;
		}
	}
	function handleBackToAdmin() {
		void goto('/admin');
	}
</script>

<div class="container mx-auto max-w-6xl py-8">
	<header class="mb-8 flex items-start justify-between">
		<div class="flex items-start gap-6">
			<Button variant="outline" onclick={handleBackToAdmin}>← Back to Admin</Button>
			<div>
				<h1 class="text-foreground mb-1 text-2xl font-semibold">Categories</h1>
				<p class="text-muted-foreground">Manage point categories and sub-categories.</p>
			</div>
		</div>
		<ThemeToggle />
	</header>

	<div class="bg-card rounded-lg border shadow-sm">
		{#if categoriesLoading}
			<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
				<div class="border-muted border-t-primary h-8 w-8 animate-spin rounded-full border-3"></div>
				<p>Loading categories...</p>
			</div>
		{:else if categories.length > 0}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-50">Category</Table.Head>
						<Table.Head>Sub-Categories</Table.Head>
						<Table.Head class="w-25 text-right">Actions</Table.Head>
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
										<Pencil class="h-4 w-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onclick={() => confirmDelete(category)}
										aria-label="Delete"
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
				<p class="text-lg font-medium">No categories yet.</p>
				<p class="text-sm">Create your first category to get started.</p>
			</div>
		{/if}
	</div>

	<div class="mt-6 flex justify-end">
		<Button onclick={startAdd}>
			<Plus class="mr-2 h-4 w-4" />
			Add Category
		</Button>
	</div>
</div>

{#if showForm}
	<div
		class="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="category-form-title"
	>
		<div class="bg-card w-full max-w-md rounded-lg border p-6 shadow-lg">
			<h2 id="category-form-title" class="text-foreground mb-4 text-xl font-semibold">
				{editingId ? 'Edit Category' : 'Add New Category'}
			</h2>

			<div class="space-y-4">
				<div>
					<label class="text-foreground mb-2 block text-sm font-medium" for="category-name">
						Category Name
					</label>
					<Input
						id="category-name"
						bind:value={categoryName}
						placeholder="e.g., Creativity"
						disabled={isSubmitting}
					/>
				</div>

				<div>
					<label class="text-foreground mb-2 block text-sm font-medium">
						Sub-Categories (optional)
					</label>
					<div class="flex gap-2">
						<Input
							bind:value={newSubCategory}
							placeholder="Add sub-category"
							disabled={isSubmitting}
							onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubCategory())}
						/>
						<Button variant="secondary" onclick={addSubCategory} disabled={isSubmitting}>Add</Button
						>
					</div>

					{#if subCategories.length > 0}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each subCategories as sub, i (i)}
								<Badge variant="secondary" class="flex items-center gap-1">
									{sub}
									<button
										class="text-muted-foreground hover:text-foreground ml-1"
										onclick={() => {
											subCategories = subCategories.filter((_, idx) => idx !== i);
										}}
									>
										<X class="h-3 w-3" />
									</button>
								</Badge>
							{/each}
						</div>
					{/if}
				</div>

				{#if subCategoryWarning}
					<div
						class="rounded border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
					>
						<p class="font-medium">Warning: Sub-category has evaluations</p>
						<p class="text-sm">
							{subCategoryWarning.subCategory} has {subCategoryWarning.count} related evaluations. Removing
							it will also remove those evaluations.
						</p>
						<div class="mt-2 flex gap-2">
							<Button variant="destructive" size="sm" onclick={confirmRemoveSubCategory}>
								Remove Anyway
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={() => {
									subCategoryWarning = null;
								}}
							>
								Cancel
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<Button variant="outline" onclick={cancelForm} disabled={isSubmitting}>Cancel</Button>
				<Button onclick={handleSubmit} disabled={isSubmitting}>
					{#if isSubmitting}
						Saving...
					{:else}
						Save
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}

{#if categoryToDelete}
	<div
		class="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-dialog-title"
	>
		<div class="bg-card w-full max-w-md rounded-lg border p-6 shadow-lg">
			<h2 id="delete-dialog-title" class="text-foreground mb-4 text-xl font-semibold">
				Delete Category
			</h2>

			{#if relatedCount > 0}
				<div
					class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
				>
					<p class="font-medium">Warning: Category has evaluations</p>
					<p class="text-sm">
						This category has {relatedCount} related evaluations. Deleting it will also delete those evaluations.
					</p>
				</div>
			{/if}

			<p class="text-muted-foreground mb-4">
				Are you sure you want to delete "{categoryToDelete.name}"? This action cannot be undone.
			</p>

			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={() => (categoryToDelete = null)}>Cancel</Button>
				<Button variant="destructive" onclick={handleDelete} disabled={isSubmitting}>
					{#if isSubmitting}
						Deleting...
					{:else}
						Delete
					{/if}
				</Button>
			</div>
		</div>
	</div>
{/if}
