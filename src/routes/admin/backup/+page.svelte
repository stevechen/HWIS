<script lang="ts">
	import { getContext } from 'svelte';
	import BackupManager from '$lib/components/backup/BackupManager.svelte';

	const adminAuth = getContext<{ loaded: boolean; isAdmin: boolean }>('adminAuth');
</script>

<div class="bg-background min-h-dvh overflow-x-hidden">
	<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
		<BackupManager department="international" auth={adminAuth} />
	</main>
</div>
