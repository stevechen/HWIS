<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { setupConvex } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	// Initialize Convex client - must be called before any useQuery() calls
	setupConvex(PUBLIC_CONVEX_URL);

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { authState?: { isAuthenticated: boolean } };
	} = $props();

	if (browser) {
		createSvelteAuthClient({
			authClient,
			getServerState: () => data.authState
		});
	}

	onMount(() => {
		document.body.classList.add('hydrated');
	});

</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
