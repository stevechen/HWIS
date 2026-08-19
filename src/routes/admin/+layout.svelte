<script lang="ts">
	import { canAccessAdminArea } from '$convex/shared/authorization';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { setContext, type Snippet } from 'svelte';
	import { useAuthProfile } from '$lib/auth-profile';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

	let { children }: { children: Snippet } = $props();

	const auth = useAuth();
	const profile = useAuthProfile();

	const isAdmin = $derived(
		profile ? (profile.data?.user ? canAccessAdminArea(profile.data.user) : false) : false
	);
	// Wait until Convex auth is fully established before evaluating the profile.
	// Before the Convex JWT is set, the profile query resolves to anonymous
	// (user: null), which must not be treated as "not an admin" (that would
	// bounce to / before auth settles). A real profile user is the signal that
	// the query ran with the authenticated token.
	const loaded = $derived(
		!auth.isLoading &&
			auth.isAuthenticated &&
			profile !== undefined &&
			!profile.isLoading &&
			profile.data?.user != null
	);

	setContext('adminAuth', {
		get loaded() {
			return loaded;
		},
		get isAdmin() {
			return isAdmin;
		}
	});

	$effect(() => {
		if (browser && loaded && !isAdmin) {
			goto('/');
		}
	});
</script>

{#if !loaded}
	<div class="flex min-h-screen items-center justify-center">
		<div
			class="border-primary/20 border-b-primary size-8 animate-spin rounded-full border-4"
			role="status"
			aria-label="Loading"
		></div>
	</div>
{:else if isAdmin}
	{@render children()}
{/if}
