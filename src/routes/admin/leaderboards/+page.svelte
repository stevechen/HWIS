<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { ExternalLink, RefreshCw, ArrowLeft, Tv } from '@lucide/svelte';
	import {
		LEADERBOARD_THEME_OPTIONS,
		displayPath,
		themeLabel,
		type LeaderboardThemeId
	} from '$lib/leaderboard-themes';
	import { captureBoardThumbnail } from '$lib/thumbnail';

	type Board = 'houses' | 'classes';

	const BOARD_META: Record<Board, { title: string; description: string; path: string }> = {
		houses: {
			title: 'House Points',
			description:
				'TV board ranking the four houses with radar charts and an expanded contributors list.',
			path: '/leaderboard/houses'
		},
		classes: {
			title: 'Class Leaderboard',
			description: 'TV board ranking all classes with radar charts in a 7×2 grid.',
			path: '/leaderboard/classes'
		}
	};

	const BOARD_DESCRIPTION =
		'Enable boards, pick from theme previews, and open the TV displays in a separate window.';

	const client = useConvexClient();
	const configsQuery = useQuery(api.leaderboards.list, () => ({}));
	const configs = $derived(configsQuery.data ?? []);

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
		window.open(displayPath(path), '_blank', 'noopener,noreferrer');
	}

	// --- Auto-captured theme screenshots -------------------------------------
	// Each theme tile shows a real screenshot of the board rendered in that
	// theme (`?theme=` override, captured in a hidden iframe). Screenshots are
	// persisted to the config (`themes` map) and only re-captured when missing
	// or when "Refresh screenshots" is pressed.

	type ThumbState = { url?: string; error?: boolean };

	/** Module-level cache: survives client-side navigation within the session. */
	const thumbCache = new SvelteMap<string, string>();

	let thumbs = $state<Record<string, ThumbState>>({});
	let capturingBoard = $state<Board | null>(null);

	function thumbKey(board: Board, themeId: LeaderboardThemeId): string {
		return `${board}:${themeId}`;
	}

	async function captureOneThumb(board: Board, boardPath: string, themeId: LeaderboardThemeId) {
		const key = thumbKey(board, themeId);
		const previous = thumbCache.get(key);
		try {
			// Bulk recaptures hammer the Convex backend with two parallel iframe
			// loads, which often leaves `toPng` painting too early (blank shot)
			// or throws on a webfont fetch race. Keep the previous (stale)
			// screenshot visible while retrying so a bad capture never flips a
			// good tile to "unavailable".
			const url = await captureBoardThumbnail(`${displayPath(boardPath)}&theme=${themeId}`, {
				settleMs: 4000,
				format: 'jpeg',
				jpegQuality: 0.7
			});
			thumbCache.set(key, url);
			thumbs[key] = { url };
			await client.mutation(api.leaderboards.update, {
				board,
				themeScreenshot: { theme: themeId, url }
			});
			return true;
		} catch (err) {
			console.warn(`Preview capture failed for ${key}:`, err);
			if (previous) {
				thumbs[key] = { url: previous };
			} else {
				thumbs[key] = { error: true };
			}
			return false;
		}
	}

	async function captureThemeThumbs(board: Board, boardPath: string, force = false) {
		capturingBoard = board;
		try {
			for (const option of LEADERBOARD_THEME_OPTIONS) {
				const key = thumbKey(board, option.value);
				const cached = thumbCache.get(key);
				if (cached && !force) {
					thumbs[key] = { url: cached };
					continue;
				}
				if (!cached) {
					thumbs[key] = {};
				}
				await captureOneThumb(board, boardPath, option.value);
			}
		} finally {
			capturingBoard = null;
		}
	}

	let capturesStarted = false;
	$effect(() => {
		if (configsQuery.data && !capturesStarted) {
			capturesStarted = true;
			// Seed tiles from stored screenshots, then capture only the missing
			// ones. Boards run sequentially (not concurrently) so two iframe
			// loads don't fight over the Convex connection.
			void (async () => {
				for (const config of configsQuery.data ?? []) {
					const board = config.board as Board;
					for (const option of LEADERBOARD_THEME_OPTIONS) {
						const stored = config.themes[option.value];
						if (stored) {
							thumbCache.set(thumbKey(board, option.value), stored);
							thumbs[thumbKey(board, option.value)] = { url: stored };
						}
					}
					await captureThemeThumbs(board, BOARD_META[board].path);
				}
			})();
		}
	});
</script>

