<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Ellipsis, MapPin, NotebookPen, Timer, Users, Plus } from '@lucide/svelte';
	import { marked } from 'marked';
	import {
		calendarClassLabel,
		formatDay,
		slash,
		type CalendarCardStatus,
		type CalendarWeekFragment
	} from './calendar-weeks';
	import LessonNoteDialog from '$lib/components/esl/LessonNoteDialog.svelte';

	/**
	 * The teacher's per-class semester calendar (ticket #196): week-keyed
	 * semester rows, roomy date cards with note preview, sticky toolbar with
	 * the ellipsis class menu. Presentational only — rows arrive from the
	 * `teacherDays` join via `buildCalendarFragments`, notes arrive as a
	 * `date → text` map that degrades to empty while the query loads, and
	 * saves leave through `onSaveNote`. No Convex imports, so tests drive
	 * it entirely through props. Off and no-class day cards carry no note
	 * preview — there is nothing to annotate on a day without class.
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

	// All weekdays that appear across all fragments, sorted Mon-Fri
	const allWeekdays = $derived(
		Array.from(new Set(fragments.flatMap((f) => f.cards.map((c) => c.weekdayLabel)))).sort(
			(a, b) =>
				['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(a) -
				['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(b)
		)
	);

	let menuOpen = $state(false);

	// Dialog state
	let dialogOpen = $state(false);
	let dialogDate = $state('');
	let dialogWeekday = $state('');
	let dialogInitialContent = $state('');

	function chip(status: CalendarCardStatus): string {
		switch (status) {
			case 'off':
				return 'bg-stone-700 text-white';
			case 'no_class':
			case 'partial':
				return 'bg-amber-200 text-amber-900';
			case 'exam':
				return 'bg-red-600 text-white';
			case 'g9_mock':
				return 'bg-red-100 text-red-800';
			case 'oral':
				return 'bg-orange-100 text-orange-900';
			default:
				return '';
		}
	}

	function sameMonth(
		left: CalendarWeekFragment['cards'][number] | undefined,
		right: CalendarWeekFragment['cards'][number]
	): boolean {
		return left?.date.slice(0, 7) === right.date.slice(0, 7);
	}

	function cardFor(fragment: CalendarWeekFragment | undefined, weekday: string) {
		return fragment?.cards.find((card) => card.weekdayLabel === weekday);
	}

	function monthDividerClass(
		fragmentIndex: number,
		fragment: CalendarWeekFragment,
		day: string,
		card: CalendarWeekFragment['cards'][number]
	): string {
		const dayIndex = allWeekdays.indexOf(day);
		const left = dayIndex > 0 ? cardFor(fragment, allWeekdays[dayIndex - 1]) : undefined;
		const above = cardFor(fragments[fragmentIndex - 1], day);
		const isNewMonthLeft = left !== undefined && !sameMonth(left, card);
		const isNewMonthAbove = above !== undefined && !sameMonth(above, card);

		return [
			isNewMonthLeft && dayIndex > 0 ? 'month-boundary-left' : '',
			isNewMonthAbove ? 'month-boundary-top' : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	function showMonth(date: string): boolean {
		const cards = fragments.flatMap((fragment) => fragment.cards);
		const index = cards.findIndex((card) => card.date === date);
		return index === 0 || cards[index - 1]?.date.slice(0, 7) !== date.slice(0, 7);
	}

	function countdownLabel(countdown: string): string {
		return countdown.replace(/^Class (.+?) to .+$/, '$1');
	}

	function label(status: CalendarCardStatus, cause?: string | null): string {
		switch (status) {
			case 'off':
				return '🎉 Off';
			case 'no_class':
			case 'partial':
				return 'No-class';
			case 'exam':
				return cause ?? 'Exam';
			case 'g9_mock':
				return 'Mock';
			case 'oral':
				return 'Oral Exam';
			default:
				return '';
		}
	}

	function cellTone(status: CalendarCardStatus, past: boolean): string {
		const base =
			status === 'exam' || status === 'g9_mock'
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
		document.getElementById(`week-${week}`)?.scrollIntoView({ block: 'center' });
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape') menuOpen = false;
	}

	function openNoteDialog(date: string, weekday: string) {
		dialogDate = date;
		dialogWeekday = weekday;
		dialogInitialContent = notes[date] ?? '';
		dialogOpen = true;
	}

	function handleSaveNote(content: string) {
		onSaveNote?.(dialogDate, content);
		dialogOpen = false;
	}

	function handleCloseDialog() {
		dialogOpen = false;
	}

	function formatWeekday(dateStr: string): string {
		const [year, month, day] = dateStr.split('-').map(Number);
		const d = new Date(year, month - 1, day);
		return d.toLocaleDateString('en-US', { weekday: 'long' });
	}

	// Render note preview as clamped Markdown
	function renderNotePreview(text: string): string {
		if (!text.trim()) return '';
		const html = marked.parse(text, { async: false });
		return html as string;
	}

	function getClampedPreview(text: string): string {
		if (!text.trim()) return '';
		// Strip markdown syntax for preview
		const plain = text
			.replace(/^#{1,3}\s+/gm, '') // headings
			.replace(/\*\*(.+?)\*\*/g, '$1') // bold
			.replace(/\*(.+?)\*/g, '$1') // italic
			.replace(/`(.+?)`/g, '$1') // code
			.replace(/^[\s]*[-*]\s+/gm, '• ') // bullet lists
			.replace(/^[\s]*\d+\.\s+/gm, '') // numbered lists
			.replace(/^>\s+/gm, '') // blockquotes
			.trim();
		return plain.length > 200 ? plain.slice(0, 200) + '…' : plain;
	}

	onMount(() => {
		scrollToWeek(currentWeek());
	});

	function closeMenuOnOutside(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (!target || !menuOpen) return;
		const button = document.querySelector('.anchor-menu');
		const menu = document.querySelector('.absolute.right-0.z-50');
		if (button && menu && !button.contains(target) && !menu.contains(target)) {
			menuOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', closeMenuOnOutside);
		return () => document.removeEventListener('click', closeMenuOnOutside);
	});
