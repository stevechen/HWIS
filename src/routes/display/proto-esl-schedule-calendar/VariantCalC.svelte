<!-- ⚠️ PROTOTYPE — Variant C: one focus week at a time with prev/next stepping. -->
<script lang="ts">
	import type { WeekFragment } from './fixture';

	let { fragments }: { fragments: WeekFragment[] } = $props();
	let notes = $state<Record<string, string>>({});
	let at = $state(0);

	const frag = $derived(fragments[Math.min(at, Math.max(0, fragments.length - 1))]);
</script>

{#if frag}
	<div class="rounded-lg border bg-white shadow-sm">
		<div class="flex items-center justify-between rounded-t-lg bg-emerald-800 px-4 py-2">
			<button
				class="rounded px-3 py-1 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-30"
				disabled={at <= 0}
				onclick={() => (at -= 1)}>← Prev</button
			>
			<h2 class="text-sm font-bold text-white">School week {frag.weekIndex}</h2>
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
						{b.title} · {b.start.slice(5)}–{b.end.slice(5)}
					</span>
				{/each}
			</div>
		{/if}
		<div class="space-y-2 p-3">
			{#each frag.cards as card (`${card.date}-p${card.period}`)}
				<article
					class="rounded-lg border p-3 {card.status === 'exam'
						? 'border-red-300 bg-red-50'
						: card.status === 'teaching' || card.status === 'oral'
							? 'border-emerald-200'
							: 'border-stone-300 bg-stone-100 opacity-90'}"
				>
					<header class="flex flex-wrap items-baseline gap-2">
						<span class="text-lg font-bold">{card.date.slice(5)}</span>
						<span class="text-sm text-stone-500"
							>{card.weekdayName} · P{card.period} · {card.time}</span
						>
						{#if card.status !== 'teaching'}
							<span class="text-sm font-bold">{card.status === 'off' ? '🎉 Off' : card.status}</span
							>
						{/if}
						{#if card.countdown}
							<span class="ml-auto rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
								{card.countdown} to Exam
							</span>
						{/if}
					</header>
					{#if card.cause}<p class="mt-1 text-sm font-semibold text-stone-600">{card.cause}</p>{/if}
					{#each card.badges as b (b)}
						<p class="mt-1 text-sm text-indigo-700">{b}</p>
					{/each}
					<textarea
						rows="3"
						placeholder="Meeting note: progress, prep, history… (stub, not saved)"
						class="mt-2 w-full rounded border border-stone-300 p-2 text-sm"
						bind:value={notes[`${card.date}-p${card.period}`]}
					></textarea>
				</article>
			{/each}
		</div>
	</div>
{:else}
	<p class="rounded-lg border bg-white p-6 text-center text-sm text-stone-500">
		No meeting dates this month.
	</p>
{/if}
