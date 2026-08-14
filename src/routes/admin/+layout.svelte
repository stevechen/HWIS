<script lang="ts">
	import { canAccessAdminArea } from '$convex/shared/authorization';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { setContext, type Snippet } from 'svelte';
	import { useAuthProfile } from '$lib/auth-profile';

	let { children }: { children: Snippet } = $props();

	const profile = useAuthProfile();

	const isAdmin = $derived(
		profile ? (profile.data?.user ? canAccessAdminArea(profile.data.user) : false) : false
	);
	const loaded = $derived(profile ? !profile.isLoading : false);

	setContext('adminAuth', {
		get loaded() {
			return loaded;
		},
		get isAdmin() {
			return isAdmin;
		}
	});

	$effect(() => {
		if (loaded && !isAdmin && browser) {
			goto('/');
		}
	});
</script>

{#if profile?.isLoading}
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
