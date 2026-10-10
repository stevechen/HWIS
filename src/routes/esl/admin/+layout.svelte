<script lang="ts">
	import { goto } from '$app/navigation';
	import { setContext, type Snippet } from 'svelte';
	import { useViewer } from '$lib/viewer.svelte';

	let { children }: { children: Snippet } = $props();

	const session = useViewer();

	const loaded = $derived(session.status !== 'loading' && session.status !== 'signedOut');
	const isEslAdmin = $derived(session.isEslAdmin);

	setContext('eslAdminAuth', {
		get loaded() {
			return loaded;
		},
		get isEslAdmin() {
			return isEslAdmin;
		}
	});

	$effect(() => {
		if (loaded && !isEslAdmin) {
			goto('/');
		}
	});
</script>

{#if !loaded}
	<div class="flex min-h-screen items-center justify-center">
		<div
			class="border-primary/20 border-b-primary size-8 animate-spin rounded-full border-4"
			role="status"
			aria-label="Loading"
		></div>
	</div>
{:else if isEslAdmin}
	<div class="min-h-screen">
		{@render children()}
	</div>
{/if}
