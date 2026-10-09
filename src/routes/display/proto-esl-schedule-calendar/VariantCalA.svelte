<!-- ⚠️ PROTOTYPE — Variant A: roomy week rows, full cards with note boxes.
	 Iteration 2: vertical week rail, no "teaching" chip (default needs none),
	 past shading + Today/Next markers, "Class k/nn to exam" count-up. -->
<script lang="ts">
	import type { WeekFragment } from './fixture';

	let { fragments, next }: { fragments: WeekFragment[]; next: string | null } = $props();
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
				return '';
		}
	}

	function label(status: string): string {
		switch (status) {
			case 'off':
				return '🎉 Off';
			case 'no_class':
				return 'No-class';
			case 'exam':
				return 'Exam';
			case 'oral':
				return 'Oral Exam';
			default:
				return '';
		}
	}

	function cardTone(status: string, past: boolean): string {
		const base =
			status === 'exam'
				? 'border-red-300 bg-red-50'
				: status === 'teaching' || status === 'oral'
					? 'border-emerald-200 bg-white'
					: 'border-stone-300 bg-stone-100';
		return past ? `${base} opacity-70 saturate-50` : base;
	}
</script>

<div class="overflow-hidden rounded-lg border bg-white shadow-sm">
	{#each fragments as frag (`${frag.year}-${frag.month}-w${frag.weekIndex}`)}
		<section class="flex items-stretch border-b last:border-b-0">
			<div
				class="flex w-12 shrink-0 items-center justify-center bg-emerald-800 py-3 text-sm font-bold text-white [writing-mode:vertical-rl]"
			>
				Week {frag.weekIndex}
			</div>
			<div class="min-w-0 flex-1">
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
						<article class="rounded-lg border p-3 {cardTone(card.status, card.past)}">
							<header class="flex flex-wrap items-center gap-1.5">
								<span class="font-semibold"
									>{card.date.slice(5)} {card.weekdayName.slice(0, 3)}</span
								>
								<span class="text-xs text-stone-500">P{card.period}</span>
								{#if card.status !== 'teaching'}
									<span class="rounded px-1.5 py-0.5 text-xs font-bold {chip(card.status)}">
										{label(card.status)}
									</span>
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
			</div>
		</section>
	{/each}
</div>
