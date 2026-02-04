<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { setupConvex, useQuery } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { ArrowLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import { api } from '$convex/_generated/api';
	import { headerTitleOverride } from '$lib/stores/header';
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

	async function signOut() {
		await authClient.signOut();
		void goto('/login');
	}

	const user = useQuery(api.users.viewer, () => ({}));
	const isAdmin = $derived.by(() => {
		if (!user.isLoading && user.data?.role) {
			return user.data.role === 'admin' || user.data.role === 'super';
		}
		return false;
	});

	const backLabel = $derived.by(() => {
		const path = $page.url.pathname;
		if (path === '/login') return '';
		if (path === '/admin/categories') return 'Back to Admin';
		if (path === '/admin/users') return 'Back to Admin';
		if (path === '/admin/students') return 'Back to Admin';
		if (path === '/admin/weekly-reports') return 'Back to Admin';
		if (path.startsWith('/admin') && path !== '/admin') return 'Back to Admin';
		if (path.startsWith('/evaluations/student')) return 'Back to Evaluations';
		if (path === '/evaluations/new') return 'Back';
		if (path === '/evaluations' && isAdmin) return 'Back to Admin';
		if (path === '/evaluations' && !isAdmin) return '';
		return 'Back';
	});

	const backTarget = $derived.by(() => {
		const path = $page.url.pathname;
		if (path.startsWith('/admin') && path !== '/admin') return '/admin';
		if (path.startsWith('/evaluations/student') || path === '/evaluations/new')
			return '/evaluations';
		if (path === '/evaluations' && isAdmin) return '/admin';
		return '';
	});

	const titleFromPath = $derived.by(() => {
		const path = $page.url.pathname;
		if (path === '/') return 'HWIS';
		if (path === '/admin') return 'Admin Dashboard';
		if (path === '/admin/students') return 'Student Management';
		if (path === '/admin/audit') return 'Audit Log';
		if (path === '/admin/categories') return 'Categories';
		if (path === '/admin/users') return 'Manage Users';
		if (path === '/admin/backup') return 'Backup Management';
		if (path === '/admin/academic') return 'Year-End Reset';
		if (path === '/admin/weekly-reports') return 'Weekly Reports';
		if (path === '/admin/evaluations') return 'All Evaluation Review';
		if (path === '/evaluations') return 'Evaluation History';
		if (path === '/evaluations/new') return 'New Evaluation';
		if (path.startsWith('/evaluations/student')) return 'Evaluation History';
		return 'HWIS';
	});

	const headerTitle = $derived.by(() => $headerTitleOverride || titleFromPath);

	function handleBack() {
		if (backTarget) {
			void goto(backTarget);
			return;
		}
		if (browser && window.history.length > 1) {
			window.history.back();
		} else {
			void goto('/');
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	{#if $page.url.pathname !== '/login'}
		<div class="bg-background/90 sticky top-0 z-1000 border-b backdrop-blur">
			<div class="flex h-14 items-center justify-between gap-3 px-4">
				<div class="flex items-center gap-3">
					{#if backLabel}
						<Button variant="outline" onclick={handleBack}>
							<ArrowLeft class="size-4" />
							<span class="ml-2 hidden sm:inline">{backLabel}</span>
						</Button>
					{/if}
					<h1 class="text-foreground font-semibold">{headerTitle}</h1>
				</div>
				<div class="flex items-center gap-3">
					<ThemeToggle />
					<Button variant="outline" onclick={signOut}>Sign out</Button>
				</div>
			</div>
		</div>
	{/if}
	<div class="flex-1">
		{@render children?.()}
	</div>
</div>
