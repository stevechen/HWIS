<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { Cloud, RotateCcw, Trash2, Download, Play } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';

	let { data }: { data: { testRole?: string } } = $props();

	const isTestMode = $derived(!!data.testRole);

	const client = useConvexClient();
	const currentUser = useQuery(api.users.viewer, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));
	let refreshTrigger = $state(0);
	const backupsQuery = useQuery(api.backup.listBackups, () => ({
		_trigger: refreshTrigger,
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	let showForceBackupDialog = $state(false);
	let showRestoreDialog = $state(false);
	let showClearDialog = $state(false);
	let isForcingBackup = $state(false);
	let isRestoring = $state(false);
	let isClearing = $state(false);
	let backupResult = $state<{ message: string } | null>(null);
	let restoreConfirmText = $state('');
	let selectedBackupId = $state<string | null>(null);

	$effect(() => {
		if (isTestMode) return;
		if (browser && currentUser.isLoading === false) {
			if (currentUser.data?.role !== 'admin' && currentUser.data?.role !== 'super') {
				goto('/');
			}
		}
	});

	async function handleForceBackup() {
		isForcingBackup = true;
		backupResult = null;
		try {
			const result = await client.mutation(api.backup.createBackup, {
				testToken: isTestMode ? 'test-token-admin-mock' : undefined
			});
			backupResult = result;
			refreshTrigger++;
		} catch (e) {
			alert('Failed: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isForcingBackup = false;
		}
	}

	function handleRestoreClick(backupId: string) {
		selectedBackupId = backupId;
		restoreConfirmText = '';
		showRestoreDialog = true;
	}

	async function handleRestore() {
		if (!selectedBackupId || restoreConfirmText !== 'RESTORE') return;
		isRestoring = true;
		try {
			await client.mutation(api.backup.restoreFromBackup, {
				backupId: selectedBackupId as any,
				testToken: isTestMode ? 'test-token-admin-mock' : undefined
			});
			showRestoreDialog = false;
			refreshTrigger++;
		} catch (e) {
			alert('Failed: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isRestoring = false;
		}
	}

	async function handleClearAll() {
		isClearing = true;
		try {
			await client.mutation(api.backup.clearAllData, {
				testToken: isTestMode ? 'test-token-admin-mock' : undefined
			});
		} catch (e) {
			alert('Failed: ' + (e instanceof Error ? e.message : String(e)));
		} finally {
			isClearing = false;
		}
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleString('en-US', {
			timeZone: 'Asia/Hong_Kong',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleDownload(backup: any) {
		const data = backup.data;
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = backup.filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<div class="bg-background min-h-screen">
	<header class="bg-card border-b shadow-sm">
		<div class="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<Button variant="outline" onclick={() => goto('/admin')}>Back to Admin</Button>
					<h1 class="text-foreground text-2xl font-bold">Backup Management</h1>
				</div>
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
		<div class="grid gap-6">
			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900"
						>
							<Play class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						</div>
						<Card.Title>Force Backup</Card.Title>
					</div>
					<Card.Description>Manually create a backup.</Card.Description>
				</Card.Header>
				<Card.Content>
					<Button
						variant="default"
						class="w-full"
						onclick={() => (showForceBackupDialog = true)}
						disabled={isForcingBackup}
					>
						{isForcingBackup ? 'Creating...' : 'Force Backup Now'}
					</Button>
					{#if backupResult}
						<p class="mt-4 text-sm text-green-600">{backupResult.message}</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900"
						>
							<Cloud class="h-5 w-5 text-green-600 dark:text-green-400" />
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
								<div class="flex items-center justify-between rounded-lg border p-4">
									<div>
										<p class="font-medium">{backup.filename}</p>
										<p class="text-muted-foreground text-sm">
											{formatDate(backup.createdAt)} - {data?.students?.length ?? 0} students
										</p>
									</div>
									<div class="flex gap-2">
										<Button variant="outline" size="sm" onclick={() => handleDownload(backup)}>
											<Download class="mr-1 h-4 w-4" /> Download
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => handleRestoreClick(backup._id)}
										>
											<RotateCcw class="mr-1 h-4 w-4" /> Restore
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={async () => {
												if (confirm('Delete?')) {
													await client.mutation(api.backup.deleteBackup, {
														backupId: backup._id as any,
														testToken: isTestMode ? 'test-token-admin-mock' : undefined
													});
													refreshTrigger++;
												}
											}}
										>
											<Trash2 class="text-destructive h-4 w-4" />
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class="border-destructive">
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900"
						>
							<Trash2 class="h-5 w-5 text-red-600" />
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
			<p class="text-muted-foreground py-4">Create a backup of all current data?</p>
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
					Type <code class="rounded bg-red-100 px-1">RESTORE</code> to confirm.
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
