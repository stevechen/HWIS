<script lang="ts">
	import { monthRuns } from './wizard-dates';
	import type { PreviewDay, PreviewWeek } from './wizard-dates';

	/**
	 * Semester calendar preview (spec #215, stories 15–20, as amended by
	 * feedback F5/F6/F12/F15/F18/F20/F21/F23/F24/F27/F28/F33/F34/F36/F37/F68 and
	 * by the month-gutter rework). School-week rows with week numbers and a
	 * weekday header row, grey off-day chips and red exam chips. Cells fill
	 * fixed 4.9rem grid tracks (F68: 5 weekday columns × 4.9rem = same 24.5rem
	 * total; weekends removed, and ~44px tall (F43: `min-h-11`) — net
	 * calendar height does not grow.
	 *
	 * MONTH GUTTER REWORK (replaces F40's in-grid month title rows, which
	 * are gone): the calendar body is ONE grid —
	 * `2rem month | 2rem week | 4.9rem × 5 days` — with the header as
	 * row 1 and each week row a `display: contents` wrapper, so a month
	 * band can `grid-row: r / span n` and merge vertically across the
	 * week rows it owns. Bands come from `monthRuns` (last in-range
	 * weekday wins a straddle row), are light slate `bg-slate-200
	 * text-slate-700` so they recede beside the dark week gutter, and
	 * carry a 2px margin top and bottom — inside the run the band is
	 * continuous; the separation is per BAND, not per week. A run whose
	 * days are all out of range desaturates to `bg-gray-100
	 * text-gray-400`. Labels are plain 3-letter badges, VERTICALLY
	 * CENTERED in the band, with no year suffix; the `title` is the bare
	 * badge. The weekday headers are right-aligned on `px-1` so each label
	 * sits directly over its day numbers (also right-aligned).
	 *
	 * The week gutter now reads as a bare number under a `WK` header
	 * (was `W1`, `W2`, …). Header cells are `MTH`, `WK`, then the
	 * weekdays, uppercased and tracked so the month header can't be
	 * confused with the Monday weekday label. Day cells keep their 1px
	 * dividers but take them from explicit `border-r`/`border-b` (+`border-t`
	 * on the opening row, `border-l` on the first day column) instead of
	 * the old `-mt-px -ml-px` overlap, which in a shared grid would bleed
	 * 1px into the week gutter's 3px border.
	 *
	 * Feedback F34: week rows are flush (no vertical gaps) so the whole
	 * semester compresses into one view. No internal scroll container: the
	 * page scrolls and every week renders whole. Table-like cells (F24): zero
	 * inter-cell gaps with collapsed single-pixel dividers. Read-only by
	 * default; `interactive` enables date clicks (Step 3 exam picking, F37:
	 * dialog-free — a click SETS the range immediately) with `highlighted`
	 * marking the hover preview range (`onDateHover` reports the hovered
	 * date so the parent can fan it out). `disabledDates` greys out days
	 * taken by another exam (F25) — those cells are unclickable with a
	 * quiet tooltip (F23/F25: refuse-by-construction, so double-booking is
	 * impossible and no conflict badges exist). CONFIRMED exam dates always
	 * keep their red chip (F28) — even when taken relative to the active
	 * tab, where they stay unclickable but never read as grey. Presentational
	 * — weeks arrive prebuilt from `buildPreviewWeeks`.
	 */

	let {
		weeks,
		interactive = false,
		clickableChips = false,
		highlighted = [],
		disabledDates = [],
		disabledTooltips = {},
		onDateClick = () => {},
		onDateHover = () => {},
		testId = 'calendar-preview'
	}: {
		weeks: PreviewWeek[];
		interactive?: boolean;
		/**
		 * Step 5 preview (#223): off/exam chips stay clickable so a click
		 * can open that day's event for editing. Defaults off — Steps 3–4
		 * keep refuse-by-construction (chips unclickable).
		 */
		clickableChips?: boolean;
		highlighted?: string[];
		disabledDates?: string[];
		disabledTooltips?: Record<string, string>;
		onDateClick?: (date: string, event?: MouseEvent) => void;
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

	/**
	 * Month bands for the left column. Header is grid row 1, so week row
	 * `row` (0-based) lands on grid row `row + 2`.
	 */
	const runs = $derived(monthRuns(weeks));

	/** Header cell shared look — uppercased + tracked so `MTH` never reads as the Monday weekday. */
	const HEADER_LABEL =
		'flex items-center justify-center py-0.5 text-[11px] font-bold tracking-widest uppercase';
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

	<div
		data-testid={`${testId}.month-col`}
		class="grid w-max grid-cols-[2rem_2rem_repeat(5,4.9rem)] gap-0"
	>
		<!-- Header is grid row 1. Month bands and week rows sit below it. -->
		<div style="grid-column: 1; grid-row: 1;" class="{HEADER_LABEL} text-slate-600">MTH</div>
		<div style="grid-column: 2; grid-row: 1;" class="{HEADER_LABEL} text-slate-600">WK</div>
		{#each WEEKDAY_HEADER as label, col (label)}
			<div
				style="grid-column: {3 + col}; grid-row: 1;"
				class="min-w-0 px-1 py-0.5 text-right text-[11px] font-semibold text-gray-500"
			>
				{label}
			</div>
		{/each}

		<!-- One merged cell per month, spanning the week rows that month
			owns. 2px above and below each RUN (never inside it) so bands
			separate without breaking the merge. The abbreviation is centred
			vertically in the band; `px-1` matches the day cells so the label
			sits over its day numbers, which are right-aligned too. -->
		{#each runs as run, runIndex (run.label)}
			<div
				data-testid={`${testId}.month-${run.label}`}
				data-month={run.label}
				data-rows={run.rows}
				title={run.label}
				style="grid-column: 1; grid-row: {run.startRow + 2} / span {run.rows};"
				class="mt-[2px] flex min-w-0 items-center justify-center overflow-hidden px-1 text-center text-[10px] font-bold tracking-widest {run.outOfRange
					? 'bg-gray-100 text-gray-400'
					: 'bg-slate-200 text-slate-700'} {runIndex === runs.length - 1 ? 'mb-[2px]' : ''}"
			>
				{run.label}
			</div>
		{/each}

		{#each weeks as week, row (week.monday)}
			<div data-testid={`${testId}.week-${week.weekIndex}`} class="contents">
				<!-- Feedback F42 + F44/F47/F48: the week-number gutter reads as a
					label column attached to its OWN week row — its own vertical
					separation (my-px) top AND bottom, first/last included, so the
					blocks read as separate per-week labels without the column
					breaking into loud tiles beside the continuous month band. Day
					grids stay flush. All corners square (F47) — no rounding
					anywhere. The label is the bare school-week number under the
					`WK` header; `title` keeps the full "School week N, starting
					DATE" for hover. -->
				<div
					data-testid={`${testId}.week-${week.weekIndex}-number`}
					title={`School week ${week.weekIndex}, starting ${week.monday}`}
					style="grid-column: 2; grid-row: {row + 2};"
					class="my-px flex items-center justify-center overflow-hidden border-r-[3px] border-r-slate-800 bg-emerald-950 text-xs font-extrabold tracking-wide text-white"
				>
					{week.weekIndex}
				</div>
				{#each week.days.filter((day) => !day.isWeekend) as day, col (day.date)}
					{@const isHighlighted = highlight.has(day.date)}
					{@const isDisabled = disabled.has(day.date)}
					{@const clickable =
						interactive &&
						day.inRange &&
						!day.isWeekend &&
						(clickableChips || (day.offName === null && day.examLabel === null)) &&
						!isDisabled}
					{@const cellTitle = isDisabled
						? day.examLabel !== null
							? `${day.date} is set in ${day.examLabel} — pick a free day`
							: (disabledTooltips[day.date] ?? `${day.date} is not pickable — pick a free day`)
						: (day.offName ?? day.examLabel ?? day.date)}
					{@const placement = `grid-column: ${3 + col}; grid-row: ${row + 2};`}
					{@const box = `flex min-h-11 w-full flex-col items-stretch justify-start overflow-hidden px-1 py-1 text-[11px] leading-tight ${cellTone(
						day.isWeekend,
						day.inRange,
						day.offName !== null,
						day.examLabel !== null,
						isHighlighted,
						isDisabled
					)} ${row === 0 ? 'border-t' : ''} ${col === 0 ? 'border-l' : ''}`}
					{#if interactive}
						<button
							type="button"
							data-testid={`${testId}.date-${day.date}`}
							disabled={!clickable}
							onclick={(e) => onDateClick(day.date, e)}
							onmouseenter={() => onDateHover(clickable ? day.date : null)}
							onmouseleave={() => onDateHover(null)}
							title={cellTitle}
							style={placement}
							class="{box} border-r border-b {clickable
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
							style={placement}
							class="{box} border-r border-b"
						>
							{@render cellBody(day)}
						</div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>
