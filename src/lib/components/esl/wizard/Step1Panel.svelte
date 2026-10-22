<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import RecalculateHint from './RecalculateHint.svelte';
	import WeekPicker from './WeekPicker.svelte';
	import type { WizardState } from './wizard-state';
	import {
		defaultEndDate,
		defaultStartDate,
		schoolYearForTerm,
		startPickerMondays,
		suggestSemester,
		type Term
	} from './wizard-dates';

	/**
	 * Step 1 of the semester-setup wizard (ticket #219, spec #215 stories
	 * 8–11): the suggested term with its reason, the S1/S2 override, and
	 * the start-date week rows.
	 *
	 * The shell seeds `state.step1` from the same helpers this panel
	 * displays, so the panel only reads what it was handed and writes
	 * through `update()` — never assigning to `state` directly, which is
	 * what keeps the sessionStorage copy in step. `today` is a prop (not a
	 * wall-clock read) so the suggestion banner is deterministic under
	 * test; the route omits it and gets the real day.
	 *
	 * Start-date behaviour (story 10 as pinned by ticket #219): clicking
	 * any weekday in a row snaps the start date to that week's Monday and
	 * highlights the whole row. The shell's own Next button stays the
	 * chrome-level advance; this panel's Confirm is the per-step one.
	 */

	let {
		state,
		update,
		today = new Date().toISOString().slice(0, 10)
	}: {
		state: WizardState;
		update: (mutate: (draft: WizardState) => void) => void;
		today?: string;
	} = $props();

	const suggestion = suggestSemester(today);
	const TERMS: readonly Term[] = ['S1', 'S2'];

	const term = $derived(state.step1.term);
	const schoolYear = $derived(state.step1.schoolYear);
	const startDate = $derived(state.step1.startDate);
	const mondays = $derived(
		term === null || schoolYear === null ? [] : startPickerMondays(term, schoolYear)
	);
	const defaultStart = $derived(
		term === null || schoolYear === null ? null : defaultStartDate(term, schoolYear)
	);
	const overridden = $derived(
		startDate !== null && defaultStart !== null && startDate !== defaultStart
	);

	function selectTerm(next: Term): void {
		if (next === term) return;
		update((draft) => {
			draft.step1.term = next;
			// F8/F9: seed from the school year DERIVED for the chosen term,
			// not from the suggestion's year — in Oct–Dec `suggestSemester`
			// names next fall while the derived year is still this one.
			const year = schoolYearForTerm(next, today);
			draft.step1.schoolYear = year;
			draft.step1.startDate = defaultStartDate(next, year);
			// A different term invalidates the derived window downstream:
			// the end date follows the new term's default, and imported
			// holidays / exam ranges belonged to the old term's years.
			draft.step2.endDate = defaultEndDate(next, year);
			draft.step2.offDays = [];
			draft.step2.holidaysImported = false;
			draft.step3.exams = [];
		});
	}

	function pickStart(date: string): void {
		update((draft) => {
			draft.step1.startDate = date;
		});
	}

	function recalculate(): void {
		update((draft) => {
			draft.step1.startDate = defaultStart;
		});
	}

	function confirm(): void {
		update((draft) => {
			draft.currentStep = 2;
		});
	}
</script>

<div data-testid="wizard.step-1-panel" class="space-y-4">
	<div
		data-testid="wizard.step-1-suggestion"
		class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
	>
		Suggested: <strong>{suggestion.term} {suggestion.schoolYear}</strong> — {suggestion.reason} (today
		is {today}).
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm font-medium text-gray-700">Term:</span>
		{#each TERMS as option (option)}
			<Button
				size="sm"
				variant={term === option ? 'default' : 'outline'}
				onclick={() => selectTerm(option)}
				data-testid={`wizard.step-1-term-${option}`}
			>
				{option}
			</Button>
		{/each}
		<span data-testid="wizard.step-1-school-year" class="text-sm text-gray-600">{schoolYear}</span>
	</div>

	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-gray-800">Pick the week the semester starts</h2>
		<p data-testid="wizard.step-1-start-date" class="text-sm text-gray-700">
			Start Date: <strong>{startDate ?? '—'}</strong>
		</p>
	</div>

	<WeekPicker
		{mondays}
		selectedDate={startDate}
		snapToMonday
		onPick={pickStart}
		testId="wizard.step-1-picker"
	/>

	{#if overridden}
		<RecalculateHint testId="wizard.step-1-recalculate" onRecalculate={recalculate} />
	{/if}

	<div class="flex justify-end">
		<Button disabled={startDate === null} onclick={confirm} data-testid="wizard.step-1-confirm">
			Confirm — continue to Step 2
		</Button>
	</div>
</div>
