<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { collectClassDays } from './wizard-dates';

	/**
	 * Exam range picker (spec #215, stories 16–19). Click a class day to
	 * preview the N-day range (2 for Exam 1/2, 3 for Final, skipping
	 * weekends and off days), then confirm in the dialog. Emits the
	 * confirmed dates via `onConfirm`; the parent owns the exam list and
	 * feeds `takenDates` so overlaps render as live greyed-out conflicts.
	 *
	 * Feedback F20: the overlap guard is deliberately REMOVED — the user
	 * may set two exams on the same days and the clash shows live in the
	 * calendar and the side list. Backend tension: production
	 * `assertExclusive` currently refuses exam-on-exam; the real Step 3
	 * ticket (#221) must decide warn-vs-refuse. This prototype allows +
	 * visualizes; do not copy the allow-overlap into production without
	 * that decision.
	 */

	let {
		examLabel,
		rangeLength,
		offDates,
		takenDates = [],
		pendingStart,
		onPendingChange,
		onConfirm,
		testId = 'exam-range-picker'
	}: {
		examLabel: string;
		rangeLength: 2 | 3;
		offDates: Set<string>;
		takenDates?: string[];
		pendingStart: string | null;
		onPendingChange: (date: string | null) => void;
		onConfirm: (dates: string[]) => void;
		testId?: string;
	} = $props();

	const taken = $derived(new Set(takenDates));
	const pendingDates = $derived(
		pendingStart === null ? [] : collectClassDays(pendingStart, rangeLength, offDates)
	);
	// Feedback F20: live signal only — never a refusal. Confirm stays
	// enabled on overlap; the clash renders greyed in the calendar + list.
	const overlapsTaken = $derived(pendingDates.some((date) => taken.has(date)));

	let confirming = $state(false);
	const dialogOpen = $derived(confirming && pendingDates.length > 0);

	function openConfirm() {
		if (pendingDates.length > 0) confirming = true;
	}

	function confirm() {
		onConfirm(pendingDates);
		onPendingChange(null);
		confirming = false;
	}

	function cancel() {
		confirming = false;
		onPendingChange(null);
	}
</script>

<div data-testid={testId} class="space-y-2 rounded-lg border bg-white p-3">
	<div class="flex flex-wrap items-center gap-2">
		<h3 data-testid={`${testId}.title`} class="text-sm font-semibold text-emerald-900">
			{examLabel}
			<span class="font-normal text-gray-500">({rangeLength} class days)</span>
		</h3>
		{#if pendingStart !== null}
			<p data-testid={`${testId}.pending`} class="text-xs text-gray-600">
				Starting {pendingStart} → {pendingDates.join(', ') || '…'}
			</p>
		{:else}
			<p class="text-xs text-gray-500">Click a class day on the calendar, then confirm.</p>
		{/if}
		<div class="ml-auto flex gap-2">
			{#if pendingStart !== null}
				<Button size="sm" variant="outline" onclick={cancel} data-testid={`${testId}.clear`}>
					Clear
				</Button>
				<Button
					size="sm"
					disabled={pendingDates.length === 0}
					onclick={openConfirm}
					data-testid={`${testId}.open-confirm`}
				>
					Review…
				</Button>
			{/if}
		</div>
	</div>
	{#if overlapsTaken}
		<p
			data-testid={`${testId}.overlap`}
			class="rounded border border-gray-300 bg-gray-100 p-2 text-xs text-gray-600"
		>
			⚠ That range overlaps an already-set exam — allowed here; the double-booked days show greyed
			in the calendar and the list.
		</p>
	{/if}

	{#if dialogOpen}
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Confirm ${examLabel} dates`}
			data-testid={`${testId}.dialog`}
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<div class="w-full max-w-sm space-y-3 rounded-lg bg-white p-4 shadow-xl">
				<h4 class="text-base font-semibold text-emerald-900">Confirm {examLabel}</h4>
				<p class="text-sm text-gray-700">
					{rangeLength} class days, skipping weekends and off days:
				</p>
				<ul class="list-disc space-y-0.5 pl-5 text-sm font-medium text-gray-800">
					{#each pendingDates as date (date)}
						<li data-testid={`${testId}.dialog-date-${date}`}>{date}</li>
					{/each}
				</ul>
				<div class="flex justify-end gap-2">
					<Button
						size="sm"
						variant="outline"
						onclick={cancel}
						data-testid={`${testId}.dialog-cancel`}
					>
						Back
					</Button>
					<Button size="sm" onclick={confirm} data-testid={`${testId}.dialog-confirm`}>
						Set {examLabel}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
