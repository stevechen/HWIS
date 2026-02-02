<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	let { data }: { data: { testRole?: string } } = $props();

	const auth = useAuth();
	const session = authClient.useSession();
	const cookieTestMode = $derived(!!data.testRole);

	const dbUser = useQuery(api.users.viewer, () => ({
		testToken: cookieTestMode ? 'test-token-admin-mock' : undefined
	}));
	const client = useConvexClient();

	const isLoggedIn = $derived(auth.isAuthenticated || cookieTestMode);
	// isLoading is derived but currently unused - keeping for potential future use
	// const _isLoading = $derived(auth.isLoading || $session.isPending || dbUser.isLoading);
	const userName = $derived($session.data?.user.name ?? (cookieTestMode ? 'Test User' : undefined));
	const hasProfile = $derived(!!dbUser.data?.authId || cookieTestMode);
	const isApproved = $derived(
		cookieTestMode ||
			(hasProfile &&
				(dbUser.data?.status === 'active' ||
					dbUser.data?.role === 'admin' ||
					dbUser.data?.role === 'super'))
	);
	const needsProfile = $derived(isLoggedIn && !hasProfile);

	async function ensureProfile() {
		if (!needsProfile || cookieTestMode) return;

		try {
			await client.mutation(api.onboarding.ensureUserProfile, {});
		} catch {
			// Profile creation failed, will retry
		}
	}

	$effect(() => {
		if (needsProfile && !dbUser.isLoading && !cookieTestMode) {
			ensureProfile();
		}
	});

	// Redirect based on role: admins → /admin, teachers → /evaluations
	$effect(() => {
		if (!dbUser.isLoading && isApproved) {
			let isAdmin = false;
			if (cookieTestMode) {
				// In test mode, check testRole
				isAdmin = data.testRole === 'admin' || data.testRole === 'super';
			} else if (dbUser.data) {
				// In normal mode, check dbUser role
				isAdmin = dbUser.data.role === 'admin' || dbUser.data.role === 'super';
			}

			// Redirect admins to admin dashboard, teachers to evaluations
			if (isAdmin) {
				void goto('/admin', { replaceState: true });
			} else {
				void goto('/evaluations', { replaceState: true });
			}
		}
	});

	async function signOut() {
		if (cookieTestMode) {
			document.cookie = 'hwis_test_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
			void goto('/');
			return;
		}
		await authClient.signOut();
		void goto('/login');
	}
</script>

<div class="flex flex-col items-center bg-gray-50 p-4 h-screen">
	<header class="flex justify-between items-center mb-6 w-full max-w-2xl">
		<h1 class="font-bold text-gray-800 text-2xl">HWIS</h1>
		<div class="flex items-center gap-4">
			<ThemeToggle />
			{#if isLoggedIn}
				<button
					onclick={signOut}
					class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-white transition-colors"
				>
					Sign out
				</button>
			{/if}
		</div>
	</header>

	<main class="w-full max-w-2xl">
		{#if !isLoggedIn}
			<Card.Root>
				<Card.Content class="pt-6">
					<div class="flex flex-col justify-center items-center gap-4">
						<h2 class="font-semibold text-xl">Homework & Welfare Incentive System</h2>
						<p class="text-gray-600">Please sign in to continue</p>
						<Button onclick={() => void goto('/login')}>Sign in</Button>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if dbUser.isLoading}
			<Card.Root>
				<Card.Content class="pt-6">
					<div class="flex flex-col justify-center items-center gap-4">
						<p class="text-gray-600">Loading...</p>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if !isApproved}
			<Card.Root>
				<Card.Content class="pt-6">
					<div class="flex flex-col justify-center items-center gap-4">
						<h2 class="font-semibold text-xl">Account Pending Approval</h2>
						<p class="text-gray-600">Welcome, {userName}!</p>
						<p class="text-muted-foreground text-center">
							Your account has been created and is pending approval from an administrator. You will
							be notified once your account is activated.
						</p>
						<Button variant="outline" onclick={signOut}>Sign out</Button>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
	</main>
</div>
