<script lang="ts">
	import type { EvaluationEntry } from './types.js';
	import { toDisplayPoints } from '$lib/utils';

	interface Props {
		evaluations: EvaluationEntry[];
	}

	let { evaluations }: Props = $props();

	// Calculate positive and negative score totals (canonical 1× values)
	const positiveTotal = $derived.by(() => {
		return evaluations.filter((e) => e.value > 0).reduce((sum, e) => sum + e.value, 0);
	});

	const negativeTotal = $derived.by(() => {
		return evaluations.filter((e) => e.value < 0).reduce((sum, e) => sum + Math.abs(e.value), 0);
	});

	// Display totals are 10× canonical. Bar widths are ratio-based, so the
	// multiplier cancels out and the visual proportions stay identical.
	const displayPositiveTotal = $derived(toDisplayPoints(positiveTotal));
	const displayNegativeTotal = $derived(toDisplayPoints(negativeTotal));

	// Determine if we should show the component
	const hasScores = $derived(positiveTotal > 0 || negativeTotal > 0);

	// Fixed max width for each bar side
	const MAX_BAR_WIDTH = 48;

	// Calculate bar widths based on the larger value
	const maxTotal = $derived(Math.max(positiveTotal, negativeTotal, 1));

	const negativeWidth = $derived(
		negativeTotal > 0 ? (negativeTotal / maxTotal) * MAX_BAR_WIDTH : 0
	);

	const positiveWidth = $derived(
		positiveTotal > 0 ? (positiveTotal / maxTotal) * MAX_BAR_WIDTH : 0
	);
</script>

{#if hasScores}
	<!-- Single centered container -->
	<div class="flex items-center justify-center" data-testid="score-tally-bar">
		<!-- Left side: Number + Bar extending from center -->
		<div class="flex items-center justify-end" style="width: {MAX_BAR_WIDTH + 24}px">
			{#if negativeTotal > 0}
				<span class="mr-1 text-xs text-red-600 dark:text-red-400">-{displayNegativeTotal}</span>
			{/if}
			<div
				class="h-2 rounded-l-full bg-red-500 transition-all duration-300"
				style="width: {negativeWidth}px"
			></div>
		</div>

		<!-- Right side: Bar extending from center + Number -->
		<div class="flex items-center justify-start" style="width: {MAX_BAR_WIDTH + 24}px">
			<div
				class="h-2 rounded-r-full bg-green-500 transition-all duration-300"
				style="width: {positiveWidth}px"
			></div>
			{#if positiveTotal > 0}
				<span class="ml-1 text-xs text-green-600 dark:text-green-400">+{displayPositiveTotal}</span>
			{/if}
		</div>
	</div>
{/if}
