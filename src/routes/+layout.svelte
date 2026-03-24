<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/logo.svg';
	import logo from '$lib/assets/logo.svg';
	import { browser } from '$app/environment';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { setupConvex, useQuery } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { ArrowLeft, PowerOff } from '@lucide/svelte';
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
		data = {}
	}: {
		children: Snippet;
		data?: { authState?: { isAuthenticated: boolean }; demo?: string };
	} = $props();

	// Check if we're in demo mode
	const isDemo = $derived(!!data.demo);

	if (browser) {
		createSvelteAuthClient({
			authClient,
			getServerState: () => data.authState
		});
	}

	onMount(() => {
		document.body.classList.add('hydrated');
	});

	async function handleReload() {
		await authClient.signOut();
		void goto('/login');
	}

	async function signOut() {
		await authClient.signOut();
		void goto('/login');
	}

	const user = useQuery(api.users.viewer, () => (isDemo ? 'skip' : {}));

	const shouldShowModal = $derived.by(() => {
		// Skip modal check in demo mode
		if (isDemo) return false;
		if (!$page.url.pathname || $page.url.pathname === '/login' || $page.url.pathname === '/') {
			return false;
		}
		if (user.isLoading || !user.data) {
			return false;
		}
		const role = user.data.role;
		const status = user.data.status;
		const isNowAdmin = role === 'admin' || role === 'super';
		const isActive = status === 'active';
		const isAdminPage = $page.url.pathname.startsWith('/admin');
		const isEvaluationsPage = $page.url.pathname.startsWith('/evaluations');

		// /admin pages: only admins/super with active status
		// /evaluations pages: any active user (teacher or admin)
		if (isAdminPage) {
			return !(isNowAdmin && isActive);
		}
		if (isEvaluationsPage) {
			return !isActive;
		}
		return false;
	});

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
		if (path === '/admin/classes') return 'Back to Admin';
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
		if (path === '/admin/classes') return 'Class Management';
		if (path === '/admin/houses') return 'House Management';
		if (path === '/houses') return 'Houses Competition';
		if (path === '/admin/audit') return 'Audit Log';
		if (path === '/admin/categories') return 'Categories';
		if (path === '/admin/users') return 'Manage Users';
		if (path === '/admin/backup') return 'Backup Management';
		if (path === '/admin/academic') return 'Year-End Reset';
		if (path === '/admin/weekly-reports') return 'Weekly Reports';
		if (path === '/admin/evaluations') return 'All Evaluations';
		if (path === '/evaluations') return 'My Evaluations';
		if (path === '/evaluations/new') return 'New Evaluation';
		if (path.startsWith('/evaluations/student')) return 'My Evaluation';
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

<div class="relative min-h-screen">
	<!-- Background Logo -->
	<div class="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center">
		<img
			src={logo}
			alt=""
			aria-hidden="true"
			class="h-auto max-h-[70vh] w-auto max-w-[70vw] opacity-3"
			loading="eager"
			decoding="async"
		/>
	</div>

	<div class="flex min-h-screen flex-col">
		{#if shouldShowModal}
			<div class="fixed inset-0 z-9999 flex items-center justify-center bg-black/80">
				<div class="bg-background text-foreground m-4 max-w-md rounded-lg border p-6 shadow-lg">
					<h2 class="mb-4 text-lg font-semibold">Access Restricted</h2>
					<p class="text-muted-foreground mb-6">
						Your account access has been changed. Please sign in again.
					</p>
					<Button variant="default" class="w-full cursor-pointer" onclick={handleReload}
						>Sign In Again</Button
					>
				</div>
			</div>
		{/if}
		{#if $page.url.pathname !== '/login' && !shouldShowModal}
			<div class="bg-primary text-primary-foreground sticky top-0 z-1000 border-b">
				<div class="flex h-14 items-center justify-between gap-3 px-4">
					<div class="flex items-center gap-3">
						{#if backLabel}
							<Button
								variant="default"
								class="border bg-white text-blue-950 hover:bg-gray-100"
								onclick={handleBack}
							>
								<ArrowLeft class="size-4" />
								<span class="hidden sm:inline">{backLabel}</span>
							</Button>
						{/if}
						<h1 class="text-primary-foreground font-semibold">{headerTitle}</h1>
					</div>
					<div class="flex items-center gap-3">
						<ThemeToggle />
						<Button
							variant="default"
							class="border bg-white text-blue-950 hover:bg-gray-100"
							onclick={signOut}
							aria-label="Sign out"
						>
							<PowerOff class="size-4" />
						</Button>
					</div>
				</div>
			</div>
		{/if}
		<div class="flex-1">
			{@render children?.()}
		</div>
	</div>
</div>
