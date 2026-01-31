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

	const isTestMode = $derived(!!data.testRole);

	const currentUser = useQuery(api.users.viewer, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));
	const client = useConvexClient();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const apiAny = api as any;

	const categoriesQuery = useQuery(api.categories.list, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));
	const categories = $derived(categoriesQuery.data ?? []);

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
	}

	async function handleSubmit() {
		if (!categoryName.trim()) return;

		isSubmitting = true;
		formError = '';
		try {
			if (editingId) {
				await client.mutation(api.categories.update, {
					id: editingId,
					name: categoryName,
					subCategories,
					testToken: isTestMode ? 'test-token-admin-mock' : undefined
				});
			} else {
				await client.mutation(api.categories.create, {
					name: categoryName,
					subCategories,
					testToken: isTestMode ? 'test-token-admin-mock' : undefined
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

	function removeSubCategory(sub: string) {
		subCategories = subCategories.filter((s) => s !== sub);
	}

	async function confirmDelete(category: {
		_id: Id<'point_categories'>;
		name: string;
		subCategories: string[];
	}) {
		categoryToDelete = category;
		subCategoryWarning = null;

		if (category.subCategories.length > 0) {
			try {
				const count = await client.query(apiAny.categories.getSubCategoryEvaluationCount, {
					categoryName: category.name,
					subCategory: category.subCategories[0],
					testToken: isTestMode ? 'test-token-admin-mock' : undefined
				});
				if (count && count > 0) {
					subCategoryWarning = {
						subCategory: category.subCategories[0],
						count
					};
				}
			} catch {
				// Error handled silently
			}
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
				id: categoryToDelete._id,
				testToken: isTestMode ? 'test-token-admin-mock' : undefined
			});
			categoryToDelete = null;
		} catch {
			// Error handled silently
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="mx-auto py-8 max-w-6xl container">
	<header class="flex justify-between items-start mb-8">
		<div class="flex items-start gap-6">
			<Button variant="outline" onclick={() => goto('/admin')}>← Back to Admin</Button>
			<div>
				<h1 class="mb-1 font-semibold text-foreground text-2xl">Categories</h1>
				<p class="text-muted-foreground">Manage point categories and sub-categories.</p>
			</div>
		</div>
		<ThemeToggle />
	</header>

	<div class="bg-card shadow-sm border rounded-lg">
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
									<Pencil class="w-4 h-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => confirmDelete(category)}
									aria-label="Delete"
								>
									<Trash2 class="w-4 h-4" />
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

	<div class="flex justify-end mt-6">
		<Button onclick={startAdd}>
			<Plus class="mr-2 w-4 h-4" />
			Add new category
		</Button>
	</div>
</div>

{#if showForm}
	<div
		class="z-50 fixed inset-0 flex justify-center items-center bg-black/50"
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-background shadow-lg p-6 rounded-lg w-full max-w-md">
			<div class="flex justify-between items-center mb-4">
				<h2 class="font-semibold text-xl">{editingId ? 'Edit Category' : 'Add New Category'}</h2>
				<Button variant="ghost" size="icon" onclick={handleCancel} aria-label="Close">
					<X class="w-4 h-4" />
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
							class="bg-red-50 dark:bg-red-950 p-3 rounded text-red-600 dark:text-red-400 text-sm"
						>
							{formError}
						</div>
					{/if}
					<div>
						<label class="font-medium text-sm" for="categoryName">Category Name</label>
						<Input
							id="categoryName"
							bind:value={categoryName}
							placeholder="e.g., Academic Excellence"
							class="mt-1"
						/>
					</div>

					<div>
						<label class="font-medium text-sm" for="subCategory">Sub-Categories</label>
						<div class="flex gap-2 mt-1">
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
							<div class="flex flex-wrap gap-1 mt-2">
								{#each subCategories as sub (sub)}
									<Badge variant="secondary" class="flex items-center gap-1">
										{sub}
										<button
											type="button"
											onclick={() => removeSubCategory(sub)}
											class="hover:text-red-500 text-xs"
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
		class="z-50 fixed inset-0 flex justify-center items-center bg-black/50"
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-background shadow-lg p-6 rounded-lg w-full max-w-md">
			<h2 class="mb-2 font-semibold text-xl">Delete Category</h2>
			<p class="mb-4 text-muted-foreground">
				Are you sure you want to delete "{categoryToDelete.name}"?
			</p>

			{#if subCategoryWarning}
				<div class="bg-destructive/10 mb-4 p-3 rounded-md text-destructive text-sm">
					<strong>Warning:</strong>
					This category has sub-categories with evaluations.
					{subCategoryWarning.count} evaluation(s) will be affected.
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={cancelDelete}>Cancel</Button>
				<Button variant="destructive" onclick={handleDelete} disabled={isSubmitting}>Delete</Button>
			</div>
		</div>
	</div>
{/if}