</script>

<svelte:window onkeydown={onKey} />

<div data-testid="teacher-calendar.root">
	{#if selected}
		<div
			class="sticky top-[54px] z-50 -mx-4 border-b border-emerald-900/10 bg-white/95 px-4 py-1 shadow-sm backdrop-blur sm:-mx-8 sm:px-8"
		>
			<div class="flex min-w-0 items-center gap-x-3">
				<h1 class="flex min-w-0 items-center gap-x-2 truncate text-lg font-bold text-emerald-900">
					<span class="truncate">{calendarClassLabel(selected.short, selected.type)}</span>
					<span class="inline-flex items-center gap-1 text-sm font-normal">
						<Users class="size-4 shrink-0" aria-hidden="true" />
						{selected.headcount}
					</span>
					<span class="inline-flex items-center gap-1 text-sm font-normal">
						<MapPin class="size-4 shrink-0" aria-hidden="true" />
						{selected.room ?? 'No room'}
					</span>
				</h1>
				<div class="relative flex shrink-0 items-center gap-2">
					<button
						class="anchor-menu rounded-[12px] border border-stone-300 bg-white px-2 py-1 text-stone-600 hover:bg-stone-100"
						aria-label="Choose class"
						style="anchor-name: --class-menu;"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						onclick={() => (menuOpen = !menuOpen)}
					>
						<Ellipsis class="size-5" aria-hidden="true" />
					</button>
					<button
						class="shrink-0 rounded-full border border-emerald-700 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
						onclick={() => scrollToWeek(currentWeek())}>● Today</button
					>
					{#if menuOpen}
						<div
							role="menu"
							aria-label="Classes"
							class="absolute right-0 z-50 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
							style="position-anchor: --class-menu; top: anchor(bottom); left: anchor(left);"
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
									{calendarClassLabel(option.short, option.type)}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			{#if allWeekdays.length > 0}
				<div class="border-b border-stone-200 bg-stone-200">
					<div
						class="calendar-grid grid grid-cols-[10rem_repeat(var(--day-count),minmax(0,1fr))] gap-0 bg-stone-200 p-0"
						style="--day-count: {allWeekdays.length}"
					>
						<div
							class="flex w-40 shrink-0 items-center justify-center bg-emerald-800 py-3 text-xs font-bold text-white"
						>
							Week
						</div>
						{#each allWeekdays as day}
							{@const weekdayCard = fragments
								.flatMap((fragment) => fragment.cards)
								.find((card) => card.weekdayLabel === day)}
							<div
								class="flex items-center justify-center gap-1 bg-stone-50 px-3 py-2 text-sm font-semibold tracking-wider text-stone-600 uppercase"
							>
								{day}
								<span class="hidden font-normal text-stone-400 lg:inline"
									>{weekdayCard ? ` P${weekdayCard.period}` : ''}</span
								>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<div class="overflow-hidden border-x border-b border-stone-200 bg-white">
		{#each fragments as fragment, index (`w${fragment.weekIndex}`)}
			{@const cardsByWeekday = Object.groupBy(fragment.cards, (card) => card.weekdayLabel)}
			<section
				id="week-{fragment.weekIndex}"
				data-testid="teacher-calendar.week-{fragment.weekIndex}"
			>
				<div
					class="calendar-grid grid grid-cols-[10rem_repeat(var(--day-count),minmax(0,1fr))] grid-rows-[1fr] gap-0 bg-stone-200 p-0"
					style="--day-count: {allWeekdays.length}"
				>
					<!-- Week number column with stacked announcement chips -->
					<div
						class="flex w-40 shrink-0 flex-col items-start justify-start gap-1 border-r border-stone-200 bg-emerald-800 p-2 text-emerald-100"
					>
						<span class="text-lg font-normal text-white">{fragment.weekIndex}</span>
						{#each fragment.banners as banner (`${banner.title}|${banner.windowStart}|${banner.windowEnd}`)}
							<span
								class="mx-1 w-[calc(100%-0.5rem)] rounded bg-indigo-200 px-2 py-1 text-center text-[10px] leading-tight font-semibold break-words text-indigo-900"
								title="{banner.title} · {slash(banner.windowStart)}–{slash(banner.windowEnd)}"
							>
								{banner.title} · {slash(banner.windowStart)}–{slash(banner.windowEnd)}
							</span>
						{/each}
					</div>
					<!-- Day cells container spanning day columns -->
					<div
						class="calendar-days-grid grid grid-cols-[repeat(var(--day-count),minmax(0,1fr))] gap-[1px]"
						style="--day-count: {allWeekdays.length}; grid-column: 2 / -1; background-color: rgb(231 229 228);"
					>
						{#each allWeekdays as day}
							<!-- Flex column so each card stretches to the week-row height:
							the tone fill and past hatch then cover the whole cell even
							when the card content (e.g. no note box on an off day) is
							shorter than its neighbours. -->
							<div class="flex min-h-[120px] min-w-0 flex-col bg-white">
								{#each cardsByWeekday[day] ?? [] as card, cardIndex (`${card.date}-p${card.period}`)}
									{@const newMonth =
										cardIndex > 0 &&
										(cardsByWeekday[day] ?? [])[cardIndex - 1].date.slice(0, 7) !==
											card.date.slice(0, 7)}
									<article
										data-testid="teacher-calendar.card-{card.date}"
										data-date={card.date}
										class="calendar-cell relative flex-1 p-3 {cellTone(
											card.status,
											card.past
										)} {monthDividerClass(index, fragment, day, card)}"
									>
										{#if card.past}
											<div
												class="past-hatch"
												data-testid="teacher-calendar.past-{card.date}"
												aria-hidden="true"
											></div>
										{/if}
										<header
											class="relative flex min-h-[1.25rem] flex-wrap items-center gap-1.5 pr-1"
										>
											<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
												{#if card.countdown}
													<span
														class="inline-flex shrink-0 items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800"
													>
														<Timer class="size-3.5" aria-label="Classes until exam" />
														{countdownLabel(card.countdown)}
													</span>
												{/if}
												{#if card.status !== 'teaching'}
													<span class="rounded px-1.5 py-0.5 text-xs font-bold {chip(card.status)}">
														{label(card.status, card.cause)}
													</span>
												{/if}
												{#if card.isToday}
													<span
														class="rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white"
														>● Today</span
													>
												{:else if nextDate !== null && card.date === nextDate}
													<span
														class="rounded bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white"
														>Next →</span
													>
												{/if}
											</div>
											{#if card.cause && card.status !== 'off' && card.status !== 'exam' && card.status !== 'oral'}
												<span
													class="mx-2 min-w-0 shrink truncate text-center text-xs font-semibold text-stone-600"
													title={card.cause}
												>
													{card.cause}
												</span>
											{/if}
											{#if showMonth(card.date)}
												<span
													class="shrink-0 rounded-full bg-stone-500 px-1.5 py-0.5 text-sm font-semibold text-white"
												>
													{formatDay(card.date, true)}
												</span>
											{:else}
												<span
													class="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-sm font-semibold text-stone-900"
												>
													{formatDay(card.date, false)}
												</span>
											{/if}
										</header>
										{#each card.badges as badge (badge)}
											{#if card.status !== 'oral'}
												<p class="mt-1 text-xs text-indigo-700">{badge}</p>
											{/if}
										{/each}
										{#each card.dues as due (`${due.title}|${due.windowStart}`)}
											<p class="mt-1 text-xs font-semibold text-indigo-700">
												{due.title} · {slash(due.windowStart)}–{slash(due.windowEnd)}
											</p>
										{/each}
										{#if card.status !== 'off' && card.status !== 'no_class'}
											<div class="mt-2 grow">
												{#if notes[card.date]?.trim()}
													<button
														type="button"
														class="w-full min-w-0 overflow-hidden rounded p-2 text-left transition-colors hover:bg-stone-100"
														onclick={() => openNoteDialog(card.date, formatWeekday(card.date))}
														aria-label="Edit note for {card.date}"
													>
														<div
															class="prose line-clamp-3 max-h-12 max-w-none overflow-hidden text-xs leading-tight break-words prose-stone prose-p:my-0 prose-ol:my-1 prose-ul:my-1"
														>
															{@html renderNotePreview(notes[card.date])}
														</div>
													</button>
												{:else}
													<button
														type="button"
														class="flex w-full items-center justify-center rounded border border-dashed border-stone-300 bg-white px-2 py-2 text-stone-500 transition-colors hover:border-stone-400 hover:bg-stone-50"
														onclick={() => openNoteDialog(card.date, formatWeekday(card.date))}
														aria-label="Add lesson note for {card.date}"
													>
														<NotebookPen class="size-4" aria-hidden="true" />
													</button>
												{/if}
											</div>
										{/if}
									</article>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</section>
		{/each}
	</div>

	<!-- Lesson Note Dialog -->
	<LessonNoteDialog
		open={dialogOpen}
		className={selected?.name ?? ''}
		date={dialogDate}
		weekday={dialogWeekday}
		initialContent={dialogInitialContent}
		onSave={handleSaveNote}
		onClose={handleCloseDialog}
	/>
</div>

<style>
	.calendar-grid {
		gap: 1px;
		background-color: rgb(231 229 228);
		border-left: 1px solid rgb(231 229 228);
		border-top: 1px solid rgb(231 229 228);
	}

	.calendar-days-grid {
		border-right: 1px solid rgb(231 229 228);
		border-bottom: 1px solid rgb(231 229 228);
	}

	.calendar-cell.month-boundary-left {
		border-left: 0;
		position: relative;
	}
	.calendar-cell.month-boundary-left::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: -1px;
		width: 3px;
		background: rgb(16 185 129);
		z-index: 2;
	}

	.calendar-cell.month-boundary-top {
		border-top: 0;
		position: relative;
	}
	.calendar-cell.month-boundary-top::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: -1px;
		height: 3px;
		background: rgb(16 185 129);
		z-index: 2;
	}

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
