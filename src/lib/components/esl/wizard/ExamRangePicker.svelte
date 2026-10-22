<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	/**
	 * Exam range status card (spec #215, stories 16–19, as amended by
	 * feedback F23/F37). Dialog-free (F37): clicking a class day on the
	 * calendar SETS the exam's range immediately (replacing any prior range
	 * for that slot) — there is no pending state, no Review… button, and no
	 * confirm dialog. Hovering a free day previews the fan-out on the
	 * calendar. To change a range, stay on the tab and click another day —
	 * reselecting IS the edit path (said so in the hint line below). The
	 * parent owns the exam list and feeds `currentDates`; `onClear` removes
	 * the range. Note for the real Step 3 ticket (#221): adopt the same
	 * dialog-free model — click-to-set with hover preview, refuse
	 * exam-over-exam via `assertExclusive`-style disabling, not a dialog.
	 */

	let {
		examLabel,
		rangeLength,
		currentDates,
		onClear,
		testId = 'exam-range-picker'
	}: {
		examLabel: string;
		rangeLength: 2 | 3;
		currentDates: string[];
		onClear: () => void;
		testId?: string;
	} = $props();
</script>

<div data-testid={testId} class="space-y-2 rounded-lg border bg-white p-3">
	<div class="flex flex-wrap items-center gap-2">
		<h3 data-testid={`${testId}.title`} class="text-sm font-semibold text-emerald-900">
			{examLabel}
			<span class="font-normal text-gray-500">({rangeLength} class days)</span>
		</h3>
		{#if currentDates.length > 0}
			<p data-testid={`${testId}.current`} class="text-xs font-medium text-red-800">
				Set: {currentDates.join(', ')}
			</p>
		{:else}
			<p class="text-xs text-gray-500">Not set yet — click a class day on the calendar.</p>
		{/if}
		{#if currentDates.length > 0}
			<div class="ml-auto flex gap-2">
				<Button size="sm" variant="outline" onclick={onClear} data-testid={`${testId}.clear`}>
					Clear
				</Button>
			</div>
		{/if}
	</div>
	<p class="text-xs text-gray-500">
		To change it, click another day — the range moves. Hover a day to preview its range first.
	</p>
</div>
