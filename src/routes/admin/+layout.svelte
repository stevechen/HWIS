<script lang="ts">
	import { goto } from '$app/navigation';
	import { setContext, type Snippet } from 'svelte';
	import { useViewer } from '$lib/viewer.svelte';
	import BackupStaleBanner from '$lib/components/admin/BackupStaleBanner.svelte';

	let { children }: { children: Snippet } = $props();

	const session = useViewer();

	const loaded = $derived(session.status !== 'loading' && session.status !== 'signedOut');
	const isAdmin = $derived(session.isAdmin);

	setContext('adminAuth', {
		get loaded() {
			return loaded;
		},
		get isAdmin() {
			return isAdmin;
		}
	});

	$effect(() => {
		if (loaded && !isAdmin) {
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
	<div class="min-h-screen">
		<BackupStaleBanner />
		{@render children()}
	</div>
{/if}
