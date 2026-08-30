<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { getContext } from 'svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import type { RestorePayload } from '$convex/shared/restore_plan';
	import {
		Cloud,
		RotateCcw,
		Trash2,
		Download,
		Play,
		Upload,
		AlertTriangle,
		Pencil
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { useViewer } from '$lib/viewer.svelte';
	import { sanitizeFilename } from '$lib/utils/backup';

	const client = useConvexClient();
	const adminAuth = getContext<{ loaded: boolean; isAdmin: boolean }>('adminAuth');
	const session = useViewer();
	let refreshTrigger = $state(0);
	const backupsQuery = useQuery(api.backup.listBackups, () =>
		adminAuth.loaded && adminAuth.isAdmin ? { _trigger: refreshTrigger } : 'skip'
	);

	const currentUserId = $derived(session.viewer?._id);
	const isSuperUser = $derived(session.viewer?.role === 'super');

	let showForceBackupDialog = $state(false);
	let customBackupName = $state('');
	let showRestoreDialog = $state(false);
	let showRenameDialog = $state(false);
	let renameBackupId = $state<Id<'backups'> | null>(null);
	let renameBackupName = $state('');
	let isRenaming = $state(false);
	let showClearDialog = $state(false);
	let isForcingBackup = $state(false);
	let isRestoring = $state(false);
	let isClearing = $state(false);
	let backupResult = $state<{ message: string; skippedEvaluations?: string[] } | null>(null);
	let restoreConfirmText = $state('');
	let selectedBackupId = $state<Id<'backups'> | null>(null);

	// File restore states
	let fileInput = $state<HTMLInputElement | null>(null);
	let selectedFile = $state<File | null>(null);
	let fileError = $state<string | null>(null);
	let parsedBackup = $state<RestorePayload | null>(null);
	let showFileRestoreDialog = $state(false);
	let fileRestoreConfirmText = $state('');
	let isFileRestoring = $state(false);
	let isDragging = $state(false);

	function isSystemBackup(backup: { source?: string }) {
		return Boolean(backup.source && backup.source.startsWith('system_'));
	}

	function isOwner(backup: { creatorId?: Id<'users'> }) {
		return Boolean(currentUserId && backup.creatorId === currentUserId);
	}

	function canDownloadBackup(backup: { creatorId?: Id<'users'>; source?: string }) {
		return isSuperUser || isSystemBackup(backup) || isOwner(backup);
	}

	function canRenameBackup(backup: { creatorId?: Id<'users'>; source?: string }) {
		return isSuperUser || (!isSystemBackup(backup) && isOwner(backup));
	}

	function canDeleteBackup(backup: { creatorId?: Id<'users'>; source?: string }) {
		return isSuperUser || (!isSystemBackup(backup) && isOwner(backup));
	}

	function validateBackupPayload(data: unknown): {
		valid: boolean;
		error?: string;
		payload?: RestorePayload;
	} {
		if (!data || typeof data !== 'object') {
			return { valid: false, error: 'File content must be a JSON object.' };
		}
		const d = data as Record<string, unknown>;
		const requiredArrays = [
			'students',
			'evaluations',
			'users',
			'categories',
			'classes',
			'houseEvents'
		];
		for (const key of requiredArrays) {
			if (!Array.isArray(d[key])) {
				return { valid: false, error: `Invalid backup format: missing or invalid '${key}' array.` };
			}
		}
		return { valid: true, payload: data as RestorePayload };
	}

	async function processFile(file: File) {
		if (!file.name.endsWith('.json') && file.type !== 'application/json' && file.type !== '') {
			fileError = 'Please select a valid .json backup file.';
			return;
		}
		fileError = null;
		try {
			const text = await file.text();
			const json = JSON.parse(text);
			const result = validateBackupPayload(json);
			if (!result.valid || !result.payload) {
				fileError = result.error || 'Invalid backup file structure.';
				return;
			}
			selectedFile = file;
			parsedBackup = result.payload;
			fileRestoreConfirmText = '';
			showFileRestoreDialog = true;
		} catch (e) {
			fileError = 'Failed to parse JSON file: ' + (e instanceof Error ? e.message : String(e));
		}
	}

	async function handleForceBackup() {
		isForcingBackup = true;
		backupResult = null;
		try {
			const result = await client.mutation(api.backup.createBackup, {
				name: customBackupName.trim() || undefined
			});
			backupResult = result;
			customBackupName = '';
			refreshTrigger++;
		} catch (e) {
			alert('Failed: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isForcingBackup = false;
		}
	}

	function handleRenameClick(backup: { _id: Id<'backups'>; name?: string; filename: string }) {
		renameBackupId = backup._id;
		renameBackupName = backup.name || backup.filename.replace('.json', '');
		showRenameDialog = true;
	}

	async function handleRename() {
		if (!renameBackupId || !renameBackupName.trim()) return;
		isRenaming = true;
		try {
			await client.mutation(api.backup.renameBackup, {
				backupId: renameBackupId,
				name: renameBackupName.trim()
			});
			showRenameDialog = false;
			renameBackupId = null;
			renameBackupName = '';
			refreshTrigger++;
		} catch (e) {
			alert('Failed to rename: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isRenaming = false;
		}
	}

	function handleRestoreClick(backupId: Id<'backups'>) {
		selectedBackupId = backupId;
		restoreConfirmText = '';
		showRestoreDialog = true;
	}

	async function handleRestore() {
		if (!selectedBackupId || restoreConfirmText !== 'RESTORE') return;
		isRestoring = true;
		try {
			const res = await client.mutation(api.backup.restoreFromBackup, {
				backupId: selectedBackupId
			});
			backupResult = res;
			showRestoreDialog = false;
			refreshTrigger++;
		} catch (e) {
			alert('Failed: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isRestoring = false;
		}
	}

	async function handleFileRestore() {
		if (!parsedBackup || fileRestoreConfirmText !== 'RESTORE') return;
		isFileRestoring = true;
		try {
			const res = await client.mutation(api.backup.restoreFromBackupPayload, {
				backupData: parsedBackup
			});
			backupResult = res;
			showFileRestoreDialog = false;
			selectedFile = null;
			parsedBackup = null;
			if (fileInput) fileInput.value = '';
			refreshTrigger++;
		} catch (e) {
			alert('Failed: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isFileRestoring = false;
		}
	}

	async function handleClearAll() {
		isClearing = true;
		try {
			await client.mutation(api.backup.clearAllData, {});
		} catch (e) {
			alert('Failed: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isClearing = false;
		}
	}

	function formatDate(timestamp: number | string) {
		const d = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
		if (isNaN(d.getTime())) return String(timestamp);
		return d.toLocaleString('en-US', {
			timeZone: 'Asia/Hong_Kong',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function handleDownload(backup: {
		data?: unknown;
		name?: string;
		filename: string;
		_id: Id<'backups'>;
		chunkCount?: number;
	}) {
		let data = backup.data;
		if (!data && backup.chunkCount) {
			const chunks = await Promise.all(
				Array.from({ length: backup.chunkCount }, (_, chunkIndex) =>
					client.query(api.backup.getBackupChunk, {
						backupId: backup._id,
						chunkIndex
					})
				)
			);
			data = JSON.parse(chunks.map((chunk) => chunk?.data ?? '').join(''));
		}
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const rawName = backup.name || backup.filename.replace('.json', '');
		a.download = `${sanitizeFilename(rawName)}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<div class="bg-background min-h-dvh overflow-x-hidden">
	<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
		<div class="grid gap-6">
			<!-- Force Backup Card -->
			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900"
						>
							<Play class="size-5 text-blue-600 dark:text-blue-400" />
						</div>
						<Card.Title>Force Backup</Card.Title>
					</div>
					<Card.Description>Manually create a backup.</Card.Description>
				</Card.Header>
				<Card.Content>
					<Button
						variant="default"
						class="w-full"
						onclick={() => {
							customBackupName = '';
							showForceBackupDialog = true;
						}}
						disabled={isForcingBackup}
					>
						{isForcingBackup ? 'Creating...' : 'Force Backup Now'}
					</Button>
					{#if backupResult}
						<div
							class="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
						>
							<p class="font-medium">{backupResult.message}</p>
							{#if backupResult.skippedEvaluations?.length}
								<p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
									Note: {backupResult.skippedEvaluations.length} evaluation(s) were skipped due to missing
									references.
								</p>
							{/if}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Restore from JSON File Card -->
			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex size-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900"
						>
							<Upload class="size-5 text-purple-600 dark:text-purple-400" />
						</div>
						<Card.Title>Restore from File</Card.Title>
					</div>
					<Card.Description>
						Upload and restore database state from a downloaded JSON backup file.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div
						role="region"
						aria-label="Upload JSON backup file"
						class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors {isDragging
							? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20'
							: 'border-muted-foreground/25 hover:border-purple-400'}"
						ondragover={(e) => {
							e.preventDefault();
							isDragging = true;
						}}
						ondragleave={() => {
							isDragging = false;
						}}
						ondrop={(e) => {
							e.preventDefault();
							isDragging = false;
							const file = e.dataTransfer?.files?.[0];
							if (file) processFile(file);
						}}
					>
						<Upload class="text-muted-foreground mb-3 size-8" />
						<p class="text-sm font-medium">Drag and drop your backup JSON file here, or browse</p>
						<p class="text-muted-foreground mt-1 text-xs">Supports exported .json backup files</p>
						<input
							bind:this={fileInput}
							type="file"
							accept=".json,application/json"
							class="hidden"
							onchange={(e) => {
								const target = e.target as HTMLInputElement;
								const file = target.files?.[0];
								if (file) processFile(file);
							}}
						/>
						<Button
							variant="outline"
							size="sm"
							class="mt-4"
							onclick={() => fileInput?.click()}
							disabled={isFileRestoring}
						>
							Choose Backup File
						</Button>
					</div>

					{#if fileError}
						<div
							class="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
						>
							<AlertTriangle class="size-4 shrink-0" />
							<p>{fileError}</p>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Backup History Card -->
			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex size-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900"
						>
							<Cloud class="size-5 text-green-600 dark:text-green-400" />
						</div>
						<Card.Title>Backup History</Card.Title>
					</div>
					<Card.Description>Local backups stored in the database.</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if backupsQuery.isLoading}
						<p class="text-muted-foreground">Loading...</p>
					{:else if !backupsQuery.data?.length}
						<p class="text-muted-foreground">No backups found.</p>
					{:else}
						<div class="space-y-2">
							{#each backupsQuery.data ?? [] as backup (backup._id)}
								{@const data = backup.data}
								<div
									class="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
								>
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-2">
											<p class="truncate font-medium">{backup.name || backup.filename}</p>
											{#if backup.source === 'system_migration'}
												<span
													class="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
												>
													System: Migration
												</span>
											{:else if backup.source === 'system_safety'}
												<span
													class="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
												>
													System: Safety
												</span>
											{:else if backup.source === 'system_cron'}
												<span
													class="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
												>
													System: Auto
												</span>
											{:else if isOwner(backup)}
												<span
													class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
												>
													You
												</span>
											{:else if backup.creatorRole === 'super'}
												<span
													class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
												>
													Super: {backup.creatorName}
												</span>
											{:else if backup.creatorRole === 'admin'}
												<span
													class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
												>
													Admin: {backup.creatorName}
												</span>
											{:else if backup.creatorName}
												<span
													class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
												>
													{backup.creatorName}
												</span>
											{/if}
										</div>
										<p class="text-muted-foreground text-sm">
											{formatDate(backup.createdAt)} - {backup.studentsCount ??
												data?.students?.length ??
												0}
											students
										</p>
									</div>
									<div class="flex flex-wrap gap-2">
										{#if canDownloadBackup(backup)}
											<Button variant="outline" size="sm" onclick={() => handleDownload(backup)}>
												<Download class="mr-1 size-4" /> Download
											</Button>
										{/if}
										{#if canRenameBackup(backup)}
											<Button variant="outline" size="sm" onclick={() => handleRenameClick(backup)}>
												<Pencil class="mr-1 size-4" /> Rename
											</Button>
										{/if}
										<Button
											variant="outline"
											size="sm"
											onclick={() => handleRestoreClick(backup._id)}
										>
											<RotateCcw class="mr-1 size-4" /> Restore
										</Button>
										{#if canDeleteBackup(backup)}
											<Button
												variant="ghost"
												size="sm"
												onclick={async () => {
													if (confirm('Delete this backup?')) {
														await client.mutation(api.backup.deleteBackup, {
															backupId: backup._id
														});
														refreshTrigger++;
													}
												}}
											>
												<Trash2 class="text-destructive size-4" />
												<span class="sr-only">Delete backup</span>
											</Button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Danger Zone Card -->
			<Card.Root class="border-destructive">
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex size-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900"
						>
							<Trash2 class="size-5 text-red-600" />
						</div>
						<Card.Title>Danger Zone</Card.Title>
					</div>
					<Card.Description>Permanently delete all data.</Card.Description>
				</Card.Header>
				<Card.Content>
					<Button
						variant="destructive"
						class="w-full"
						onclick={() => (showClearDialog = true)}
						disabled={isClearing}
					>
						{isClearing ? 'Clearing...' : 'Clear All Data'}
					</Button>
				</Card.Content>
			</Card.Root>
		</div>
	</main>
</div>

<!-- Force Backup Dialog -->
{#if showForceBackupDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/50"
			onclick={() => (showForceBackupDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showForceBackupDialog = false)}
		></div>
		<div class="bg-background relative w-full max-w-lg rounded-lg border p-6 shadow-lg">
			<h2 class="text-lg font-semibold">Force Backup</h2>
			<p class="text-muted-foreground pt-2 text-sm">Create a backup of all current data.</p>
			<div class="py-4">
				<label for="backup-name-input" class="text-sm font-medium">Backup Name (optional)</label>
				<Input
					id="backup-name-input"
					bind:value={customBackupName}
					placeholder="Leave blank for timestamped default"
					class="mt-2"
				/>
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={() => (showForceBackupDialog = false)}>Cancel</Button>
				<Button
					onclick={() => {
						showForceBackupDialog = false;
						handleForceBackup();
					}}>Confirm</Button
				>
			</div>
		</div>
	</div>
{/if}

<!-- Rename Backup Dialog -->
{#if showRenameDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/50"
			onclick={() => (showRenameDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showRenameDialog = false)}
		></div>
		<div class="bg-background relative w-full max-w-md rounded-lg border p-6 shadow-lg">
			<h2 class="text-lg font-semibold">Rename Backup</h2>
			<div class="py-4">
				<label for="rename-input" class="text-sm font-medium">New Backup Name</label>
				<Input
					id="rename-input"
					bind:value={renameBackupName}
					placeholder="Enter backup name"
					class="mt-2"
				/>
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={() => (showRenameDialog = false)} disabled={isRenaming}>
					Cancel
				</Button>
				<Button onclick={handleRename} disabled={!renameBackupName.trim() || isRenaming}>
					{isRenaming ? 'Renaming...' : 'Save'}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- In-table Backup Restore Dialog -->
{#if showRestoreDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/50"
			onclick={() => (showRestoreDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showRestoreDialog = false)}
		></div>
		<div class="bg-background relative w-full max-w-md rounded-lg border p-6 shadow-lg">
			<h2 class="text-lg font-semibold">Restore Backup</h2>
			<div class="py-4">
				<p class="text-destructive text-sm font-medium">
					Warning: This will replace ALL existing data.
				</p>
				<p class="mt-2 text-sm">
					Type <code class="rounded bg-red-100 px-1 dark:bg-red-950">RESTORE</code> to confirm.
				</p>
				<Input bind:value={restoreConfirmText} placeholder="Type RESTORE" class="mt-4" />
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={() => (showRestoreDialog = false)}>Cancel</Button>
				<Button
					variant="destructive"
					onclick={handleRestore}
					disabled={restoreConfirmText !== 'RESTORE' || isRestoring}
				>
					{isRestoring ? 'Restoring...' : 'Restore'}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- File Restore Preview & Confirmation Dialog -->
{#if showFileRestoreDialog && parsedBackup}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/50"
			onclick={() => (showFileRestoreDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showFileRestoreDialog = false)}
		></div>
		<div class="bg-background relative w-full max-w-lg rounded-lg border p-6 shadow-lg">
			<h2 class="text-lg font-semibold">Restore from JSON Backup</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Review the contents of <span class="text-foreground font-medium">{selectedFile?.name}</span> before
				restoring.
			</p>

			<div class="my-4 space-y-3">
				{#if parsedBackup.exportedAt}
					<p class="text-muted-foreground text-xs">
						Exported at: <span class="text-foreground font-medium"
							>{formatDate(parsedBackup.exportedAt)}</span
						>
						{#if parsedBackup.version}
							· Version: <span class="text-foreground font-medium">{parsedBackup.version}</span>
						{/if}
					</p>
				{/if}

				<!-- Summary Grid -->
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					<div class="bg-muted/50 rounded-lg border p-3 text-center">
						<p class="text-2xl font-bold">{parsedBackup.students.length}</p>
						<p class="text-muted-foreground text-xs">Students</p>
					</div>
					<div class="bg-muted/50 rounded-lg border p-3 text-center">
						<p class="text-2xl font-bold">{parsedBackup.evaluations.length}</p>
						<p class="text-muted-foreground text-xs">Evaluations</p>
					</div>
					<div class="bg-muted/50 rounded-lg border p-3 text-center">
						<p class="text-2xl font-bold">{parsedBackup.classes.length}</p>
						<p class="text-muted-foreground text-xs">Classes</p>
					</div>
					<div class="bg-muted/50 rounded-lg border p-3 text-center">
						<p class="text-2xl font-bold">{parsedBackup.categories.length}</p>
						<p class="text-muted-foreground text-xs">Categories</p>
					</div>
					<div class="bg-muted/50 rounded-lg border p-3 text-center">
						<p class="text-2xl font-bold">{parsedBackup.users.length}</p>
						<p class="text-muted-foreground text-xs">Users</p>
					</div>
					<div class="bg-muted/50 rounded-lg border p-3 text-center">
						<p class="text-2xl font-bold">{parsedBackup.houseEvents.length}</p>
						<p class="text-muted-foreground text-xs">House Events</p>
					</div>
				</div>

				<div
					class="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
				>
					<p class="font-semibold">Safety Note:</p>
					<p class="mt-1">
						Restoring will replace existing students, evaluations, classes, categories, and house
						events. A safety snapshot of your current database will be saved automatically before
						restoring.
					</p>
				</div>

				<div>
					<p class="text-sm">
						Type <code class="rounded bg-red-100 px-1 font-semibold dark:bg-red-950">RESTORE</code> to
						confirm:
					</p>
					<Input bind:value={fileRestoreConfirmText} placeholder="Type RESTORE" class="mt-2" />
				</div>
			</div>

			<div class="flex justify-end gap-2">
				<Button
					variant="outline"
					onclick={() => (showFileRestoreDialog = false)}
					disabled={isFileRestoring}
				>
					Cancel
				</Button>
				<Button
					variant="destructive"
					onclick={handleFileRestore}
					disabled={fileRestoreConfirmText !== 'RESTORE' || isFileRestoring}
				>
					{isFileRestoring ? 'Restoring Data...' : 'Restore Data'}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Clear All Data Dialog -->
{#if showClearDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/50"
			onclick={() => (showClearDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showClearDialog = false)}
		></div>
		<div class="bg-background relative w-full max-w-md rounded-lg border p-6 shadow-lg">
			<h2 class="text-lg font-semibold">Clear All Data</h2>
			<div class="py-4">
				<p class="text-destructive text-sm font-medium">
					This will permanently delete ALL data. This cannot be undone.
				</p>
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={() => (showClearDialog = false)}>Cancel</Button>
				<Button
					variant="destructive"
					onclick={() => {
						showClearDialog = false;
						handleClearAll();
					}}>Confirm & Clear</Button
				>
			</div>
		</div>
	</div>
{/if}
