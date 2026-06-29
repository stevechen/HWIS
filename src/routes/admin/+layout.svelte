<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const user = useQuery(api.users.viewer, () => ({}));

	const isAdmin = $derived(user.data?.role === 'admin' || user.data?.role === 'super');
	const loaded = $derived(!user.isLoading);

	$effect(() => {
		if (loaded && !isAdmin && browser) {
			goto('/');
		}
	});
</script>

{#if user.isLoading}
	<div class="flex min-h-screen items-center justify-center">
		<div
			class="border-primary/20 border-b-primary size-8 animate-spin rounded-full border-4"
			role="status"
			aria-label="Loading"
		></div>
	</div>
{:else if isAdmin}
	{@render children()}
{/if}
