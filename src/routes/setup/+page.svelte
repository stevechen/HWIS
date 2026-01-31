<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { browser } from '$app/environment';

	const client = useConvexClient();
	const auth = useAuth();
	/* eslint-disable @typescript-eslint/no-explicit-any */
	const apiAny = api as any;

	let isTestMode = $state(false);
	if (browser) {
		isTestMode = document.cookie.split('; ').some((c) => c.startsWith('hwis_test_auth='));
	}

	let status = $state('Checking auth...');
	let error = $state<string | null>(null);

	onMount(async () => {
		if (!auth.isAuthenticated && !isTestMode) {
			status = 'Not authenticated. Please sign in first.';
			await new Promise((r) => setTimeout(r, 2000));
			void goto('/login');
			return;
		}

		status = 'Creating profile...';
		const tokenArg = isTestMode ? 'test-token-admin-mock' : undefined;

		try {
			const result = await client.mutation(apiAny.onboarding.ensureUserProfile, {
				testToken: tokenArg
			});

			if (result.created) {
				status = 'Profile created! Promoting to admin...';
				await client.mutation(api.onboarding.setMyRole, {
					role: 'admin',
					status: 'active',
					testToken: tokenArg
				});
			}

			status = 'Done! Redirecting...';
			await new Promise((r) => setTimeout(r, 1000));
			void goto('/');
			return;
		} catch (err) {
			error = (err as Error).message || 'Unknown error';
			status = 'Error occurred';
		}
	});
</script>

<div class="flex flex-col justify-center items-center gap-4 h-screen">
	<p class="text-lg">{status}</p>
	{#if error}
		<p class="text-red-600">Error: {error}</p>
	{/if}
</div>
