<script lang="ts">
	import { getContext } from 'svelte';
	import BackupManager from '$lib/components/backup/BackupManager.svelte';

	// The ESL department's own gate, provided by `/esl/admin/+layout.svelte`.
	// Deliberately not the International `adminAuth`: an ESL admin reaches this
	// page through the department guard, and the manager reads the query gate
	// from here.
	const eslAdminAuth = getContext<{ loaded: boolean; allowed: boolean }>('eslAdminAuth');

	const auth = {
		get loaded() {
			return eslAdminAuth.loaded;
		},
		get isAdmin() {
			return eslAdminAuth.allowed;
		}
	};
</script>

<div class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
	<h1 data-testid="esl-admin-backup.title" class="text-2xl font-bold text-emerald-900">
		Backup &amp; Restore
	</h1>
	<p data-testid="esl-admin-backup.subtitle" class="text-muted-foreground mt-2">
		Create snapshots of ESL department data and restore from a previous backup.
	</p>
	<div class="mt-6">
		<BackupManager department="esl" {auth} />
	</div>
</div>
