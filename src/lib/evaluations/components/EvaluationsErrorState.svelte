<script lang="ts">
	interface Props {
		message: string;
	}

	let { message }: Props = $props();

	const displayMessage = $derived(
		import.meta.env.DEV ? message : 'An error occurred while loading data'
	);
</script>

<div class="bg-card border-destructive rounded-lg border p-8 text-center">
	<p class="text-destructive">Error loading evaluations: {displayMessage}</p>
</div>
