<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	let { data }: { data: { authState?: { isAuthenticated: boolean } } } = $props();

	const auth = browser ? useAuth() : { isLoading: false, isAuthenticated: false };
	const session = browser
		? authClient.useSession()
		: {
				subscribe(
					run: (value: { isPending: boolean; data: { user: { name?: string } } | null }) => void
				) {
					run({ isPending: false, data: null });
					return () => {};
				}
			};
	const dbUser = useQuery(api.users.viewer, () => ({}));
	const client = useConvexClient();

	const serverAuthenticated = $derived(!!data.authState?.isAuthenticated);
	const isLoggedIn = $derived(auth.isAuthenticated || serverAuthenticated);
	// isLoading is derived but currently unused - keeping for potential future use
	// const _isLoading = $derived(auth.isLoading || $session.isPending || dbUser.isLoading);
	const userName = $derived($session.data?.user.name);
	const hasProfile = $derived(Boolean(dbUser.data?.role && dbUser.data?.status));
	const isApproved = $derived(hasProfile && dbUser.data?.status === 'active');
	let hasEnsuredProfile = $state(false);

	async function ensureProfile() {
		try {
			await client.mutation(api.onboarding.ensureUserProfile, {});
		} catch {
			// Profile creation failed, will retry
		}
	}

	$effect(() => {
		if (!isLoggedIn) {
			hasEnsuredProfile = false;
			return;
		}
		if (!dbUser.isLoading && !hasEnsuredProfile) {
			hasEnsuredProfile = true;
			ensureProfile();
		}
	});

	$effect(() => {
		if (isApproved && !dbUser.isLoading && dbUser.data) {
			if (dbUser.data.role === 'admin' || dbUser.data.role === 'super') {
				window.location.href = '/admin';
			} else {
				window.location.href = '/evaluations';
			}
		}
	});

	async function signOut() {
		await authClient.signOut();
		void goto('/login');
	}
</script>

<div class="flex h-screen flex-col items-center bg-gray-50 p-4">
	<header class="mb-6 flex w-full max-w-2xl items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">HWIS</h1>
	</header>

	<main class="w-full max-w-2xl">
		{#if !isLoggedIn}
			<Card.Root>
				<Card.Content class="pt-6">
					<div class="flex flex-col items-center justify-center gap-4">
						<h2 class="text-xl font-semibold">HWIS Point System</h2>
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
		{/if}
	</main>
</div>
