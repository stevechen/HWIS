<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	let { children, data }: { children: Snippet; data: { isLoginPage?: boolean } } = $props();

	createSvelteAuthClient({ authClient });

	let cookieTestMode = $state(false);

	const auth = useAuth();
	const isLoading = $derived(auth.isLoading && !cookieTestMode);
	const isAuthenticated = $derived(auth.isAuthenticated || cookieTestMode);
	const authDetermined = $derived(!isLoading);

	const isLoginPage = $derived(data.isLoginPage || String(page.url.pathname) === '/login');

	onMount(() => {
		document.body.classList.add('hydrated');
	});

	if (browser) {
		cookieTestMode =
			document.cookie.split('; ').find((row) => row.startsWith('hwis_test_auth=')) !== undefined;
	}

	$effect(() => {
		if (!browser || !authDetermined || isLoginPage || cookieTestMode) return;

		if (!isAuthenticated) {
			void goto('/login', { replaceState: true });
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if isLoginPage}
	{@render children?.()}
{:else if !authDetermined && !cookieTestMode}
	<div class="flex h-screen items-center justify-center bg-gray-50">
		<div class="text-lg text-gray-600">Loading...</div>
	</div>
{:else if !isAuthenticated && !cookieTestMode}
	<div class="flex h-screen items-center justify-center bg-gray-50">
		<div class="text-lg text-gray-600">Redirecting...</div>
	</div>
{:else}
	{@render children?.()}
{/if}
