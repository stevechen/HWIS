<!-- ⚠️ PROTOTYPE — Variant C: one focus week at a time with prev/next stepping.
	 Iteration 3: numeric week, frameless cells, slash dates, no period/note on
	 off + no-class, no period on exams (note kept), "note" placeholder. -->
<script lang="ts">
	import type { WeekFragment } from './fixture';

	let { fragments, next }: { fragments: WeekFragment[]; next: string | null } = $props();
	let notes = $state<Record<string, string>>({});
	let at = $state(0);

	const frag = $derived(fragments[Math.min(at, Math.max(0, fragments.length - 1))]);

	function slash(date: string): string {
		return date.slice(5).replace('-', '/');
	}
</script>

{#if frag}
	<div class="rounded-lg border bg-white shadow-sm">
		<div class="flex items-center justify-between rounded-t-lg bg-emerald-800 px-4 py-2">
			<button
				class="rounded px-3 py-1 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-30"
				disabled={at <= 0}
				onclick={() => (at -= 1)}>← Prev</button
			>
			<h2 class="text-sm font-bold text-white">{frag.weekIndex} · {frag.monthLabel}</h2>
			<button
				class="rounded px-3 py-1 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-30"
				disabled={at >= fragments.length - 1}
				onclick={() => (at += 1)}>Next →</button
			>
		</div>
		{#if frag.banners.length > 0}
			<div class="flex flex-wrap gap-1.5 border-b bg-indigo-50/60 px-3 py-1.5">
				{#each frag.banners as b (b.title)}
					<span
						class="rounded-full bg-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-900"
					>
						{b.title} · {slash(b.start)}–{slash(b.end)}
					</span>
				{/each}
			</div>
		{/if}
		<div class="space-y-px bg-stone-200 p-px">
			{#each frag.cards as card (`${card.date}-p${card.period}`)}
				{@const noDetail = card.status === 'off' || card.status === 'no_class'}
				<article
					id="card-{card.date}"
					class="relative p-3 {card.status === 'exam'
						? 'bg-red-50'
						: card.status === 'teaching' || card.status === 'oral'
							? 'bg-white'
							: 'bg-stone-100'} {card.past ? 'opacity-80 saturate-50' : ''}"
				>
					{#if card.past}
						<div class="past-hatch" aria-hidden="true"></div>
					{/if}
					<header class="flex flex-wrap items-baseline gap-2">
						<span class="text-lg font-bold">{slash(card.date)}</span>
						<span class="text-sm text-stone-500">
							{card.weekdayName}{#if !noDetail && card.status !== 'exam'}
								· P{card.period}{/if}{#if !noDetail || card.status === 'exam'}
								· {card.time}{/if}
						</span>
						{#if card.status !== 'teaching'}
							<span class="text-sm font-bold">{card.status === 'off' ? '🎉 Off' : card.status}</span
							>
						{/if}
						{#if card.isToday}
							<span class="rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white"
								>● Today</span
							>
						{:else if card.date === next}
							<span class="rounded bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white"
								>Next →</span
							>
						{/if}
						{#if card.countdown}
							<span class="ml-auto rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
								{card.countdown}
							</span>
						{/if}
					</header>
					{#if card.cause}<p class="mt-1 text-sm font-semibold text-stone-600">{card.cause}</p>{/if}
					{#each card.badges as b (b)}
						<p class="mt-1 text-sm text-indigo-700">{b}</p>
					{/each}
					{#if !noDetail}
						<textarea
							rows="3"
							placeholder="note"
							class="mt-2 w-full rounded border border-stone-300 p-2 text-sm"
							bind:value={notes[`${card.date}-p${card.period}`]}
						></textarea>
					{/if}
				</article>
			{/each}
		</div>
	</div>
{:else}
	<p class="rounded-lg border bg-white p-6 text-center text-sm text-stone-500">
		No meeting dates this month.
	</p>
{/if}

<style>
	.past-hatch {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: repeating-linear-gradient(-45deg, transparent 0 9px, rgb(0 0 0 / 0.07) 9px 11px);
	}
	article:target {
		outline: 3px solid rgb(5 150 105);
		outline-offset: -3px;
	}
</style>
