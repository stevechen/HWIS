<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	type Item = {
		evaluationId: string;
		englishName: string;
		chineseName: string;
		house: string | null;
		classLabel: string | null;
		value: number;
		categoryName: string;
		timestamp: number;
	};

	let { items, mode = 'houses' }: { items: Item[]; mode?: 'houses' | 'classes' } = $props();

	const VISIBLE_MS = 12_000;
	const MAX_VISIBLE = 4;
	// Ignore anything older than the page load (plus clock-skew slack) so a
	// refresh doesn't replay the last few evaluations as if they just happened.
	const STALE_MS = 30_000;

	type Visible = Item & { key: string };
	let visible = $state<Visible[]>([]);
	const seen = new SvelteSet<string>();
	const timers: ReturnType<typeof setTimeout>[] = [];
	const mountTime = Date.now();

	$effect(() => {
		const list = Array.isArray(items) ? items : [];
		for (const item of list) {
			if (seen.has(item.evaluationId)) continue;
			seen.add(item.evaluationId);
			if (item.timestamp < mountTime - STALE_MS) continue;
			const key = `${item.evaluationId}:${visible.length}`;
			visible = [{ ...item, key }, ...visible].slice(0, MAX_VISIBLE);
			timers.push(
				setTimeout(() => {
					visible = visible.filter((v) => v.key !== key);
				}, VISIBLE_MS)
			);
		}
	});

	onDestroy(() => {
		for (const t of timers) clearTimeout(t);
	});

	const houseChip: Record<string, string> = {
		Heracles: 'bg-red-500/25 text-red-200 ring-red-400/40',
		Wukong: 'bg-amber-500/25 text-amber-200 ring-amber-400/40',
		Ixbalam: 'bg-sky-500/25 text-sky-200 ring-sky-400/40',
		Setna: 'bg-emerald-500/25 text-emerald-200 ring-emerald-400/40'
	};
</script>

{#if visible.length > 0}
	<div
		class="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col gap-2"
		aria-live="polite"
	>
		{#each visible as item (item.key)}
			<div
				class="feed-item flex items-center gap-2 rounded-full bg-slate-950/70 py-2 pr-5 pl-3 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur-md"
			>
				{#if item.value >= 0}
					<span class="text-lg leading-none text-emerald-400" aria-hidden="true">+</span>
					<span class="text-base leading-none font-black text-emerald-300">{item.value}</span>
				{:else}
					<span class="text-base leading-none font-black text-red-400">{item.value}</span>
				{/if}
				<span class="min-w-0 truncate">{item.englishName}</span>
				{#if item.chineseName}
					<span class="text-xs text-white/50">{item.chineseName}</span>
				{/if}
				{#if mode === 'houses' && item.house && houseChip[item.house]}
					<span class="rounded-full px-2 py-0.5 text-xs ring-1 {houseChip[item.house]}">
						{item.house}
					</span>
				{:else if mode === 'classes' && item.classLabel}
					<span
						class="rounded-full bg-indigo-500/25 px-2 py-0.5 text-xs text-indigo-200 ring-1 ring-indigo-400/40"
					>
						{item.classLabel}
					</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.feed-item {
		animation: feedIn 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	@keyframes feedIn {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.85);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
