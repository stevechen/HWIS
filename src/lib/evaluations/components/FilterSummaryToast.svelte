<script lang="ts">
	interface Props {
		show: boolean;
		count: number;
		total?: number;
		filterLabel?: string;
		filterValue?: string;
	}

	let { show, count, total, filterLabel = 'evaluations', filterValue }: Props = $props();

	const displayText = $derived(
		total !== undefined
			? `Showing ${count} of ${total} evaluation${total === 1 ? '' : 's'}${filterValue ? ` for ${filterLabel} "${filterValue}"` : ''}`
			: `Showing ${count} evaluation${count === 1 ? '' : 's'}${filterValue ? ` matching ${filterLabel} "${filterValue}"` : ''}`
	);
</script>

{#if show}
	<div class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
		<p class="bg-card/90 rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur-sm">
			{displayText}
		</p>
	</div>
{/if}
