<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { browser } from '$app/environment';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { ExternalLink, RefreshCw, ArrowLeft, Tv } from '@lucide/svelte';
	import {
		LEADERBOARD_THEME_OPTIONS,
		themeLabel,
		type LeaderboardThemeId
	} from '$lib/leaderboard-themes';
	import { captureBoardThumbnail } from '$lib/thumbnail';

	type Board = 'houses' | 'classes';

	const BOARD_META: Record<Board, { title: string; description: string; path: string }> = {
		houses: {
			title: 'House Points',
			description: 'TV board ranking the four houses with radar, contributors, and growth.',
			path: '/leaderboard/houses'
		},
		classes: {
			title: 'Class Leaderboard',
			description: 'TV board ranking all classes with radar charts in a 7×2 grid.',
			path: '/leaderboard/classes'
		}
	};

	const client = useConvexClient();
	const configsQuery = useQuery(api.leaderboards.list, () => ({}));

	const configs = $derived(configsQuery.data ?? []);
	const isLoading = $derived(configsQuery.isLoading);
	const loadError = $derived(configsQuery.error);

	let pendingBoard = $state<Board | null>(null);
	let actionError = $state('');

	async function setEnabled(board: Board, enabled: boolean) {
		pendingBoard = board;
		actionError = '';
		try {
			await client.mutation(api.leaderboards.update, { board, enabled });
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to update leaderboard';
		} finally {
			pendingBoard = null;
		}
	}

	async function setTheme(board: Board, theme: LeaderboardThemeId) {
		pendingBoard = board;
		actionError = '';
		try {
			await client.mutation(api.leaderboards.update, { board, theme });
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to update theme';
		} finally {
			pendingBoard = null;
		}
	}

	function openBoard(path: string) {
		if (!browser) return;
		window.open(path, '_blank', 'noopener,noreferrer');
	}

	async function refreshPreview(board: Board, path: string) {
		pendingBoard = board;
		actionError = '';
		try {
			const thumbnailUrl = await captureBoardThumbnail(path);
			await client.mutation(api.leaderboards.update, { board, thumbnailUrl });
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to capture preview';
		} finally {
			pendingBoard = null;
		}
	}
</script>

<svelte:head>
	<title>Leaderboard Management — HWIS Admin</title>
</svelte:head>

<div class="mx-auto max-w-5xl p-6 sm:p-8" data-testid="admin-leaderboards.root">
	<a
		href="/admin"
		class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-2 text-sm"
	>
		<ArrowLeft class="size-4" />
		Back to Admin
	</a>

	<div class="mb-6 flex items-center gap-3">
		<Tv class="text-primary size-6" />
		<div>
			<h1 class="text-2xl font-bold">Leaderboard Management</h1>
			<p class="text-muted-foreground text-sm">
				Enable boards, switch seasonal themes, preview, and open TV displays in a separate window.
			</p>
		</div>
	</div>

	{#if isLoading}
		<div class="flex items-center gap-3" role="status" aria-label="Loading leaderboards">
			<div
				class="border-primary/20 border-b-primary size-6 animate-spin rounded-full border-4"
			></div>
			<p class="text-muted-foreground text-sm">Loading leaderboard configs…</p>
		</div>
	{:else if loadError}
		<p class="text-destructive text-sm" role="alert">Failed to load leaderboard configs.</p>
	{:else}
		{#if actionError}
			<p class="text-destructive mb-4 text-sm" role="alert">{actionError}</p>
		{/if}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			{#each configs as config (config.board)}
				{@const board = config.board as Board}
				{@const meta = BOARD_META[board]}
				{@const busy = pendingBoard === board}
				<Card.Root data-testid="admin-leaderboards.card-{board}">
					<Card.Header>
						<div class="mb-2 flex items-center justify-between gap-3">
							<Card.Title class="text-lg">{meta.title}</Card.Title>
							<Badge
								variant={config.enabled ? 'default' : 'secondary'}
								data-testid="admin-leaderboards.status-{board}"
							>
								{config.enabled ? 'Enabled' : 'Disabled'}
							</Badge>
						</div>
						<Card.Description>{meta.description}</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-4">
						<div
							class="bg-muted/40 border-border flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed"
							data-testid="admin-leaderboards.preview-{board}"
							role="img"
							aria-label="Preview placeholder for {meta.title}"
						>
							{#if config.thumbnailUrl}
								<img
									src={config.thumbnailUrl}
									alt="Preview of {meta.title}"
									class="h-full w-full rounded-lg object-cover"
								/>
							{:else}
								<p class="text-sm font-semibold">{themeLabel(config.theme)}</p>
								<p class="text-muted-foreground text-xs">
									{config.enabled ? 'Live board' : 'Disabled — witty screen shows'}
								</p>
								<p class="text-muted-foreground text-xs">No preview yet — click Refresh preview</p>
							{/if}
						</div>

						<div class="flex flex-col gap-2">
							<label class="text-sm font-medium" for="admin-leaderboards-theme-{board}">Theme</label
							>
							<NativeSelect.Root
								id="admin-leaderboards-theme-{board}"
								bind:value={
									() => config.theme, (v) => v && void setTheme(board, v as LeaderboardThemeId)
								}
								aria-label="Theme for {meta.title}"
								data-testid="admin-leaderboards.theme-{board}"
								disabled={busy}
							>
								{#each LEADERBOARD_THEME_OPTIONS as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>

						<div class="flex flex-wrap gap-2">
							<Button
								variant={config.enabled ? 'outline' : 'default'}
								size="sm"
								disabled={busy}
								onclick={() => void setEnabled(board, !config.enabled)}
								data-testid="admin-leaderboards.toggle-{board}"
							>
								{config.enabled ? 'Disable' : 'Enable'}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => openBoard(meta.path)}
								data-testid="admin-leaderboards.open-{board}"
							>
								<ExternalLink class="size-4" />
								Open in new window
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={busy}
								onclick={() => void refreshPreview(board, meta.path)}
								data-testid="admin-leaderboards.refresh-{board}"
							>
								<RefreshCw class="size-4" />
								{busy ? 'Capturing…' : 'Refresh preview'}
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
