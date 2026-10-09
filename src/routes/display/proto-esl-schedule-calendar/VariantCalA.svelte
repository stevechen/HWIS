<!-- ⚠️ PROTOTYPE — Variant A: roomy week rows, full cards with note boxes.
	 Iteration 3: numeric rail, frameless cells, slash dates, diagonal past
	 overlay, no period/note on off + no-class, no period on exams (note kept
	 for proctoring), "note" placeholder, no default chip, count-up wording. -->
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

	function cellTone(status: string, past: boolean): string {
		const base =
			status === 'exam'
				? 'bg-red-50'
				: status === 'teaching' || status === 'oral'
					? 'bg-white'
					: 'bg-stone-100';
		return past ? `${base} opacity-80 saturate-50` : base;
	}

	function slash(date: string): string {
		return date.slice(5).replace('-', '/');
	}
</script>

<div class="overflow-hidden rounded-lg border bg-white shadow-sm">
	{#each fragments as frag (`${frag.year}-${frag.month}-w${frag.weekIndex}`)}
		<section
			id="week-{frag.weekIndex}"
			class="flex scroll-mt-32 items-stretch border-b last:border-b-0"
		>
			<div
				class="flex w-10 shrink-0 items-center justify-center bg-emerald-800 py-3 text-sm font-bold text-white"
			>
				{frag.weekIndex}
			</div>
			<div class="min-w-0 flex-1">
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
				<div class="grid gap-px bg-stone-200 p-px sm:grid-cols-2 lg:grid-cols-3">
					{#each frag.cards as card, i (`${card.date}-p${card.period}`)}
						{@const noDetail = card.status === 'off' || card.status === 'no_class'}
						{@const newMonth =
							i > 0 && frag.cards[i - 1].date.slice(0, 7) !== card.date.slice(0, 7)}
						<article
							id="card-{card.date}"
							class="relative p-3 {cellTone(card.status, card.past)}{newMonth
								? ' month-divide'
								: ''}"
						>
							{#if card.past}
								<div class="past-hatch" aria-hidden="true"></div>
							{/if}
							<header class="flex flex-wrap items-center gap-1.5">
								<span class="font-semibold">{slash(card.date)} {card.weekdayName.slice(0, 3)}</span>
								{#if !noDetail && card.status !== 'exam'}
									<span class="text-xs text-stone-500">P{card.period}</span>
								{/if}
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
									<span class="ml-auto rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800"
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
							{#if !noDetail}
								<textarea
									rows="2"
									placeholder="note"
									class="mt-2 w-full rounded border border-stone-300 p-1.5 text-sm"
									bind:value={notes[`${card.date}-p${card.period}`]}
								></textarea>
							{/if}
						</article>
					{/each}
				</div>
			</div>
		</section>
	{/each}
</div>

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
	/* Month boundary inside a week row. Mobile stacks cards, so the divider
	is horizontal; sm+ lays cards side by side, so it turns vertical.
	Inset shadows divide without shifting layout either way. */
	.month-divide {
		box-shadow: inset 0 3px 0 rgb(5 150 105);
	}
	@media (min-width: 640px) {
		.month-divide {
			box-shadow: inset 3px 0 0 rgb(5 150 105);
		}
	}
</style>
