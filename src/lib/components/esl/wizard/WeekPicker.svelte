<script lang="ts">
	import { addDays, mondayOfWeek, weekdayLabel } from './wizard-dates';

	/**
	 * Weekly date picker (spec #215, stories 10/12, as amended by feedback
	 * F2/F3). Renders one row per Monday in `mondays`. Step 1 picks the
	 * exact date (`snapToMonday: false`); Step 2 also picks the exact date.
	 * In snap mode the selected row highlights; in exact mode only the
	 * picked cell highlights, never the whole row. `showWeekNumbers`
	 * hides the Week N label (Step 2 end weeks are not semester weeks).
	 * Presentational — all dates arrive as props, so the prototype and
	 * the real wizard share it unchanged.
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
		onPick(snapToMonday ? mondayOfWeek(date) : date);
	}

	function short(date: string): string {
		return date.slice(5).replace('-', '/');
	}
</script>

<div data-testid={testId} class="space-y-2">
	{#each mondays as monday, row (monday)}
		{@const rowSelected =
			snapToMonday && selectedDate !== null && mondayOfWeek(selectedDate) === monday}
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
			{#each Array.from({ length: 7 }, (_, i) => addDays(monday, i)) as date (date)}
				{@const cellSelected = snapToMonday
					? rowSelected && date === monday
					: selectedDate === date}
				<button
					type="button"
					data-testid={`${testId}.date-${date}`}
					onclick={() => pick(date)}
					aria-pressed={cellSelected}
					title={snapToMonday ? `Pick week of ${monday}` : `Pick ${date}`}
					class="flex min-w-16 flex-col items-center rounded-md border px-2 py-1 text-xs transition-colors {cellSelected
						? 'border-emerald-600 bg-emerald-600 font-bold text-white'
						: 'border-gray-200 bg-white text-gray-700 hover:border-emerald-400 hover:bg-emerald-50'}"
				>
					<span class="font-medium">{weekdayLabel(date)}</span>
					<span>{short(date)}</span>
				</button>
			{/each}
		</div>
	{/each}
</div>
