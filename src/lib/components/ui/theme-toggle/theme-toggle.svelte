<script lang="ts">
	import { theme } from '$lib/stores/theme';
	import { Sun, Moon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<Button variant="ghost" size="icon" onclick={() => theme.toggle()} aria-label="Toggle theme">
	{#if $theme === 'light'}
		<Sun class="size-4" />
	{:else}
		<Moon class="size-4" />
	{/if}
</Button>
