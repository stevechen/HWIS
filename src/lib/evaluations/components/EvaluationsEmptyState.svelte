<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';

	interface Props {
		message?: string;
		children?: Snippet;
	}

	let { message = 'No evaluations found.', children }: Props = $props();
</script>

<div class="bg-card border-input rounded-lg border p-8 text-center">
	<p class="text-muted-foreground mb-6">{message}</p>
	{#if children}
		{@render children()}
	{/if}
</div>
