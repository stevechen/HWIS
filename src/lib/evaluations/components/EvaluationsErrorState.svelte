<script lang="ts">
	interface Props {
		message: string;
		testId?: string;
	}

	let { message, testId }: Props = $props();

	const displayMessage = $derived(
		import.meta.env.DEV ? message : 'An error occurred while loading data'
	);
</script>

<div class="bg-card border-destructive rounded-lg border p-8 text-center" data-testid={testId}>
	<p class="text-destructive">Error loading evaluations: {displayMessage}</p>
</div>
