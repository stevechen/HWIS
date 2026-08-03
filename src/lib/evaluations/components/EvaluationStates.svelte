<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Loader } from '@lucide/svelte';

	interface Props {
		state: 'loading' | 'error' | 'empty';
		message?: string;
		errorMessage?: string;
		testId?: string;
		children?: Snippet;
	}

	let { state, message, errorMessage, testId, children }: Props = $props();

	const displayErrorMessage = $derived(
		import.meta.env.DEV ? errorMessage : 'An error occurred while loading data'
	);
</script>

{#if state === 'loading'}
	<div
		class="text-muted-foreground flex items-center justify-center gap-2 py-16 text-center"
		data-testid={testId}
	>
		<Loader class="size-5 animate-spin" />
		{message ?? 'Loading evaluations...'}
	</div>
{:else if state === 'error'}
	<div class="bg-card border-destructive rounded-lg border p-8 text-center" data-testid={testId}>
		<p class="text-destructive">Error loading evaluations: {displayErrorMessage}</p>
	</div>
{:else if state === 'empty'}
	<div class="bg-card border-input rounded-lg border p-8 text-center" data-testid={testId}>
		<p class="text-muted-foreground mb-6">{message ?? 'No evaluations found.'}</p>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
