<script lang="ts">
	import type { EvaluationEntry } from './types.js';

	interface Props {
		evaluations: EvaluationEntry[];
	}

	let { evaluations }: Props = $props();

	// Calculate positive and negative score totals
	const positiveTotal = $derived.by(() => {
		return evaluations.filter((e) => e.value > 0).reduce((sum, e) => sum + e.value, 0);
	});

	const negativeTotal = $derived.by(() => {
		return evaluations.filter((e) => e.value < 0).reduce((sum, e) => sum + Math.abs(e.value), 0);
	});

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
	<div class="flex justify-center items-center">
		<!-- Left side: Number + Bar extending from center -->
		<div class="flex justify-end items-center" style="width: {MAX_BAR_WIDTH + 24}px">
			{#if negativeTotal > 0}
				<span class="mr-1 text-red-600 dark:text-red-400 text-xs">-{negativeTotal}</span>
			{/if}
			<div
				class="bg-red-500 rounded-l-full h-2 transition-all duration-300"
				style="width: {negativeWidth}px"
			></div>
		</div>

		<!-- Right side: Bar extending from center + Number -->
		<div class="flex justify-start items-center" style="width: {MAX_BAR_WIDTH + 24}px">
			<div
				class="bg-green-500 rounded-r-full h-2 transition-all duration-300"
				style="width: {positiveWidth}px"
			></div>
			{#if positiveTotal > 0}
				<span class="ml-1 text-green-600 dark:text-green-400 text-xs">+{positiveTotal}</span>
			{/if}
		</div>
	</div>
{/if}
