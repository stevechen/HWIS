<script lang="ts">
	import type { PreviewDay, PreviewWeek } from './wizard-dates';

	/**
	 * Semester calendar preview (spec #215, stories 15–20, as amended by
	 * feedback F5/F6/F12/F15/F18/F20/F21/F23/F24/F27/F28/F33/F34). School-week rows with week
	 * numbers, a weekday header row, weekend dates in red text (no shaded
	 * background), grey off-day chips and red exam chips. Cells are fixed
	 * ~56px squares (F29: `w-14 max-w-14 min-h-16`, fixed 3.5rem grid
	 * tracks, left-aligned — leftover pane space stays empty, cells never
	 * stretch). Feedback F33: every cell carries a month-abbreviation badge
	 * on TOP (white text on sky-700, red-600 on weekends to preserve the
	 * red-weekend read — the one accent avoids red-exam / grey-off /
	 * green-highlight semantics) with the plain day number LARGE and
	 * centered below; chips stack beneath as before. Feedback F34: week
	 * rows are flush (no vertical gaps, hairline 1px dividers via -mt-px
	 * border overlap) so the whole semester compresses into one view. No
	 * internal scroll container: the page scrolls and every week renders
	 * whole. Table-like cells (F24): zero inter-cell gaps with collapsed
	 * single-pixel dividers. Read-only by default;
	 * `interactive` enables date clicks (Step 3 exam picking) with
	 * `highlighted` marking the pending range. `disabledDates` greys out
	 * days taken by another exam's PENDING range (F25) — those cells are
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
		onDateClick = () => {},
		testId = 'calendar-preview'
	}: {
		weeks: PreviewWeek[];
		interactive?: boolean;
		highlighted?: string[];
		disabledDates?: string[];
		onDateClick?: (date: string) => void;
		testId?: string;
	} = $props();

	const highlight = $derived(new Set(highlighted));
	const disabled = $derived(new Set(disabledDates));

	function monthBadge(date: string): string {
		// Feedback F33: the month lives in the top badge, so the big
		// centered number below is the plain day of month.
		const badges = [
			'JAN',
			'FEB',
			'MAR',
			'APR',
			'MAY',
			'JUN',
			'JUL',
			'AUG',
			'SEP',
			'OCT',
			'NOV',
			'DEC'
		] as const;
		return badges[Number(date.slice(5, 7)) - 1] ?? '';
	}

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
		// reads are reserved for pending-taken days, which carry no exam
		// label yet. Previously `isDisabled` won here, so confirming
		// auto-advanced the tab away and the just-set exam rendered as
		// grey "taken" cells with a plain-text label — the user never saw
		// a red Final marking.
		if (hasExam) return 'border-red-500 bg-red-100 text-red-900';
		// Feedback F23: refuse-by-construction — a day taken by another
		// exam's pending range reads as greyed/disabled. No conflict
		// badges exist; the mistake is impossible, so there is nothing to
		// label. Real Step 3 ticket #221 should mirror backend
		// `assertExclusive` (forbid, not warn).
		if (isDisabled) return 'border-gray-300 bg-gray-200 text-gray-500';
		if (isHighlighted) return 'border-emerald-500 bg-emerald-100 text-emerald-900';
		if (hasOff) return 'border-stone-300 bg-stone-200 text-stone-600';
		// Feedback F5: weekends read as red text on a plain background —
		// no shaded weekend fill, so off/exam chips stay unambiguous.
		if (isWeekend) return 'border-gray-200 bg-white text-red-600';
		return 'border-gray-200 bg-white text-gray-800';
	}

	const WEEKDAY_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
</script>

{#snippet cellBody(day: PreviewDay)}
	<span
		class="rounded-sm px-1 text-[9px] font-bold tracking-wider text-white {day.isWeekend
			? 'bg-red-600'
			: 'bg-sky-700'}">{monthBadge(day.date)}</span
	>
	<span class="text-center text-lg font-semibold tracking-tight">{dayNum(day.date)}</span>
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
		<span class="flex items-center gap-1">
			<span
				class="inline-block size-3 rounded border border-gray-200 bg-white text-center text-[8px] leading-3 font-bold text-red-600"
				>S</span
			> Weekend
		</span>
		{#if interactive}
			<span class="flex items-center gap-1">
				<span class="inline-block size-3 rounded border border-emerald-500 bg-emerald-100"></span>
				Pending range
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
			<div class="grid shrink-0 grid-cols-[repeat(7,3.5rem)] gap-0">
				{#each WEEKDAY_HEADER as label (label)}
					<div class="min-w-0 px-0 py-0.5 text-center text-[11px] font-semibold text-gray-500">
						{label}
					</div>
				{/each}
			</div>
		</div>
		{#each weeks as week, i (week.monday)}
			<div
				data-testid={`${testId}.week-${week.weekIndex}`}
				class="flex items-stretch gap-0 {i > 0 ? '-mt-px' : ''}"
			>
				<div
					class="flex w-8 shrink-0 items-center justify-center text-xs font-bold text-white {i === 0
						? 'rounded-t'
						: ''} {i === weeks.length - 1 ? 'rounded-b' : ''} bg-emerald-800"
					title={`School week ${week.weekIndex}, starting ${week.monday}`}
				>
					W{week.weekIndex}
				</div>
				<div
					class="grid shrink-0 grid-cols-[repeat(7,3.5rem)] gap-0 overflow-hidden border border-gray-300 {i ===
					0
						? 'rounded-t-md'
						: ''} {i === weeks.length - 1 ? 'rounded-b-md' : ''}"
				>
					{#each week.days as day (day.date)}
						{@const isHighlighted = highlight.has(day.date)}
						{@const isDisabled = disabled.has(day.date)}
						{@const clickable =
							interactive && day.inRange && !day.isWeekend && day.offName === null && !isDisabled}
						{#if interactive}
							<button
								type="button"
								data-testid={`${testId}.date-${day.date}`}
								disabled={!clickable}
								onclick={() => onDateClick(day.date)}
								title={isDisabled
									? `${day.date} is set in ${day.examLabel ?? 'another exam'} — pick a free day`
									: (day.offName ?? day.examLabel ?? day.date)}
								class="-mt-px -ml-px flex min-h-16 w-14 max-w-14 flex-col items-center justify-start overflow-hidden border px-0 py-1 text-[11px] leading-tight {cellTone(
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
								class="-mt-px -ml-px flex min-h-16 w-14 max-w-14 flex-col items-center justify-start overflow-hidden border px-0 py-1 text-[11px] leading-tight {cellTone(
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
