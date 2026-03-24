<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Plus, Trash2, Pencil, X, Check, Info } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import CategoryInfoCard from '$lib/components/CategoryInfoCard.svelte';

	const client = useConvexClient();

	const categoriesQuery = useQuery(api.categories.list, () => ({}));
	const categories = $derived(categoriesQuery.data ?? []);

	let showForm = $state(false);
	let editingId = $state<Id<'point_categories'> | null>(null);
	let categoryName = $state('');
	let casCreativity = $state(false);
	let casActivity = $state(false);
	let casService = $state(false);
	let meritCriteria = $state<string[]>(['']);
	let demeritCriteria = $state<string[]>(['']);
	let isSubmitting = $state(false);
	let formError = $state('');
	let categoryToDelete = $state<{
		_id: Id<'point_categories'>;
		name: string;
	} | null>(null);
	let evaluationWarning = $state<number | null>(null);
	let toastMessage = $state<string | null>(null);
	let toastTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
	let expandedCategory = $state<Id<'point_categories'> | null>(null);

	function showToast(message: string) {
		toastMessage = message;
		if (toastTimeout) clearTimeout(toastTimeout);
		toastTimeout = setTimeout(() => {
			toastMessage = null;
		}, 3000);
	}

	function startAdd() {
		categoryName = '';
		casCreativity = false;
		casActivity = false;
		casService = false;
		meritCriteria = [''];
		demeritCriteria = [''];
		editingId = null;
		showForm = true;
	}

	function startEdit(category: {
		_id: Id<'point_categories'>;
		name: string;
		casAlignment?: ('Creativity' | 'Activity' | 'Service')[];
		meritCriteria?: string[];
		demeritCriteria?: string[];
	}) {
		editingId = category._id;
		categoryName = category.name;
		casCreativity = category.casAlignment?.includes('Creativity') ?? false;
		casActivity = category.casAlignment?.includes('Activity') ?? false;
		casService = category.casAlignment?.includes('Service') ?? false;
		meritCriteria = category.meritCriteria?.length ? [...category.meritCriteria] : [''];
		demeritCriteria = category.demeritCriteria?.length ? [...category.demeritCriteria] : [''];
		showForm = true;
	}

	function handleCancel() {
		showForm = false;
		editingId = null;
		categoryName = '';
		casCreativity = false;
		casActivity = false;
		casService = false;
		meritCriteria = [''];
		demeritCriteria = [''];
	}

	function validateForm(): boolean {
		if (!categoryName.trim()) {
			formError = 'Category name is required';
			return false;
		}
		if (!casCreativity && !casActivity && !casService) {
			formError = 'At least one CAS Alignment must be selected';
			return false;
		}
		formError = '';
		return true;
	}

	function addMeritCriterion() {
		meritCriteria = [...meritCriteria, ''];
	}

	function removeMeritCriterion(index: number) {
		meritCriteria = meritCriteria.filter((_, i) => i !== index);
		if (meritCriteria.length === 0) {
			meritCriteria = [''];
		}
	}

	function updateMeritCriterion(index: number, value: string) {
		meritCriteria = meritCriteria.map((c, i) => (i === index ? value : c));
	}

	function addDemeritCriterion() {
		demeritCriteria = [...demeritCriteria, ''];
	}

	function removeDemeritCriterion(index: number) {
		demeritCriteria = demeritCriteria.filter((_, i) => i !== index);
		if (demeritCriteria.length === 0) {
			demeritCriteria = [''];
		}
	}

	function updateDemeritCriterion(index: number, value: string) {
		demeritCriteria = demeritCriteria.map((c, i) => (i === index ? value : c));
	}

	async function handleSubmit() {
		if (!validateForm()) return;

		isSubmitting = true;
		try {
			const filteredMeritCriteria = meritCriteria.map((c) => c.trim()).filter((c) => c.length > 0);
			const filteredDemeritCriteria = demeritCriteria
				.map((c) => c.trim())
				.filter((c) => c.length > 0);

			const casAlignment: ('Creativity' | 'Activity' | 'Service')[] = [];
			if (casCreativity) casAlignment.push('Creativity');
			if (casActivity) casAlignment.push('Activity');
			if (casService) casAlignment.push('Service');

			if (editingId) {
				// Get evaluation count before update for toast notification
				const evalCount = await client.query(api.categories.getEvaluationCount, {
					categoryId: editingId
				});

				await client.mutation(api.categories.update, {
					id: editingId,
					name: categoryName,
					casAlignment,
					meritCriteria: filteredMeritCriteria.length > 0 ? filteredMeritCriteria : undefined,
					demeritCriteria: filteredDemeritCriteria.length > 0 ? filteredDemeritCriteria : undefined
				});

				// Show toast if there are evaluations affected
				if (evalCount > 0) {
					showToast(`Category updated. ${evalCount} evaluation(s) now display the new name.`);
				}
			} else {
				await client.mutation(api.categories.create, {
					name: categoryName,
					casAlignment,
					meritCriteria: filteredMeritCriteria.length > 0 ? filteredMeritCriteria : undefined,
					demeritCriteria: filteredDemeritCriteria.length > 0 ? filteredDemeritCriteria : undefined
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

	function toggleExpand(categoryId: Id<'point_categories'>) {
		expandedCategory = expandedCategory === categoryId ? null : categoryId;
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

<div class="container mx-auto w-fit py-8">
	<div class="bg-card rounded-lg border shadow-sm">
		<Table.Root aria-label="Categories">
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="w-auto">Category</Table.Head>
					<Table.Head class="w-32 text-center">CAS Alignment</Table.Head>
					<Table.Head class="w-32 text-center">Criteria</Table.Head>
					<Table.Head class="w-32 text-center">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each categories as category (category._id)}
					<Table.Row>
						<Table.Cell>
							<span class="font-medium">{category.name}</span>
						</Table.Cell>
						<Table.Cell class="text-center">
							{#if category.casAlignment && category.casAlignment.length > 0}
								<span class="text-sm">{category.casAlignment.join(', ')}</span>
							{:else}
								<span class="text-muted-foreground text-sm">-</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-center">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => toggleExpand(category._id)}
								aria-label={expandedCategory === category._id ? 'Hide criteria' : 'Show criteria'}
							>
								<Info class="mr-1 size-4" />
								{expandedCategory === category._id ? 'Hide' : 'View'}
							</Button>
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
					{#if expandedCategory === category._id}
						<Table.Row>
							<Table.Cell colspan={4} class="p-0">
								<div class="p-4">
									<CategoryInfoCard {category} />
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}
				{:else}
					<Table.Row>
						<Table.Cell colspan={4} class="py-8 text-center">
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
		class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50"
		role="dialog"
		aria-label={editingId ? 'Edit category' : 'Add new category'}
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) handleCancel();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') handleCancel();
		}}
	>
		<div class="bg-background my-8 w-full max-w-3xl rounded-lg p-6 shadow-lg">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold">{editingId ? 'Edit Category' : 'Add New Category'}</h2>
				<Button variant="ghost" size="icon" onclick={handleCancel} aria-label="Close">
					<X class="size-4" />
				</Button>
			</div>

			<form
				class="max-h-[70vh] overflow-y-auto"
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

					<Card.Root>
						<Card.Content class="space-y-4">
							<div>
								<label class="text-sm font-medium" for="categoryName">Category Name *</label>
								<Input
									id="categoryName"
									bind:value={categoryName}
									placeholder="e.g., Responsibility (責任)"
								/>
							</div>
							<fieldset>
								<legend class="text-sm font-medium">CAS Alignment *</legend>
								<p class="text-muted-foreground mb-2 text-xs">Select at least one</p>
								<div class="flex gap-4">
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											bind:checked={casCreativity}
											class="border-input focus:ring-primary text-primary size-4 cursor-pointer rounded"
										/>
										<span class="text-sm">Creativity</span>
									</label>
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											bind:checked={casActivity}
											class="border-input focus:ring-primary text-primary size-4 cursor-pointer rounded"
										/>
										<span class="text-sm">Activity</span>
									</label>
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											bind:checked={casService}
											class="border-input focus:ring-primary text-primary size-4 cursor-pointer rounded"
										/>
										<span class="text-sm">Service</span>
									</label>
								</div>
							</fieldset>
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Content>
							<div class="grid grid-cols-2 gap-2">
								<!-- Merit Criteria -->
								<fieldset>
									<div class="mb-2 flex items-center justify-between">
										<legend class="text-sm font-medium text-emerald-600">
											Merit Criteria (+)
										</legend>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={addMeritCriterion}
											class="h-7 px-2"
										>
											<Plus class="mr-1 size-3" />
											Add
										</Button>
									</div>
									<div class="space-y-2">
										{#each meritCriteria as criterion, index (index)}
											<div class="flex gap-2">
												<Input
													value={criterion}
													oninput={(e) => updateMeritCriterion(index, e.currentTarget.value)}
													placeholder="Enter criterion..."
													class="flex-1"
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onclick={() => removeMeritCriterion(index)}
													class="size-9 shrink-0"
													aria-label="Remove criterion"
												>
													<Trash2 class="size-4" />
												</Button>
											</div>
										{/each}
									</div>
									<p class="text-muted-foreground mt-2 text-xs">
										These appear when awarding positive points.
									</p>
								</fieldset>

								<!-- Demerit Criteria -->
								<fieldset>
									<div class="mb-2 flex items-center justify-between">
										<legend class="text-sm font-medium text-red-600"> Demerit Criteria (-) </legend>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={addDemeritCriterion}
											class="h-7 px-2"
										>
											<Plus class="mr-1 size-3" />
											Add
										</Button>
									</div>
									<div class="space-y-2">
										{#each demeritCriteria as criterion, index (index)}
											<div class="flex gap-2">
												<Input
													value={criterion}
													oninput={(e) => updateDemeritCriterion(index, e.currentTarget.value)}
													placeholder="Enter criterion..."
													class="flex-1"
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onclick={() => removeDemeritCriterion(index)}
													class="size-9 shrink-0"
													aria-label="Remove criterion"
												>
													<Trash2 class="size-4" />
												</Button>
											</div>
										{/each}
									</div>
									<p class="text-muted-foreground mt-2 text-xs">
										These appear when awarding negative points.
									</p>
								</fieldset>
							</div>
						</Card.Content>
					</Card.Root>

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
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) cancelDelete();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') cancelDelete();
		}}
	>
		<div class="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
			<h2 class="mb-2 text-xl font-semibold">Delete Category</h2>
			<p class="text-muted-foreground mb-4">
				Are you sure you want to delete "{categoryToDelete.name}"?
			</p>

			{#if evaluationWarning}
				<div class="bg-destructive/10 text-destructive mb-4 rounded-md p-3 text-sm">
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
