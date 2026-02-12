<script lang="ts">
	import { Funnel } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		value: string;
		placeholder?: string;
		ariaLabel?: string;
		class?: string;
	}

	let {
		value = $bindable(),
		placeholder = 'Filter...',
		ariaLabel = 'Filter',
		class: className = ''
	}: Props = $props();
</script>

<div class="relative {className}">
	<Funnel class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
	<Input type="text" bind:value {placeholder} class="pl-9" aria-label={ariaLabel} />
</div>
