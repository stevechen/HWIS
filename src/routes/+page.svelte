<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
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
			console.log('Creating profile for:', userName);
			const result = await client.mutation(api.onboarding.ensureUserProfile, {});
			console.log('Profile result:', result);
		} catch (err) {
			console.error('Failed to create profile:', err);
		}
	}

	$effect(() => {
		if (needsProfile && !dbUser.isLoading && !cookieTestMode) {
			console.log('Needs profile, creating...');
			ensureProfile();
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

<div class="flex h-screen flex-col items-center bg-gray-50 p-4">
	<header class="mb-6 flex w-full max-w-2xl items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">HWIS</h1>
		<div class="flex items-center gap-4">
			<ThemeToggle />
			{#if isLoggedIn}
				<button
					onclick={signOut}
					class="rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none"
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
					<div class="flex flex-col items-center justify-center gap-4">
						<h2 class="text-xl font-semibold">Homework & Welfare Incentive System</h2>
						<p class="text-gray-600">Please sign in to continue</p>
						<Button onclick={() => void goto('/login')}>Sign in</Button>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if dbUser.isLoading}
			<Card.Root>
				<Card.Content class="pt-6">
					<div class="flex flex-col items-center justify-center gap-4">
						<p class="text-gray-600">Loading...</p>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if !isApproved}
			<Card.Root>
				<Card.Content class="pt-6">
					<div class="flex flex-col items-center justify-center gap-4">
						<h2 class="text-xl font-semibold">Account Pending Approval</h2>
						<p class="text-gray-600">Welcome, {userName}!</p>
						<p class="text-muted-foreground text-center">
							Your account has been created and is pending approval from an administrator. You will
							be notified once your account is activated.
						</p>
						<Button variant="outline" onclick={signOut}>Sign out</Button>
					</div>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="grid gap-4">
				<Card.Root>
					<Card.Content class="pt-6">
						<div class="flex flex-col items-center justify-center gap-4">
							<p class="text-gray-600">Welcome, {userName}!</p>
							{#if cookieTestMode || dbUser.data?.role === 'admin' || dbUser.data?.role === 'super'}
								<Button onclick={() => void goto('/admin')}>Admin Dashboard</Button>
							{/if}
							<Button onclick={() => void goto('/evaluations')}>View Evaluations</Button>
							<Button variant="outline" onclick={() => void goto('/evaluations/new')}
								>New Evaluation</Button
							>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		{/if}
	</main>
</div>
