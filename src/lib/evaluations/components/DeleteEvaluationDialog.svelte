<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import type { EvaluationEntry } from '$lib/components/timeline/types';

	interface Props {
		open: boolean;
		evaluation: EvaluationEntry | null;
		onDelete?: () => void;
	}

	let { open = $bindable(), evaluation, onDelete }: Props = $props();

	const client = useConvexClient();

	async function handleDelete(): Promise<void> {
		if (!evaluation) return;

		await client.mutation(api.evaluations.remove, {
			id: evaluation._id as Id<'evaluations'>
		});
		open = false;
		onDelete?.();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content aria-label="Delete Evaluation">
		<Dialog.Header>
			<Dialog.Title>Delete Evaluation</Dialog.Title>
		</Dialog.Header>

		<p class="py-4">
			Are you sure you want to delete this evaluation? This action cannot be undone.
		</p>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button variant="destructive" onclick={handleDelete}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
