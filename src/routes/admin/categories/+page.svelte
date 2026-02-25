<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Plus, Trash2, Pencil, X, Check } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';

	const client = useConvexClient();

	const categoriesQuery = useQuery(api.categories.list, () => ({}));
	const categories = $derived(categoriesQuery.data ?? []);

	let showForm = $state(false);
	let editingId = $state<Id<'point_categories'> | null>(null);
	let categoryName = $state('');
	let isSubmitting = $state(false);
	let formError = $state('');
	let categoryToDelete = $state<{
		_id: Id<'point_categories'>;
		name: string;
	} | null>(null);
	let evaluationWarning = $state<number | null>(null);
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
		editingId = null;
		showForm = true;
	}

	function startEdit(category: { _id: Id<'point_categories'>; name: string }) {
		editingId = category._id;
		categoryName = category.name;
		showForm = true;
	}

	function handleCancel() {
		showForm = false;
		editingId = null;
		categoryName = '';
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
					name: categoryName
				});

				// Show toast if there are evaluations affected
				if (evalCount > 0) {
					showToast(`Category updated. ${evalCount} evaluation(s) now display the new name.`);
				}
			} else {
				await client.mutation(api.categories.create, {
					name: categoryName
				});
			}
			handleCancel();
		} catch (err) {
			formError = (err as Error).message || 'Failed to save category';
		} finally {
			isSubmitting = false;
		}
	}

	async function confirmDelete(category: { _id: Id<'point_categories'>; name: string }) {
		categoryToDelete = category;
		evaluationWarning = null;

		// Check for evaluations with this category
		try {
			const count = await client.query(api.categories.getEvaluationCount, {
				categoryId: category._id
			});
			if (count && count > 0) {
				evaluationWarning = count;
			}
		} catch {
			// Error handled silently
		}
	}

	function cancelDelete() {
		categoryToDelete = null;
		evaluationWarning = null;
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
		class="right-4 bottom-4 z-50 fixed flex items-center gap-2 bg-green-600 shadow-lg px-4 py-3 rounded-lg text-white"
		role="alert"
	>
		<Check class="size-5" />
		<span>{toastMessage}</span>
	</div>
{/if}

<div class="mx-auto py-8 max-w-xl container">
	<div class="bg-card shadow-sm border rounded-lg">
		<Table.Root aria-label="Categories">
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="w-auto">Category</Table.Head>
					<Table.Head class="w-25 text-center">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each categories as category (category._id)}
					<Table.Row>
						<Table.Cell>
							<span class="font-medium">{category.name}</span>
						</Table.Cell>
						<Table.Cell class="text-center">
							<div class="flex justify-center gap-1">
								<Button
									variant="outline"
									size="icon"
									onclick={() => startEdit(category)}
									aria-label="Edit"
								>
									<Pencil class="size-4" />
								</Button>
								<Button
									variant="outline"
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
						<Table.Cell colspan={2} class="py-8 text-center">
							<p class="text-muted-foreground">No categories yet.</p>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<div class="flex justify-end mt-6">
		<Button onclick={startAdd}>
			<Plus class="mr-2 size-4" />
			Add new category
		</Button>
	</div>
</div>

{#if showForm}
	<div
		class="z-50 fixed inset-0 flex justify-center items-center bg-black/50"
		role="dialog"
		aria-label="Edit category"
		aria-modal="true"
	>
		<div class="bg-background shadow-lg p-6 rounded-lg w-full max-w-md">
			<div class="flex justify-between items-center mb-4">
				<h2 class="font-semibold text-xl">{editingId ? 'Edit Category' : 'Add New Category'}</h2>
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

			{#if evaluationWarning}
				<div class="bg-destructive/10 mb-4 p-3 rounded-md text-destructive text-sm">
					<strong>Warning:</strong>
					This category has evaluations. {evaluationWarning} evaluation(s) will be permanently deleted.
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={cancelDelete}>Cancel</Button>
				<Button variant="destructive" onclick={handleDelete} disabled={isSubmitting}>Delete</Button>
			</div>
		</div>
	</div>
{/if}
