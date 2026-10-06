<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { formatBackupAge } from '$convex/shared/drive_backup_target';

	/**
	 * Backup staleness banner for the admin area (issue #151).
	 *
	 * Deliberately shown to *every* admin, not just super users. The point of
	 * this component is not that the viewer can fix a broken Drive credential —
	 * they cannot — but that someone notices and says so. A banner only the
	 * super user can see would depend on that one person opening the admin area,
	 * which is exactly the assumption that let the archive go dark for a month.
	 *
	 * Reads only the Convex heartbeat table, never Drive, so this renders even
	 * when the Drive credential is the thing that broke.
	 */
	const freshness = useQuery(api.backupWatchdog.getBackupFreshness, {});
</script>

{#if freshness.data && !freshness.data.freshness.ok}
	{@const { reason, ageMs } = freshness.data.freshness}
	<div
		class="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-3 border-b px-4 py-3"
		role="alert"
	>
		<svg
			class="mt-0.5 size-5 shrink-0"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path
				d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
			/>
		</svg>
		<div class="text-sm">
			<p class="font-medium">
				{reason === 'never'
					? 'No backup has ever been recorded'
					: `Daily backup is stale — last succeeded ${formatBackupAge(ageMs)} ago`}
			</p>
			<p class="opacity-80">
				The nightly Drive archive has not completed recently. This usually means the Google OAuth
				credentials or the backup folder need attention.
				{#if freshness.data.filename}
					Last successful file: <span class="font-mono">{freshness.data.filename}</span>.
				{/if}
			</p>
		</div>
	</div>
{/if}
