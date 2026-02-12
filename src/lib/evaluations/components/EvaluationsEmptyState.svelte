<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';

	interface Props {
		message?: string;
		children?: Snippet;
	}

	let { message = 'No evaluations found.', children }: Props = $props();
</script>

<div class="bg-card p-8 border border-input rounded-lg text-center">
	<p class="mb-6 text-muted-foreground">{message}</p>
	{#if children}
		{@render children()}
	{/if}
</div>
