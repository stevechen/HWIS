<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Ellipsis, MapPin, Users } from '@lucide/svelte';
	import {
		monthName,
		slash,
		type CalendarCardStatus,
		type CalendarWeekFragment
	} from './calendar-weeks';

	/**
	 * The teacher's per-class semester calendar (ticket #196): week-keyed
	 * semester rows, roomy date cards with always-visible note boxes, sticky
	 * toolbar with the ellipsis class menu. Presentational only — rows arrive
	 * from the `teacherDays` join via `buildCalendarFragments`, notes arrive
	 * as a `date → text` map that degrades to empty while the query loads,
	 * and saves leave through `onSaveNote`. No Convex imports, so tests drive
	 * it entirely through props.
	 */

	export interface CalendarClassOption {
		id: string;
		name: string;
		short: string;
		type: string;
		room: string | null;
		headcount: number;
	}

	let {
		classes = [],
		selectedClassId = '',
		semesterLabel = '',
		today = '',
		fragments = [],
		nextDate = null,
		notes = {},
		onSelectClass = () => {},
		onSaveNote = () => {}
	}: {
		classes?: CalendarClassOption[];
		selectedClassId?: string;
		semesterLabel?: string;
		today?: string;
		fragments?: CalendarWeekFragment[];
		nextDate?: string | null;
		notes?: Record<string, string>;
		onSelectClass?: (classId: string) => void;
		onSaveNote?: (date: string, text: string) => void;
	} = $props();

	const selected = $derived(
		classes.find((option) => option.id === selectedClassId) ?? classes[0] ?? null
	);

	let menuOpen = $state(false);
	/** In-flight note edits, keyed by date; the saved map wins until typed over. */
	let drafts = $state<Record<string, string>>({});

	function chip(status: CalendarCardStatus): string {
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

	function label(status: CalendarCardStatus): string {
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

	function cellTone(status: CalendarCardStatus, past: boolean): string {
		const base =
			status === 'exam'
				? 'bg-red-50'
				: status === 'teaching' || status === 'partial' || status === 'oral'
					? 'bg-white'
					: 'bg-stone-100';
		return past ? `${base} opacity-80 saturate-50` : base;
	}

	/** The week holding today, or the last week once the term is over. */
	function currentWeek(): number {
		const hit = fragments.find((fragment) => fragment.cards.some((card) => card.date >= today));
		return (hit ?? fragments[fragments.length - 1])?.weekIndex ?? 0;
	}

	async function scrollToWeek(week: number) {
		await tick();
		document.getElementById(`week-${week}`)?.scrollIntoView({ block: 'start' });
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape') menuOpen = false;
	}

	onMount(() => {
		scrollToWeek(currentWeek());
	});
</script>

<svelte:window onkeydown={onKey} />

<div data-testid="teacher-calendar.root">
	{#if selected}
		<div
			class="sticky top-0 z-40 -mx-4 border-b border-emerald-900/10 bg-white/95 px-4 py-2 shadow-sm backdrop-blur sm:-mx-8 sm:px-8"
		>
			<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
				<h1
					class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xl font-bold text-emerald-900"
				>
					<span class="truncate">{selected.short} {selected.type}</span>
					<span class="inline-flex items-center gap-1 font-normal">
						<Users class="size-4 shrink-0" aria-hidden="true" />
						{selected.headcount}
					</span>
					<span class="inline-flex items-center gap-1 font-normal">
						<MapPin class="size-4 shrink-0" aria-hidden="true" />
						{selected.room ?? 'No room'}
					</span>
				</h1>
				<div class="relative shrink-0">
					<button
						class="rounded-[12px] border border-stone-300 bg-white p-2 text-stone-600 hover:bg-stone-100"
						aria-label="Choose class"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						onclick={() => (menuOpen = !menuOpen)}
					>
						<Ellipsis class="size-5" aria-hidden="true" />
					</button>
					{#if menuOpen}
						<div
							role="menu"
							aria-label="Classes"
							class="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
						>
							{#each classes as option (option.id)}
								<button
									role="menuitemradio"
									aria-checked={option.id === selected.id}
									class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-stone-100 {option.id ===
									selected.id
										? 'font-bold text-emerald-900'
										: ''}"
									onclick={() => {
										onSelectClass(option.id);
										menuOpen = false;
									}}
								>
									<span class="w-5 shrink-0">{option.id === selected.id ? '✓' : ''}</span>
									{option.short}
									{option.type}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
				<span class="text-muted-foreground text-sm">{semesterLabel}</span>
				<button
					class="ml-auto rounded-full border border-emerald-700 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
					onclick={() => scrollToWeek(currentWeek())}>● Today</button
				>
			</div>
		</div>
	{/if}

	<div class="mt-3 overflow-hidden rounded-lg border bg-white shadow-sm">
		{#each fragments as fragment, index (`w${fragment.weekIndex}`)}
			{@const previousCards = index > 0 ? fragments[index - 1].cards : []}
			{@const crossed =
				previousCards.length > 0 &&
				fragment.cards.length > 0 &&
				previousCards[previousCards.length - 1].date.slice(0, 7) !==
					fragment.cards[0].date.slice(0, 7)}
			{#if crossed}
				<div
					class="border-b bg-stone-200/70 px-3 py-1 text-xs font-bold tracking-widest text-stone-600 uppercase"
				>
					{monthName(fragment.cards[0].date.slice(0, 7))}
				</div>
			{/if}
			<section
				id="week-{fragment.weekIndex}"
				data-testid="teacher-calendar.week-{fragment.weekIndex}"
				class="flex scroll-mt-32 items-stretch border-b last:border-b-0"
			>
				<div
					class="flex w-10 shrink-0 items-center justify-center bg-emerald-800 py-3 text-sm font-bold text-white"
				>
					{fragment.weekIndex}
				</div>
				<div class="min-w-0 flex-1">
					{#if fragment.banners.length > 0}
						<div class="flex flex-wrap gap-1.5 border-b bg-indigo-50/60 px-3 py-1.5">
							{#each fragment.banners as banner (`${banner.title}|${banner.start}|${banner.end}`)}
								<span
									class="rounded-full bg-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-900"
								>
									{banner.title} · {slash(banner.start)}–{slash(banner.end)}
								</span>
							{/each}
						</div>
					{/if}
					<div class="grid gap-px bg-stone-200 p-px sm:grid-cols-2 lg:grid-cols-3">
						{#each fragment.cards as card, cardIndex (`${card.date}-p${card.period}`)}
							{@const newMonth =
								cardIndex > 0 &&
								fragment.cards[cardIndex - 1].date.slice(0, 7) !== card.date.slice(0, 7)}
							<article
								data-testid="teacher-calendar.card-{card.date}"
								class="relative p-3 {cellTone(card.status, card.past)}{newMonth
									? ' month-divide'
									: ''}"
							>
								{#if card.past}
									<div
										class="past-hatch"
										data-testid="teacher-calendar.past-{card.date}"
										aria-hidden="true"
									></div>
								{/if}
								<header class="flex flex-wrap items-center gap-1.5">
									<span class="font-semibold">{slash(card.date)} {card.weekdayLabel}</span>
									{#if card.status !== 'off' && card.status !== 'no_class' && card.status !== 'exam'}
										<span class="text-xs text-stone-500">P{card.period}</span>
									{/if}
									{#if card.status !== 'teaching' && card.status !== 'partial'}
										<span class="rounded px-1.5 py-0.5 text-xs font-bold {chip(card.status)}">
											{label(card.status)}
										</span>
									{/if}
									{#if card.isToday}
										<span class="rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white"
											>● Today</span
										>
									{:else if nextDate !== null && card.date === nextDate}
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
								{#each card.badges as badge (badge)}
									<p class="mt-1 text-xs text-indigo-700">{badge}</p>
								{/each}
								<textarea
									aria-label="Note for {card.date}"
									rows="2"
									placeholder="Note down progress, prep, history…"
									class="mt-2 w-full rounded border border-stone-300 p-1.5 text-sm"
									value={drafts[card.date] ?? notes[card.date] ?? ''}
									oninput={(event) => {
										drafts[card.date] = event.currentTarget.value;
									}}
									onchange={(event) => {
										onSaveNote(card.date, event.currentTarget.value);
									}}
								></textarea>
							</article>
						{/each}
					</div>
				</div>
			</section>
		{/each}
	</div>
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
