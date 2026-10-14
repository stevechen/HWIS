<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { collectClassDays } from './wizard-dates';

	/**
	 * Exam range picker (spec #215, stories 16–19). Click a class day to
	 * preview the N-day range (2 for Exam 1/2, 3 for Final, skipping
	 * weekends and off days), then confirm in the dialog. Emits the
	 * confirmed dates via `onConfirm`; the parent owns the exam list and
	 * feeds `takenDates` — the other slots' CONFIRMED dates plus their
	 * pending (unconfirmed) ranges (F25) — so a pending range that touches them refuses quietly: the Review
	 * button disables with a tooltip, no error banners.
	 *
	 * Feedback F23: refuse-by-construction replaces the F20 allow-and-label
	 * behavior. Days in another exam's confirmed range are unclickable in
	 * the calendar; if the pending fan-out still lands on one, Review stays
	 * disabled until the user picks a free start. Backend tension resolved
	 * the same way: the real Step 3 ticket (#221) should mirror
	 * `assertExclusive` (forbid exam-over-exam, not warn). Do not copy the
	 * old allow-overlap into production.
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
	// Feedback F23: quiet refusal only — no banners. The calendar already
	// disables taken days; if the fan-out still lands on one (range start
	// is free but the span crosses a taken day), Review disables with a
	// tooltip until the user picks a free start.
	const overlapsTaken = $derived(pendingDates.some((date) => taken.has(date)));

	let confirming = $state(false);
	const dialogOpen = $derived(confirming && pendingDates.length > 0);

	function openConfirm() {
		if (pendingDates.length > 0) confirming = true;
	}

	function confirm() {
		// Feedback F25: the parent clears this slot's pending inside
		// `onConfirm` (while this tab is still active). Clearing here —
		// after `onConfirm` has already advanced to the next tab — would
		// wipe that tab's staged pending instead.
		onConfirm(pendingDates);
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
				<span
					title={overlapsTaken ? 'That range touches another exam — pick a free start' : undefined}
				>
					<Button
						size="sm"
						disabled={pendingDates.length === 0 || overlapsTaken}
						onclick={openConfirm}
						data-testid={`${testId}.open-confirm`}
					>
						Review…
					</Button>
				</span>
			{/if}
		</div>
	</div>

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
