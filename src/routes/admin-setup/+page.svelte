<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { browser } from '$app/environment';

	const client = useConvexClient();
	const auth = browser ? useAuth() : { isLoading: false, isAuthenticated: false };

	let status = $state('Checking auth...');
	let error = $state<string | null>(null);
	let authUserId = $state<string | null>(null);

	onMount(async () => {
		await new Promise((r) => setTimeout(r, 1000));

		if (!auth.isAuthenticated) {
			status = 'Not authenticated. Please sign in first.';
			return;
		}

		const requestedRole = page.url.searchParams.get('role') || 'admin';

		status = `Setting you as ${requestedRole}...`;

		try {
			status = 'Creating profile with your name...';
			await client.mutation(api.onboarding.ensureUserProfile, {});

			status = `Setting you as ${requestedRole}...`;
			await client.mutation(api.onboarding.setMyRole, {
				role: requestedRole as 'super' | 'admin' | 'teacher' | 'student',
				status: 'active'
			});

			status = `Success! Profile created/updated. You are now ${requestedRole}.`;
			await new Promise((r) => setTimeout(r, 3000));
			void goto('/');
			return;
		} catch (err) {
			error = (err as Error).message || 'Unknown error';
			status = 'Error occurred';
		}
	});
</script>

<div class="flex h-screen flex-col items-center justify-center gap-4 p-4">
	<p class="text-lg">{status}</p>
	{#if authUserId}
		<p class="text-muted-foreground text-sm">Auth User ID: {authUserId}</p>
	{/if}
	{#if error}
		<p class="text-red-600">Error: {error}</p>
	{/if}
</div>
