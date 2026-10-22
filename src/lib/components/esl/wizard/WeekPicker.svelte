<script lang="ts">
	import { addDays, isWeekend, mondayOfWeek } from './wizard-dates';

	/**
	 * Weekly date picker (spec #215, stories 10/12, as amended by feedback
	 * F2/F3/F11). Renders a shared Mon–Fri header row plus one row per
	 * Monday in `mondays`; cells show date numbers only. Step 1 picks the
	 * exact date (`snapToMonday: false`); Step 2 also picks the exact date.
	 * Only weekdays render (Feedback F68: Sat/Sun columns removed — they
	 * were never valid choices, so nothing is lost; the saved width spreads
	 * across Mon–Fri via flex-1 cells). In snap mode the selected row
	 * highlights; in exact mode only the picked cell highlights, never the
	 * whole row. `showWeekNumbers` hides the Week N label (Step 2 end weeks
	 * are not semester weeks). Presentational — all dates arrive as props,
	 * so the prototype and the real wizard share it unchanged.
	 */

	let {
		mondays,
		selectedDate,
		snapToMonday = true,
		showWeekNumbers = true,
		onPick,
		testId = 'week-picker'
	}: {
		mondays: string[];
		selectedDate: string | null;
		snapToMonday?: boolean;
		showWeekNumbers?: boolean;
		onPick: (date: string) => void;
		testId?: string;
	} = $props();

	function pick(date: string) {
		// Feedback F11: Sat/Sun are not valid choices — the cells are
		// disabled, this guard is defense-in-depth only.
		if (isWeekend(date)) return;
		onPick(snapToMonday ? mondayOfWeek(date) : date);
	}

	function short(date: string): string {
		// Feedback F29: no leading zeros (8/5, not 08/05).
		const [month, day] = date.slice(5).split('-');
		return `${Number(month)}/${Number(day)}`;
	}

	const WEEKDAY_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
</script>

<div data-testid={testId} class="space-y-2">
	<div class="flex flex-wrap items-center gap-1 px-2" aria-hidden="true">
		{#if showWeekNumbers}
			<span class="mr-1 min-w-16"></span>
		{/if}
		{#each WEEKDAY_HEADER as label (label)}
			<span class="min-w-16 flex-1 text-center text-[11px] font-semibold text-gray-500"
				>{label}</span
			>
		{/each}
	</div>
	{#each mondays as monday, row (monday)}
		{@const rowSelected = snapToMonday && !!selectedDate && mondayOfWeek(selectedDate) === monday}
		<div
			data-testid={`${testId}.row-${row + 1}`}
			class="flex flex-wrap items-center gap-1 rounded-lg border p-2 {rowSelected
				? 'border-emerald-500 bg-emerald-50'
				: 'border-gray-200 bg-white'}"
		>
			{#if showWeekNumbers}
				<span
					data-testid={`${testId}.row-${row + 1}.label`}
					class="mr-1 min-w-16 text-xs font-semibold {rowSelected
						? 'text-emerald-900'
						: 'text-gray-500'}"
				>
					Week {row + 1}{rowSelected ? ' ✓' : ''}
				</span>
			{/if}
			{#each Array.from({ length: 5 }, (_, i) => addDays(monday, i)) as date (date)}
				{@const cellSelected = snapToMonday
					? rowSelected && date === monday
					: selectedDate === date}
				<button
					type="button"
					data-testid={`${testId}.date-${date}`}
					onclick={() => pick(date)}
					aria-pressed={cellSelected}
					title={snapToMonday ? `Pick week of ${monday}` : `Pick ${date}`}
					class="flex min-w-16 flex-1 flex-col items-center rounded-md border px-2 py-1 text-xs transition-colors {cellSelected
						? 'border-emerald-600 bg-emerald-600 font-bold text-white'
						: 'border-gray-200 bg-white text-gray-700 hover:border-emerald-400 hover:bg-emerald-50'}"
				>
					<span class="font-medium">{short(date)}</span>
				</button>
			{/each}
		</div>
	{/each}
</div>