{#snippet ThemeTile(
	themeId: LeaderboardThemeId,
	board: Board,
	boardPath: string,
	selected: boolean,
	busy: boolean
)}
	{@const thumb = thumbs[thumbKey(board, themeId)]}
	<button
		type="button"
		class="flex w-full flex-col gap-1 rounded-lg border p-1.5 text-left transition-all {selected
			? 'border-primary ring-primary ring-2'
			: 'hover:border-border border-transparent'}"
		disabled={busy}
		onclick={() => void setTheme(board, themeId)}
		data-testid="admin-leaderboards.theme-tile-{board}-{themeId}"
	>
		<div
			class="bg-muted/60 flex aspect-video items-center justify-center overflow-hidden rounded-md"
		>
			{#if thumb?.url}
				<img
					src={thumb.url}
					alt="{themeLabel(themeId)} theme preview"
					class="size-full object-cover"
				/>
			{:else if thumb?.error}
				<span class="flex flex-col items-center gap-1 p-2 text-center">
					<span class="text-muted-foreground text-[10px]">Preview unavailable</span>
					<span
						role="button"
						tabindex="0"
						class="text-primary text-[10px] font-semibold underline"
						data-testid="admin-leaderboards.retry-{board}-{themeId}"
						onclick={(e) => {
							e.stopPropagation();
							void captureOneThumb(board, boardPath, themeId);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								e.stopPropagation();
								void captureOneThumb(board, boardPath, themeId);
							}
						}}
					>
						Retry
					</span>
				</span>
			{:else}
				<div
					class="border-primary/30 border-b-primary size-5 animate-spin rounded-full border-2"
					role="status"
					aria-label="Capturing {themeLabel(themeId)} preview"
				></div>
			{/if}
		</div>
		<span class="flex items-center justify-between gap-1 text-xs">
			<span class="truncate font-medium">{themeLabel(themeId)}</span>
			{#if selected}<span class="text-primary shrink-0 text-[10px] font-bold">✓ Current</span>{/if}
		</span>
	</button>
{/snippet}

{#snippet TogglePill(enabled: boolean, busy: boolean, onclick: () => void, testid: string)}
	<button
		type="button"
		{onclick}
		disabled={busy}
		class="relative inline-flex h-7 w-40 items-center rounded-full border transition-colors {enabled
			? 'border-emerald-300/60 bg-emerald-100'
			: 'border-border bg-muted'}"
		data-testid={testid}
		aria-pressed={enabled}
	>
		<span
			class="absolute inset-y-0.5 my-auto flex w-20 items-center justify-center rounded-full text-xs font-semibold whitespace-nowrap transition-all {enabled
				? 'left-[calc(100%-5.25rem)] bg-emerald-600 text-white'
				: 'bg-secondary text-secondary-foreground left-0.5'}"
		>
			{enabled ? 'Enabled' : 'Disabled'}
		</span>
		<span
			class="pointer-events-none absolute w-12 text-center text-[11px] whitespace-nowrap {enabled
				? 'left-1.5 text-emerald-700'
				: 'text-muted-foreground right-1.5'}"
		>
			{enabled ? 'On air' : 'Off air'}
		</span>
	</button>
{/snippet}

<svelte:head>
	<title>Leaderboard Management — HWIS Admin</title>
</svelte:head>

<div class="mx-auto max-w-6xl p-6 sm:p-8" data-testid="admin-leaderboards.root">
	<a
		href="/admin"
		class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-2 text-sm"
	>
		<ArrowLeft class="size-4" /> Back to Admin
	</a>

	<div class="mb-6 flex items-center gap-3">
		<Tv class="text-primary size-6" />
		<div>
			<h1 class="text-2xl font-bold">Leaderboard Management</h1>
			<p class="text-muted-foreground text-sm">
				{BOARD_DESCRIPTION}
			</p>
		</div>
	</div>

	{#if actionError}
		<p class="text-destructive mb-4 text-sm" role="alert">{actionError}</p>
	{/if}

	{#if configsQuery.isLoading}
		<p class="text-muted-foreground text-sm">Loading leaderboard configs…</p>
	{:else if configsQuery.error}
		<p class="text-destructive text-sm" role="alert">Failed to load leaderboard configs.</p>
	{:else}
		<div class="flex flex-col gap-8">
			{#each configs as config (config.board)}
				{@const board = config.board as Board}
				{@const meta = BOARD_META[board]}
				{@const busy = pendingBoard === board}
				<section class="rounded-xl border p-4" data-testid="admin-leaderboards.card-{board}">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 class="text-lg font-semibold">{meta.title}</h2>
							<p class="text-muted-foreground text-sm">{meta.description}</p>
						</div>
						<div class="flex items-center gap-3">
							{@render TogglePill(
								config.enabled,
								busy,
								() => void setEnabled(board, !config.enabled),
								`admin-leaderboards.toggle-${board}`
							)}
							<Button
								variant="secondary"
								size="sm"
								onclick={() => openBoard(meta.path)}
								data-testid="admin-leaderboards.open-{board}"
							>
								<ExternalLink class="size-4" /> Open
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={capturingBoard !== null}
								onclick={() => void captureThemeThumbs(board, meta.path, true)}
								data-testid="admin-leaderboards.refresh-{board}"
							>
								<RefreshCw class="size-4" />
								{capturingBoard === board ? 'Capturing…' : 'Refresh screenshots'}
							</Button>
						</div>
					</div>

					<p class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
						Theme — click to apply
					</p>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
						{#each LEADERBOARD_THEME_OPTIONS as option (option.value)}
							{@render ThemeTile(
								option.value,
								board,
								meta.path,
								option.value === config.theme,
								busy
							)}
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
