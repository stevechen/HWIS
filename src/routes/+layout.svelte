<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

	let { children, data }: { children: any; data: { isLoginPage?: boolean } } = $props();

	createSvelteAuthClient({ authClient });

	const auth = useAuth();
	const isLoading = $derived(auth.isLoading);
	const isAuthenticated = $derived(auth.isAuthenticated);
	const authDetermined = $derived(!isLoading);

	const isLoginPage = $derived(data.isLoginPage || String($page.url.pathname) === '/login');

	$effect(() => {
		if (!browser || !authDetermined || isLoginPage) return;

		if (!isAuthenticated) {
			goto('/login', { replaceState: true });
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if isLoginPage}
	{@render children?.()}
{:else if !authDetermined}
	<div class="flex h-screen items-center justify-center bg-gray-50">
		<div class="text-lg text-gray-600">Loading...</div>
	</div>
{:else if !isAuthenticated}
	<div class="flex h-screen items-center justify-center bg-gray-50">
		<div class="text-lg text-gray-600">Redirecting...</div>
	</div>
{:else}
	{@render children?.()}
{/if}
