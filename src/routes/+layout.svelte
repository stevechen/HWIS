<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import type { Snippet } from 'svelte';

	let {
		children,
		data
	}: { children: Snippet; data: { isLoginPage?: boolean; isTestMode?: boolean } } = $props();

	createSvelteAuthClient({ authClient });

	const testMode = $derived(data.isTestMode ?? false);

	let cookieTestMode = $state(false);

	const auth = useAuth();
	const isLoading = $derived(auth.isLoading && !cookieTestMode);
	const isAuthenticated = $derived(auth.isAuthenticated || cookieTestMode);
	const authDetermined = $derived(!isLoading);

	const isLoginPage = $derived(data.isLoginPage || String(page.url.pathname) === '/login');

	onMount(() => {
		cookieTestMode =
			testMode ||
			document.cookie.split('; ').find((row) => row.startsWith('hwis_test_auth=true')) !==
				undefined;

		(window as any).e2e = {
			resetAll: async () => {
				try {
					const { ConvexHttpClient } = await import('convex/browser');
					const { api } = await import('$convex/_generated/api');
					const client = new ConvexHttpClient('/');
					await client.mutation(api.testE2E.e2eResetAll, {});
				} catch (e) {
					console.log('Seeding error:', e);
				}
			},
			seedAll: async () => {
				try {
					const { ConvexHttpClient } = await import('convex/browser');
					const { api } = await import('$convex/_generated/api');
					const client = new ConvexHttpClient('/');
					await client.mutation(api.testE2E.e2eSeedAll, {});
				} catch (e) {
					console.log('Seeding error:', e);
				}
			},
			clearAuditOnly: async () => {
				try {
					const { ConvexHttpClient } = await import('convex/browser');
					const { api } = await import('$convex/_generated/api');
					const client = new ConvexHttpClient('/');
					await client.mutation(api.testE2E.e2eClearAuditOnly, {});
				} catch (e) {
					console.log('Seeding error:', e);
				}
			},
			seedCategoriesForDelete: async () => {
				try {
					const { ConvexHttpClient } = await import('convex/browser');
					const { api } = await import('$convex/_generated/api');
					const client = new ConvexHttpClient('/');
					const result = await client.mutation(api.testE2E.e2eSeedCategoriesForDelete, {});
					console.log('Seed categories result:', result);
				} catch (e) {
					console.log('Seeding error:', e);
				}
			},
			seedStudentsForDisable: async () => {
				try {
					const { ConvexHttpClient } = await import('convex/browser');
					const { api } = await import('$convex/_generated/api');
					const client = new ConvexHttpClient('/');
					await client.mutation(api.testE2E.e2eSeedStudentsForDisable, {});
				} catch (e) {
					console.log('Seeding error:', e);
				}
			},
			seedAuditLogs: async (authId?: string) => {
				try {
					const { ConvexHttpClient } = await import('convex/browser');
					const { api } = await import('$convex/_generated/api');
					const client = new ConvexHttpClient('/');
					await client.mutation(api.testE2E.e2eSeedAuditLogs, { authId });
				} catch (e) {
					console.log('Seeding error:', e);
				}
			}
		};
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
