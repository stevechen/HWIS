<!-- ⚠️ PROTOTYPE — Variant A: roomy week rows, full cards with note boxes. -->
<script lang="ts">
	import type { WeekFragment } from './fixture';

	let { fragments }: { fragments: WeekFragment[] } = $props();
	let notes = $state<Record<string, string>>({});

	function chip(status: string): string {
		switch (status) {
			case 'off':
				return 'bg-stone-700 text-white';
			case 'no_class':
				return 'bg-amber-200 text-amber-900';
			case 'exam':
				return 'bg-red-600 text-white';
			case 'oral':
				return 'bg-orange-100 text-orange-900';
			default:
				return 'bg-emerald-100 text-emerald-900';
		}
	}
</script>

<div class="space-y-4">
	{#each fragments as frag (`${frag.year}-${frag.month}-w${frag.weekIndex}`)}
		<section class="rounded-lg border bg-white shadow-sm">
			<h2 class="rounded-t-lg bg-emerald-800 px-4 py-1.5 text-sm font-bold text-white">
				School week {frag.weekIndex}
			</h2>
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
			<div class="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each frag.cards as card (`${card.date}-p${card.period}`)}
					<article
						class="rounded-lg border p-3 {card.status === 'exam'
							? 'border-red-300 bg-red-50'
							: card.status === 'teaching' || card.status === 'oral'
								? 'border-emerald-200'
								: 'border-stone-300 bg-stone-100 opacity-90'}"
					>
						<header class="flex flex-wrap items-center gap-1.5">
							<span class="font-semibold">{card.date.slice(5)} {card.weekdayName.slice(0, 3)}</span>
							<span class="text-xs text-stone-500">P{card.period}</span>
							<span class="rounded px-1.5 py-0.5 text-xs font-bold {chip(card.status)}">
								{card.status === 'off' ? '🎉 Off' : card.status}
							</span>
							{#if card.countdown}
								<span class="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800"
									>{card.countdown}</span
								>
							{/if}
						</header>
						{#if card.cause}
							<p class="mt-1 text-xs font-semibold text-stone-600">{card.cause}</p>
						{/if}
						{#each card.badges as b (b)}
							<p class="mt-1 text-xs text-indigo-700">{b}</p>
						{/each}
						<textarea
							rows="2"
							placeholder="Meeting note… (stub, not saved)"
							class="mt-2 w-full rounded border border-stone-300 p-1.5 text-sm"
							bind:value={notes[`${card.date}-p${card.period}`]}
						></textarea>
					</article>
				{/each}
			</div>
		</section>
	{/each}
</div>
