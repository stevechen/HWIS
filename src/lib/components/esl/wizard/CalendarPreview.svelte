<script lang="ts">
	import { rowMonthSpans } from './wizard-dates';
	import type { PreviewDay, PreviewWeek } from './wizard-dates';

	/**
	 * Semester calendar preview (spec #215, stories 15–20, as amended by
	 * feedback F5/F6/F12/F15/F18/F20/F21/F23/F24/F27/F28/F33/F34/F36/F37/F68). School-week rows with
	 * week numbers and a weekday header row, grey off-day chips and red exam chips. Cells fill fixed
	 * 4.9rem grid tracks (F68: 5 weekday columns × 4.9rem = same 24.5rem total; weekends removed,
	 * and ~44px tall (F43: `min-h-11` — the across-week month title row
	 * added vertical bulk, so day-cell height came back down from 64px to
	 * compensate; net calendar height does not grow). Feedback F40: NO per-cell month badges (F33 removed) and NO
	 * side-gutter month label (F36 removed) — each week ROW carries merged
	 * month title cells spanning ACROSS the top of the row INSIDE the grid:
	 * consecutive days in the same month grouped under ONE title cell
	 * (grid-column span = day count); a straddle week shows TWO titles
	 * (e.g. DEC across Dec 28–31 + JAN across Jan 1–3); a single-month week
	 * shows one title across all 5. Titles are merged header cells (white
	 * text on slate), aligned over their days via the same 4.9rem
	 * tracks, derived from the row's weekday dates via `rowMonthSpans`.
	 * The day number is the plain day of month, small (text-xs) at the
	 * top-right corner, no leading zeros; chips stack beneath as before.
	 * Feedback F34: week
	 * rows are flush (no vertical gaps, hairline 1px dividers via -mt-px
	 * border overlap) so the whole semester compresses into one view. No
	 * internal scroll container: the page scrolls and every week renders
	 * whole. Table-like cells (F24): zero inter-cell gaps with collapsed
	 * single-pixel dividers. Read-only by default;
	 * `interactive` enables date clicks (Step 3 exam picking, F37:
	 * dialog-free — a click SETS the range immediately) with `highlighted`
	 * marking the hover preview range (`onDateHover` reports the hovered
	 * date so the parent can fan it out). `disabledDates` greys out
	 * days taken by another exam (F25) — those cells are
	 * unclickable with a quiet tooltip (F23/F25: refuse-by-construction, so
	 * double-booking is impossible and no conflict badges exist). CONFIRMED
	 * exam dates always keep their red chip (F28) — even when taken
	 * relative to the active tab, where they stay unclickable but never
	 * read as grey. Presentational — weeks arrive prebuilt from
	 * `buildPreviewWeeks`.
	 */

	let {
		weeks,
		interactive = false,
		highlighted = [],
		disabledDates = [],
		disabledTooltips = {},
		onDateClick = () => {},
		onDateHover = () => {},
		testId = 'calendar-preview'
	}: {
		weeks: PreviewWeek[];
		interactive?: boolean;
		highlighted?: string[];
		disabledDates?: string[];
		disabledTooltips?: Record<string, string>;
		onDateClick?: (date: string) => void;
		onDateHover?: (date: string | null) => void;
		testId?: string;
	} = $props();

	const highlight = $derived(new Set(highlighted));
	const disabled = $derived(new Set(disabledDates));

	function dayNum(date: string): number {
		return Number(date.slice(8, 10));
	}

	function cellTone(
		isWeekend: boolean,
		inRange: boolean,
		hasOff: boolean,
		hasExam: boolean,
		isHighlighted: boolean,
		isDisabled: boolean
	): string {
		if (!inRange) return 'border-gray-100 bg-gray-50 text-gray-300';
		// Feedback F28: a CONFIRMED exam date keeps its red identity even
		// when taken relative to the active tab (still unclickable there —
		// `clickable` below is unchanged — but never grey). Grey/disabled
		// reads are reserved for unclickable starts with no exam chip
		// (F37: free days whose fan-out would cross another exam).
		if (hasExam) return 'border-red-500 bg-red-100 text-red-900';
		// Feedback F23: refuse-by-construction — a day taken by another
		// exam reads as greyed/disabled. No conflict
		// badges exist; the mistake is impossible, so there is nothing to
		// label. Feedback F39: the grey set is CONFIRMED days only — free
		// starts whose fan-out would cross another exam stay clickable and
		// are refused by the parent's set guard instead, so a pick blocks
		// exactly its own days (2 for Exam 1/2, 3 for Final). Real Step 3
		// ticket #221 should mirror backend `assertExclusive`
		// (forbid, not warn). Feedback F46: free starts whose fan-out would
		// overflow the term window are the exception — those arrive DISABLED
		// (grey, via the parent disabled set) with an overflow tooltip.
		if (isDisabled) return 'border-gray-300 bg-gray-200 text-gray-500';
		if (isHighlighted) return 'border-emerald-500 bg-emerald-100 text-emerald-900';
		if (hasOff) return 'border-stone-300 bg-stone-200 text-stone-600';
		// Feedback F5: weekends read as red text on a plain background —
		// no shaded weekend fill, so off/exam chips stay unambiguous.
		if (isWeekend) return 'border-gray-200 bg-white text-red-600';
		return 'border-gray-200 bg-white text-gray-800';
	}

	const WEEKDAY_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
</script>

