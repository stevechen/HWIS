<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import type { RecentBatch } from '$convex/shared/recentActions';
	import { isMixedBatch, valueChipClass, formatBatchTime } from '$lib/evaluations/recentActions';

	interface Props {
		open: boolean;
		batch: RecentBatch | null;
		onClose: () => void;
		dialogTestId?: string;
		cancelTestId?: string;
		deleteTestId?: string;
		saveTestId?: string;
	}

	let {
		open = $bindable(),
		batch,
		onClose,
		dialogTestId,
		cancelTestId,
		deleteTestId,
		saveTestId
	}: Props = $props();

	const client = useConvexClient();
	const categoriesQuery = useQuery(api.categories.list, () => (open ? {} : 'skip'));

	let checked = $state<Record<string, boolean>>({});
	let editValue = $state(1);
	let editCategoryId = $state('');
	let editDetails = $state('');
	let busy = $state(false);

	$effect(() => {
		if (batch) {
			checked = Object.fromEntries(batch.evaluations.map((e) => [e.id, true]));
			editValue = batch.evaluations[0]?.value ?? 1;
			editCategoryId = batch.evaluations[0]?.categoryId ?? '';
			editDetails = batch.evaluations[0]?.details ?? '';
		}
	});

	const checkedEvaluations = $derived(batch ? batch.evaluations.filter((e) => checked[e.id]) : []);
	const mixed = $derived(batch ? isMixedBatch(batch) : false);

	async function handleSave(): Promise<void> {
		if (!batch || checkedEvaluations.length === 0) return;
		busy = true;
		try {
			await client.mutation(api.evaluations.updateMany, {
				ids: checkedEvaluations.map((e) => e.id as Id<'evaluations'>),
				value: editValue,
				categoryId: editCategoryId as Id<'point_categories'>,
				details: editDetails
			});
			onClose();
		} finally {
			busy = false;
		}
	}

	async function handleDeleteSelected(): Promise<void> {
		if (!batch || checkedEvaluations.length === 0) return;
		busy = true;
		try {
			await client.mutation(api.evaluations.removeMany, {
				ids: checkedEvaluations.map((e) => e.id as Id<'evaluations'>)
			});
			onClose();
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		aria-label="Edit Batch"
		class="max-h-[90vh] overflow-y-auto"
		testId={dialogTestId}
	>
		<Dialog.Header>
			<Dialog.Title>Edit Batch</Dialog.Title>
			{#if batch}
				<Dialog.Description>
					{formatBatchTime(batch.createdAt)} · {batch.evaluations.length} student{batch.evaluations
						.length === 1
						? ''
						: 's'}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if batch}
			<div class="space-y-4 py-4">
				{#if mixed}
					<p
						class="rounded-md bg-amber-100/60 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
					>
						This batch is already partially edited. The points/category/details below apply to the
						students you keep checked.
					</p>
				{/if}

				<div class="space-y-2">
					<p class="text-sm font-medium">
						Students ({checkedEvaluations.length} selected)
					</p>
					<div class="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
						{#each batch.evaluations as e (e.id)}
							<label
								class="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
							>
								<input
									type="checkbox"
									checked={checked[e.id] ?? false}
									onchange={() => (checked[e.id] = !checked[e.id])}
								/>
								<span class="flex-1">{e.englishName}</span>
								{#if e.className}
									<span class="text-muted-foreground text-xs">{e.className}</span>
								{/if}
								<span
									class={`inline-flex h-5 min-w-6 items-center justify-center rounded px-1 text-xs font-medium ${valueChipClass(e.value)}`}
								>
									{e.value > 0 ? `+${e.value}` : e.value}
								</span>
							</label>
						{/each}
					</div>
				</div>

				<fieldset class="space-y-2">
					<legend class="text-sm font-medium">Points</legend>
					<div class="grid grid-cols-4 gap-2" role="group" aria-label="Point values">
						{#each [-2, -1, 1, 2] as p (p)}
							<Button
								type="button"
								variant="outline"
								class={[
									(editValue === p &&
										p > 0 &&
										'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90 dark:border-emerald-500 dark:bg-emerald-500') ||
										(editValue === p &&
											'border-red-600 bg-red-600 text-white hover:bg-red-600/90 dark:border-red-500 dark:bg-red-500') ||
										(p > 0 &&
											'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300') ||
										'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300'
								]}
								onclick={() => (editValue = p)}
								aria-label={p > 0 ? `Award ${p} points` : `Deduct ${Math.abs(p)} points`}
							>
								{p > 0 ? `+${p}` : p}
							</Button>
						{/each}
					</div>
				</fieldset>

				<div class="space-y-2">
					<label class="text-sm font-medium" for="batch-category">Category</label>
					<NativeSelect id="batch-category" bind:value={editCategoryId} disabled={busy}>
						{#each categoriesQuery.data || [] as cat (cat._id)}
							<option value={cat._id}>{cat.name}</option>
						{/each}
					</NativeSelect>
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium" for="batch-details">Details / Comments</label>
					<textarea
						id="batch-details"
						bind:value={editDetails}
						placeholder="Enter specific details..."
						class="bg-background border-input w-full rounded-md border p-3 text-sm"
						rows="3"
						aria-label="Evaluation details"
					></textarea>
				</div>
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={onClose} disabled={busy} testId={cancelTestId}
				>Cancel</Button
			>
			<Button
				variant="destructive"
				onclick={handleDeleteSelected}
				disabled={busy || checkedEvaluations.length === 0}
				testId={deleteTestId}
			>
				Delete selected ({checkedEvaluations.length})
			</Button>
			<Button
				onclick={handleSave}
				disabled={busy || checkedEvaluations.length === 0}
				testId={saveTestId}
			>
				{busy ? 'Saving...' : 'Save Changes'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
