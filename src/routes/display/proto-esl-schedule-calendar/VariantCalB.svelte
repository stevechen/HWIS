<!-- ⚠️ PROTOTYPE — Variant B: compact week rows, one line per date-card. -->
<script lang="ts">
	import type { WeekFragment } from './fixture';

	let { fragments }: { fragments: WeekFragment[] } = $props();
	let notes = $state<Record<string, string>>({});
</script>

<div class="space-y-4">
	{#each fragments as frag (`${frag.year}-${frag.month}-w${frag.weekIndex}`)}
		<section class="overflow-hidden rounded-lg border bg-white shadow-sm">
			<h2 class="bg-emerald-800 px-4 py-1.5 text-sm font-bold text-white">
				School week {frag.weekIndex}
				{#if frag.banners.length > 0}
					<span class="ml-2 font-normal text-indigo-200">
						{frag.banners
							.map((b) => `${b.title} ${b.start.slice(5)}–${b.end.slice(5)}`)
							.join(' · ')}
					</span>
				{/if}
			</h2>
			<ul class="divide-y">
				{#each frag.cards as card (`${card.date}-p${card.period}`)}
					<li
						class="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[13px] {card.status === 'exam'
							? 'bg-red-50'
							: card.status === 'teaching' || card.status === 'oral'
								? ''
								: 'bg-stone-100 text-stone-500'}"
					>
						<span class="w-20 shrink-0 font-semibold"
							>{card.date.slice(5)} {card.weekdayName.slice(0, 3)}</span
						>
						<span class="w-14 shrink-0 text-stone-500">P{card.period}</span>
						{#if card.status !== 'teaching'}
							<span class="font-bold">[{card.status === 'off' ? '🎉 off' : card.status}]</span>
						{/if}
						{#if card.cause}<span class="text-stone-600">{card.cause}</span>{/if}
						{#if card.countdown}<span class="text-sky-700">{card.countdown}</span>{/if}
						{#each card.badges as b (b)}<span class="text-indigo-700">{b}</span>{/each}
						<input
							placeholder="Note…"
							class="min-w-32 flex-1 rounded border border-stone-200 px-1.5 py-0.5 text-[13px]"
							bind:value={notes[`${card.date}-p${card.period}`]}
						/>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