{#snippet cellBody(day: PreviewDay)}
	<span class="self-end text-right text-xs font-semibold tracking-tight">{dayNum(day.date)}</span>
	{#if day.examLabel !== null}
		<span
			class="mt-0.5 max-w-full rounded bg-red-600 px-1 py-px text-center text-[10px] font-bold break-words text-white"
			>{day.examLabel}</span
		>
	{:else if day.offName !== null}
		<span class="mt-0.5 max-w-full text-center text-[10px] break-words"
			>🎉 {day.offName.replace('Mock: ', '')}</span
		>
	{:else if !day.inRange}
		<span class="text-[10px]">·</span>
	{/if}
{/snippet}

<div data-testid={testId} class="space-y-3">
	<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
		<span class="flex items-center gap-1">
			<span class="inline-block size-3 rounded border border-stone-300 bg-stone-200"></span> Off day
		</span>
		<span class="flex items-center gap-1">
			<span class="inline-block size-3 rounded border border-red-500 bg-red-100"></span> Exam
		</span>
		{#if interactive}
			<span class="flex items-center gap-1">
				<span class="inline-block size-3 rounded border border-emerald-500 bg-emerald-100"></span>
				Hover preview
			</span>
		{/if}
		{#if interactive || disabled.size > 0}
			<span class="flex items-center gap-1">
				<span class="inline-block size-3 rounded border border-gray-300 bg-gray-200"></span>
				Taken in another exam
			</span>
		{/if}
	</div>

	<div class="space-y-0">
		<div class="flex items-stretch gap-0" aria-hidden="true">
			<div class="w-8 shrink-0"></div>
			<div class="grid shrink-0 grid-cols-[repeat(5,4.9rem)] gap-0">
				{#each WEEKDAY_HEADER as label (label)}
					<div class="min-w-0 px-0 py-0.5 text-center text-[11px] font-semibold text-gray-500">
						{label}
					</div>
				{/each}
			</div>
		</div>
		{#each weeks as week (week.monday)}
			<div data-testid={`${testId}.week-${week.weekIndex}`} class="flex items-stretch gap-0">
				<!-- Feedback F42 + F44/F47/F48: the week-number gutter reads as a
					label column attached to its OWN week row — each dark
					W-number block carries its own 2px vertical white
					separation (my-[2px]) top AND bottom, first/last included,
					so the blocks read as separate per-week labels. Day grids
					stay flush (space-y-0, hairline dividers via -mt-px). All
					corners square (F47) — no rounding anywhere on the grid. -->
				<div
					class="my-[2px] flex w-8 shrink-0 items-center justify-center border-r-[3px] border-r-slate-800 bg-emerald-950 text-xs font-extrabold tracking-wide text-white"
					title={`School week ${week.weekIndex}, starting ${week.monday}`}
				>
					W{week.weekIndex}
				</div>
				<div
					class="grid shrink-0 grid-cols-[repeat(5,4.9rem)] gap-0 overflow-hidden border border-gray-300"
				>
					<div
						data-testid={`${testId}.week-${week.weekIndex}-months`}
						class="contents"
						aria-hidden="true"
					>
						{#each rowMonthSpans(week.days
								.filter((day) => !day.isWeekend)
								.map((day) => day.date)) as group (group.label)}
							<div
								data-month={group.label}
								data-span={group.span}
								title={`Month for school week ${week.weekIndex}: ${group.label}`}
								style="grid-column: span {group.span} / span {group.span};"
								class="-mt-px -ml-px border border-slate-500 bg-slate-600 px-0 py-0.5 text-center text-[10px] font-bold tracking-widest text-white first:ml-0"
							>
								{group.label}
							</div>
						{/each}
					</div>
					{#each week.days.filter((day) => !day.isWeekend) as day (day.date)}
						{@const isHighlighted = highlight.has(day.date)}
						{@const isDisabled = disabled.has(day.date)}
						{@const clickable =
							interactive && day.inRange && !day.isWeekend && day.offName === null && !isDisabled}
						{@const cellTitle = isDisabled
							? day.examLabel !== null
								? `${day.date} is set in ${day.examLabel} — pick a free day`
								: (disabledTooltips[day.date] ?? `${day.date} is not pickable — pick a free day`)
							: (day.offName ?? day.examLabel ?? day.date)}
						{#if interactive}
							<button
								type="button"
								data-testid={`${testId}.date-${day.date}`}
								disabled={!clickable}
								onclick={() => onDateClick(day.date)}
								onmouseenter={() => onDateHover(clickable ? day.date : null)}
								onmouseleave={() => onDateHover(null)}
								title={cellTitle}
								class="-mt-px -ml-px flex min-h-11 w-full flex-col items-stretch justify-start overflow-hidden border px-1 py-1 text-[11px] leading-tight {cellTone(
									day.isWeekend,
									day.inRange,
									day.offName !== null,
									day.examLabel !== null,
									isHighlighted,
									isDisabled
								)} {clickable
									? 'cursor-pointer hover:border-emerald-500'
									: 'cursor-not-allowed'} {isHighlighted && !isDisabled
									? 'ring-2 ring-emerald-500'
									: ''}"
							>
								{@render cellBody(day)}
							</button>
						{:else}
							<div
								data-testid={`${testId}.date-${day.date}`}
								title={day.offName ?? day.examLabel ?? day.date}
								class="-mt-px -ml-px flex min-h-11 w-full flex-col items-stretch justify-start overflow-hidden border px-1 py-1 text-[11px] leading-tight {cellTone(
									day.isWeekend,
									day.inRange,
									day.offName !== null,
									day.examLabel !== null,
									isHighlighted,
									isDisabled
								)}"
							>
								{@render cellBody(day)}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
