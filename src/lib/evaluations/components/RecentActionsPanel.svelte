<script lang="ts">
	import { History, Pencil, Trash2 } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditable } from '$convex/shared/evaluation_week';
	import type { RecentBatch } from '$convex/shared/recentActions';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { useAuthProfile } from '$lib/auth-profile';
	import {
		batchValueDisplay,
		mixedChipClass,
		valueChipClass,
		formatBatchTime
	} from '$lib/evaluations/recentActions';
	import BatchEditDialog from './BatchEditDialog.svelte';
	import BatchDeleteDialog from './BatchDeleteDialog.svelte';

	interface Props {
		panelTestId?: string;
	}

	let { panelTestId }: Props = $props();

	let folded = $state(true);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let editTarget = $state<RecentBatch | null>(null);
	let deleteTarget = $state<RecentBatch | null>(null);

	const profile = useAuthProfile();
	const batchesQuery = useQuery(api.evaluations.listRecentBatches, () => ({}));

	// Super sees their own locked batches too; everyone else only gets
	// batches whose week has not yet locked at the Monday boundary.
	const canFixLocked = $derived(Boolean(profile?.data?.capabilities?.editAnyEvaluation));
	const allBatches = $derived(batchesQuery.data ?? []);
	const actionable = $derived(allBatches.filter((b) => canFixLocked || isEditable(b.createdAt)));

	function openEdit(batch: RecentBatch): void {
		editTarget = batch;
		editOpen = true;
	}

	function openDelete(batch: RecentBatch): void {
		deleteTarget = batch;
		deleteOpen = true;
	}
</script>

{#if actionable.length > 0}
	{#if folded}
		<button
			class="bg-background fixed top-20 right-4 z-50 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium shadow-md"
			onclick={() => (folded = false)}
			aria-label="Expand recent actions"
			data-testid={panelTestId ? `${panelTestId}.expand` : undefined}
		>
			<History class="size-4" />
			{actionable.length} action{actionable.length === 1 ? '' : 's'}
		</button>
	{:else}
		<div
			class="bg-background fixed top-20 right-4 z-50 w-80 rounded-lg border shadow-lg"
			data-testid={panelTestId ? `${panelTestId}.root` : undefined}
		>
			<div class="flex items-center justify-between border-b px-4 py-3">
				<div class="flex items-center gap-2">
					<History class="size-4" />
					<span class="text-sm font-semibold">Recent Actions</span>
					<Badge variant="secondary" class="tabular-nums">{actionable.length}</Badge>
				</div>
				<button
					class="text-muted-foreground hover:text-foreground text-xs"
					onclick={() => (folded = true)}
					aria-label="Collapse recent actions"
				>
					Hide
				</button>
			</div>

			<div class="max-h-[60vh] overflow-y-auto p-2">
				{#each actionable as batch (batch.batchId)}
					{@const display = batchValueDisplay(batch)}
					<div
						class="hover:bg-accent group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2"
					>
						<button class="flex-1 text-left" onclick={() => openEdit(batch)}>
							<div class="flex items-center justify-between gap-2">
								<span class="text-xs">{formatBatchTime(batch.createdAt)}</span>
								<span class="text-muted-foreground text-xs tabular-nums">
									{batch.evaluations.length} student{batch.evaluations.length === 1 ? '' : 's'}
								</span>
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-1.5">
								{#if display.mixed}
									<span
										class={`inline-flex h-5 items-center rounded px-1.5 text-xs font-medium ${mixedChipClass()}`}
									>
										mixed
									</span>
								{:else}
									<span
										class={`inline-flex h-5 min-w-6 items-center justify-center rounded px-1.5 text-xs font-medium ${valueChipClass(display.value)}`}
									>
										{display.value > 0 ? `+${display.value}` : display.value}
									</span>
								{/if}
								<span class="text-sm">{display.category}</span>
								{#if display.mixed}
									<span class="text-muted-foreground text-xs">(edited)</span>
								{/if}
							</div>
						</button>
						<div class="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
							<Button
								variant="ghost"
								size="icon"
								class="size-6"
								aria-label="Edit batch"
								onclick={() => openEdit(batch)}
							>
								<Pencil class="size-3.5" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="text-destructive size-6"
								aria-label="Delete batch"
								onclick={() => openDelete(batch)}
							>
								<Trash2 class="size-3.5" />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/if}

<BatchEditDialog bind:open={editOpen} batch={editTarget} onClose={() => (editOpen = false)} />
<BatchDeleteDialog
	bind:open={deleteOpen}
	batch={deleteTarget}
	onDelete={() => (deleteTarget = null)}
/>
