<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { Maximize, Minimize } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { isDisplayUrl } from '$lib/leaderboard-themes';

	let { children }: { children: Snippet } = $props();

	/**
	 * TV display mode (`?display=1`): chromeless kiosk shell for wall displays.
	 * Auto-fullscreen, first-click fallback, keyboard shortcuts, and double-click
	 * toggle keep working; only the floating toggle buttons are hidden.
	 * Bookmarkable per board.
	 */
	const isDisplayMode = $derived(isDisplayUrl(page.url));

	let isFs = $state(false);
	let container: HTMLDivElement | undefined = $state(undefined);
	// Auto-fullscreen is desktop-only: it makes no sense in a 1280×720 capture
	// iframe (and on touch devices a programmatic request can steal the real
	// fullscreen state). The fullscreen toggle buttons still work manually.
	/** Skip fullscreen when capture is running (`?no-fullscreen=1`) or inside an
	 * iframe / on touch devices. */
	const skipAutoFullscreen =
		browser &&
		(window.self !== window.top ||
			window.matchMedia('(pointer: coarse)').matches ||
			new URL(window.location.href, window.location.origin).searchParams.has('no-fullscreen'));

	function syncFs() {
		isFs = !!document.fullscreenElement;
	}

	async function enterFullscreen() {
		if (!browser) return;
		try {
			await document.documentElement.requestFullscreen();
		} catch {
			// Autoplay blocked without gesture — user can click button
		}
	}

	async function exitFullscreen() {
		if (!browser) return;
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
		} catch {
			// ignore if already exited
		}
	}

	onMount(() => {
		if (!browser) return;
		let t: ReturnType<typeof setTimeout> | undefined;
		if (!skipAutoFullscreen) {
			t = setTimeout(() => {
				void enterFullscreen();
			}, 300);
		}

		document.addEventListener('fullscreenchange', syncFs);
		syncFs();

		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'f' || e.key === 'F') {
				if (isFs) void exitFullscreen();
				else void enterFullscreen();
			}
			if (e.key === 'Escape' && isFs) void exitFullscreen();
		};
		document.addEventListener('keydown', onKey);

		const onFirstClick = () => {
			if (!skipAutoFullscreen && !document.fullscreenElement) void enterFullscreen();
		};
		document.addEventListener('click', onFirstClick, { once: true });

		return () => {
			if (t) clearTimeout(t);
			document.removeEventListener('fullscreenchange', syncFs);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<div
	bind:this={container}
	class="leaderboard-tvshell relative min-h-screen bg-[#050716]"
	ondblclick={() => (isFs ? void exitFullscreen() : void enterFullscreen())}
	role="application"
	aria-label="Leaderboard TV display, double-click to toggle fullscreen, press F"
>
	{@render children?.()}

	{#if !isDisplayMode}
		<div class="pointer-events-none fixed right-3 bottom-3 z-50 flex gap-2">
			{#if !isFs}
				<Button
					size="sm"
					variant="secondary"
					onclick={enterFullscreen}
					class="pointer-events-auto bg-white/90 text-black shadow-lg backdrop-blur hover:bg-white"
					aria-label="Enter fullscreen"
				>
					<Maximize class="size-4" />
					Fullscreen
				</Button>
			{:else}
				<Button
					size="sm"
					variant="secondary"
					onclick={exitFullscreen}
					class="pointer-events-auto bg-black/60 text-white shadow-lg backdrop-blur hover:bg-black/80"
					aria-label="Exit fullscreen"
				>
					<Minimize class="size-4" />
					Exit
				</Button>
			{/if}
		</div>
	{/if}
</div>
