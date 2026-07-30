<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		message?: string;
		children?: Snippet;
		testId?: string;
	}

	let { message = 'No evaluations found.', children, testId }: Props = $props();
</script>

<div class="bg-card border-input rounded-lg border p-8 text-center" data-testid={testId}>
	<p class="text-muted-foreground mb-6">{message}</p>
	{#if children}
		{@render children()}
	{/if}
</div>
