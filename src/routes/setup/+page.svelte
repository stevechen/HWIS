<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { browser } from '$app/environment';

	const client = useConvexClient();
	const auth = browser ? useAuth() : { isLoading: false, isAuthenticated: false };
	/* eslint-disable @typescript-eslint/no-explicit-any */
	const apiAny = api as any;

	let status = $state('Checking auth...');
	let error = $state<string | null>(null);

	onMount(async () => {
		if (!auth.isAuthenticated) {
			status = 'Not authenticated. Please sign in first.';
			return;
		}

		status = 'Creating profile...';

		try {
			const result = await client.mutation(apiAny.onboarding.ensureUserProfile, {});

			if (result.created) {
				status = 'Profile created! Promoting to admin...';
				await client.mutation(api.onboarding.setMyRole, {
					role: 'admin',
					status: 'active'
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

<div class="flex h-screen flex-col items-center justify-center gap-4">
	<p class="text-lg">{status}</p>
	{#if error}
		<p class="text-red-600">Error: {error}</p>
	{/if}
</div>
