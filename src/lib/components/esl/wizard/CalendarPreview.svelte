<script lang="ts">
	import type { PreviewWeek } from './wizard-dates';

	/**
	 * Semester calendar preview (spec #215, stories 15–20, as amended by
	 * feedback F5/F6/F12). School-week rows with week numbers, a weekday
	 * header row, weekend dates in red text (no shaded background), grey
	 * off-day chips and red exam chips. Cells show the date number only —
	 * the header row already carries the weekday names. Read-only by
	 * default; `interactive` enables date clicks (Step 3 exam picking)
	 * with `highlighted` marking the pending range. Presentational — weeks
	 * arrive prebuilt from `buildPreviewWeeks`.
	 */

	let {
		weeks,
		interactive = false,
		highlighted = [],
		onDateClick = () => {},
		testId = 'calendar-preview'
	}: {
		weeks: PreviewWeek[];
		interactive?: boolean;
		highlighted?: string[];
		onDateClick?: (date: string) => void;
		testId?: string;
	} = $props();

	const highlight = $derived(new Set(highlighted));

	function short(date: string): string {
		return date.slice(5).replace('-', '/');
	}

	function cellTone(
		isWeekend: boolean,
		inRange: boolean,
		hasOff: boolean,
		hasExam: boolean,
		isHighlighted: boolean
	): string {
		if (!inRange) return 'border-gray-100 bg-gray-50 text-gray-300';
		if (hasExam) return 'border-red-500 bg-red-100 text-red-900';
		if (isHighlighted) return 'border-emerald-500 bg-emerald-100 text-emerald-900';
		if (hasOff) return 'border-stone-300 bg-stone-200 text-stone-600';
		// Feedback F5: weekends read as red text on a plain background —
		// no shaded weekend fill, so off/exam chips stay unambiguous.
		if (isWeekend) return 'border-gray-200 bg-white text-red-600';
		return 'border-gray-200 bg-white text-gray-800';
	}

	const WEEKDAY_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
</script>

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
	</div>

	<div class="max-h-[480px] space-y-1 overflow-y-auto pr-1">
		<div class="flex items-stretch gap-1" aria-hidden="true">
			<div class="w-10 shrink-0"></div>
			<div class="grid flex-1 grid-cols-7 gap-1">
				{#each WEEKDAY_HEADER as label (label)}
					<div class="px-1 py-0.5 text-center text-[11px] font-semibold text-gray-500">
						{label}
					</div>
				{/each}
			</div>
		</div>
		{#each weeks as week (week.monday)}
			<div data-testid={`${testId}.week-${week.weekIndex}`} class="flex items-stretch gap-1">
				<div
					class="flex w-10 shrink-0 items-center justify-center rounded bg-emerald-800 text-xs font-bold text-white"
					title={`School week ${week.weekIndex}, starting ${week.monday}`}
				>
					W{week.weekIndex}
				</div>
				<div class="grid flex-1 grid-cols-7 gap-1">
					{#each week.days as day (day.date)}
						{@const isHighlighted = highlight.has(day.date)}
						{@const clickable =
							interactive && day.inRange && !day.isWeekend && day.offName === null}
						{#if interactive}
							<button
								type="button"
								data-testid={`${testId}.date-${day.date}`}
								disabled={!clickable}
								onclick={() => onDateClick(day.date)}
								title={day.offName ?? day.examLabel ?? day.date}
								class="flex min-h-14 flex-col items-center justify-start rounded border px-1 py-1 text-[11px] leading-tight {cellTone(
									day.isWeekend,
									day.inRange,
									day.offName !== null,
									day.examLabel !== null,
									isHighlighted
								)} {clickable
									? 'cursor-pointer hover:border-emerald-500'
									: 'cursor-default'} {isHighlighted ? 'ring-2 ring-emerald-500' : ''}"
							>
								<span class="font-semibold">{short(day.date)}</span>
								{#if day.examLabel !== null}
									<span
										class="mt-0.5 rounded bg-red-600 px-1 py-px text-[10px] font-bold text-white"
										>{day.examLabel}</span
									>
								{:else if day.offName !== null}
									<span class="mt-0.5 text-[10px]">🎉 {day.offName.replace('Mock: ', '')}</span>
								{:else if !day.inRange}
									<span class="text-[10px]">·</span>
								{/if}
							</button>
						{:else}
							<div
								data-testid={`${testId}.date-${day.date}`}
								title={day.offName ?? day.examLabel ?? day.date}
								class="flex min-h-14 flex-col items-center justify-start rounded border px-1 py-1 text-[11px] leading-tight {cellTone(
									day.isWeekend,
									day.inRange,
									day.offName !== null,
									day.examLabel !== null,
									isHighlighted
								)}"
							>
								<span class="font-semibold">{short(day.date)}</span>
								{#if day.examLabel !== null}
									<span
										class="mt-0.5 rounded bg-red-600 px-1 py-px text-[10px] font-bold text-white"
										>{day.examLabel}</span
									>
								{:else if day.offName !== null}
									<span class="mt-0.5 text-[10px]">🎉 {day.offName.replace('Mock: ', '')}</span>
								{:else if !day.inRange}
									<span class="text-[10px]">·</span>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
