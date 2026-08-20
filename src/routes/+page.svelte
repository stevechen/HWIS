<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { browser } from '$app/environment';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { useViewer } from '$lib/viewer.svelte';

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
	const client = useConvexClient();

	const viewerSession = useViewer();

	const status = $derived(viewerSession.status);
	const isLoggedIn = $derived(status !== 'loading' && status !== 'signedOut');
	const userName = $derived($session.data?.user.name);
	// We can show a terminal screen (sign-in / pending approval) once auth is
	// settled and, for authenticated users, the profile has resolved.
	const canShowTerminal = $derived(status !== 'loading');
	// Valid accounts redirect immediately; render nothing so the HWIS title +
	// loading card never flashes by on the way to /admin.
	const shouldRedirect = $derived(status === 'active');
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
		// Only ensure the profile when it genuinely does not exist yet. The
		// profile query returns user:null for a stale/missing token (skip) and a
		// non-null user with profileExists:false for a new user who still needs
		// one (create). Existing users resolve profileExists:true and are skipped
		// entirely, which also avoids firing the mutation while a token refresh
		// is mid-flight (Not authenticated).
		if (viewerSession.needsProfileCreation && !hasEnsuredProfile) {
			hasEnsuredProfile = true;
			ensureProfile();
		}
	});

	$effect(() => {
		if (status === 'active' && viewerSession.viewer) {
			const viewer = viewerSession.viewer;
			if (viewerSession.isStudent && viewer.studentId) {
				void goto(`/evaluations/student/${viewer.studentId}`);
			} else {
				void goto(viewerSession.isAdmin ? '/admin' : '/evaluations');
			}
		}
	});

	async function signOut() {
		await authClient.signOut();
		void goto('/login');
	}
</script>

<div class="flex h-screen flex-col items-center bg-gray-50 p-4">
	{#if !canShowTerminal || shouldRedirect}
		<!-- Nothing yet: auth/profile still settling, or a valid account that is
			 being redirected. Avoid flashing the HWIS title + card. -->
	{:else}
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
			{:else}
				<Card.Root>
					<Card.Content class="pt-6">
						<div class="flex flex-col items-center justify-center gap-4">
							<h2 class="text-xl font-semibold">Account Pending Approval</h2>
							<p class="text-gray-600">Welcome, {userName}!</p>
							<p class="text-muted-foreground text-center">
								Your account has been created and is pending approval from an administrator. You
								will be notified once your account is activated.
							</p>
							<Button variant="outline" onclick={signOut}>Sign out</Button>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}
		</main>
	{/if}
</div>
