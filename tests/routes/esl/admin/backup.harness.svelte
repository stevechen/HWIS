<script lang="ts">
	import { setContext } from 'svelte';
	import EslBackupPage from '$src/routes/esl/admin/backup/+page.svelte';

	let { loaded = true, allowed = true }: { loaded?: boolean; allowed?: boolean } = $props();

	// The layout owns this context in the app; the harness supplies the same
	// shape so the page can be rendered in isolation.
	setContext('eslAdminAuth', {
		get loaded() {
			return loaded;
		},
		get allowed() {
			return allowed;
		}
	});
</script>

<EslBackupPage />
