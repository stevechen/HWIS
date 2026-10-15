<script lang="ts">
	import type { SemesterStatus } from '$lib/esl-semesters';
	import SemesterStatusChip from './SemesterStatusChip.svelte';

	let {
		year,
		term,
		startDate,
		status,
		derivedEnd,
		endSourceLabel
	}: {
		year: string;
		term: 'S1' | 'S2';
		startDate: string;
		status: SemesterStatus;
		derivedEnd: string | null;
		endSourceLabel: string | null;
	} = $props();
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-bold text-emerald-900">{year} {term}</h1>
		<SemesterStatusChip {status} />
	</div>
	<p class="text-sm text-gray-600">Starts {startDate}. The end derives from final-exam events.</p>
	{#if derivedEnd !== null}
		<p data-testid="semester-end" class="text-sm font-medium text-emerald-900">
			Ends {derivedEnd}{endSourceLabel === null ? '' : `, from ${endSourceLabel}`}
		</p>
	{:else}
		<p
			data-testid="semester-finals-tbd"
			class="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
		>
			Final exams TBD — this semester has no exam rows yet, so teacher views clamp to
			{startDate} through today. Add the exam days below; the end follows them silently.
		</p>
	{/if}
</div>
