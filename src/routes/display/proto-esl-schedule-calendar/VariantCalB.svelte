<!-- ⚠️ PROTOTYPE — Variant B: compact week rows, one line per date-card.
	 Iteration 2: vertical week rail, no "teaching" mark, past shading + Today/Next. -->
<script lang="ts">
	import type { WeekFragment } from './fixture';

	let { fragments, next }: { fragments: WeekFragment[]; next: string | null } = $props();
	let notes = $state<Record<string, string>>({});
</script>

<div class="overflow-hidden rounded-lg border bg-white shadow-sm">
	{#each fragments as frag (`${frag.year}-${frag.month}-w${frag.weekIndex}`)}
		<section class="flex items-stretch border-b last:border-b-0">
			<div
				class="flex w-12 shrink-0 items-center justify-center bg-emerald-800 py-2 text-sm font-bold text-white [writing-mode:vertical-rl]"
			>
				Week {frag.weekIndex}
			</div>
			<div class="min-w-0 flex-1">
				{#if frag.banners.length > 0}
					<p class="border-b bg-indigo-50/60 px-3 py-1 text-xs text-indigo-900">
						{frag.banners
							.map((b) => `${b.title} ${b.start.slice(5)}–${b.end.slice(5)}`)
							.join(' · ')}
					</p>
				{/if}
				<ul class="divide-y divide-stone-100">
					{#each frag.cards as card (`${card.date}-p${card.period}`)}
						<li
							class="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[13px] {card.status ===
							'exam'
								? 'bg-red-50'
								: card.status === 'teaching' || card.status === 'oral'
									? card.past
										? 'bg-stone-50 text-stone-400'
										: ''
									: 'bg-stone-100 text-stone-500'}"
						>
							<span class="w-20 shrink-0 font-semibold"
								>{card.date.slice(5)} {card.weekdayName.slice(0, 3)}</span
							>
							<span class="w-14 shrink-0 text-stone-500">P{card.period}</span>
							{#if card.status !== 'teaching'}
								<span class="font-bold">[{card.status === 'off' ? '🎉 off' : card.status}]</span>
							{/if}
							{#if card.isToday}<span class="font-bold text-emerald-700">[today]</span>
							{:else if card.date === next}<span class="font-bold text-sky-700">[next]</span>{/if}
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
			</div>
		</section>
	{/each}
</div>
