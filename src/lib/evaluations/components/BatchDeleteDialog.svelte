<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import type { RecentBatch } from '$convex/shared/recentActions';

	interface Props {
		open: boolean;
		batch: RecentBatch | null;
		onDelete?: () => void;
		dialogTestId?: string;
		cancelTestId?: string;
		deleteTestId?: string;
	}

	let {
		open = $bindable(),
		batch,
		onDelete,
		dialogTestId,
		cancelTestId,
		deleteTestId
	}: Props = $props();

	const client = useConvexClient();

	let deleting = $state(false);

	async function handleDelete(): Promise<void> {
		if (!batch) return;
		deleting = true;
		try {
			await client.mutation(api.evaluations.removeMany, {
				ids: batch.evaluations.map((e) => e.id as Id<'evaluations'>)
			});
			open = false;
			onDelete?.();
		} finally {
			deleting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content aria-label="Delete Batch" testId={dialogTestId}>
		<Dialog.Header>
			<Dialog.Title>Delete Batch</Dialog.Title>
		</Dialog.Header>

		{#if batch}
			<p class="py-4">
				Delete {batch.evaluations.length} evaluation{batch.evaluations.length === 1 ? '' : 's'}?
				This action cannot be undone.
			</p>
		{/if}

		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (open = false)}
				disabled={deleting}
				testId={cancelTestId}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				onclick={handleDelete}
				disabled={deleting}
				testId={deleteTestId}
			>
				{deleting ? 'Deleting...' : 'Delete'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
