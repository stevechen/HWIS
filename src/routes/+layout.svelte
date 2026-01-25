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
	import DebugAuth from '$lib/components/DebugAuth.svelte';

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { isLoginPage?: boolean; testRole?: string; mockUser?: any; mockToken?: string };
	} = $props();

	createSvelteAuthClient({ authClient });

	const cookieTestMode = $derived(!!data.testRole);

	const auth = useAuth();
	let safetyTimeout = $state(false);

	// Use mock data if available to prevent SSR fetch loops
	const user = $derived(data.mockUser);
	const isLoading = $derived(!data.mockUser && auth.isLoading && !cookieTestMode && !safetyTimeout);
	const isAuthenticated = $derived(!!data.mockUser || auth.isAuthenticated || cookieTestMode);

	const authDetermined = $derived(!isLoading);

	$effect(() => {
		if (browser) {
			const timer = setTimeout(() => {
				safetyTimeout = true;
			}, 3000); // 3s fallback
			return () => clearTimeout(timer);
		}
	});

	const isLoginPage = $derived(data.isLoginPage || String(page.url.pathname) === '/login');

	onMount(() => {
		document.body.classList.add('hydrated');
	});

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

{#if import.meta.env.DEV}
	<DebugAuth />
{/if}
