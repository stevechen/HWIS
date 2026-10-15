<script lang="ts">
	import WeekPicker from './WeekPicker.svelte';
	import CalendarPreview from './CalendarPreview.svelte';
	import InlineHolidayImport from './InlineHolidayImport.svelte';
	import RecalculateHint from './RecalculateHint.svelte';
	import { endPickerMondays, defaultEndDate, buildPreviewWeeks } from './wizard-dates';
	import type { WizardState, WizardStepApi } from './wizard-state';

	/**
	 * Step 2 panel — End date & Holiday Import (ticket #220, spec #215).
	 *
	 * Layout: left column = WeekPicker + HolidayImport, right column = CalendarPreview (read-only)
	 * Event list below calendar on right side.
	 */

	let { state, update }: WizardStepApi = $props();

	const term = $derived(state.step1.term);
	const schoolYear = $derived(state.step1.schoolYear);
	const startDate = $derived(state.step1.startDate);
	const endDate = $derived(state.step2.endDate);
	const offDays = $derived(state.step2.offDays);
	const lastExamDay = $derived(state.step2.lastExamDay ?? true);

	const endMondays = $derived(term && schoolYear ? endPickerMondays(term, schoolYear) : []);
	const defaultEnd = $derived(term && schoolYear ? defaultEndDate(term, schoolYear) : null);
	const endBeforeStart = $derived(endDate !== null && startDate !== null && endDate < startDate);

	// Build weeks for calendar preview using mock off days format
	const weeks = $derived(
		startDate && endDate
			? buildPreviewWeeks(
					startDate,
					endDate,
					offDays.map((d: { date: string; name: string }) => ({ date: d.date, name: d.name })),
					[] // no exams in Step 2
				)
			: []
	);

	// Event list for right side: imported off days, ordered by date
	const sortedOffDays = $derived([...offDays].sort((a, b) => a.date.localeCompare(b.date)));

	function handleEndDatePick(date: string) {
		update((draft: WizardState) => {
			draft.step2.endDate = date;
		});
	}

	function handleLastExamDayChange(checked: boolean) {
		update((draft: WizardState) => {
			draft.step2.lastExamDay = checked;
		});
	}

	function showRecalculateHint(): boolean {
		return endDate !== null && defaultEnd !== null && endDate !== defaultEnd;
	}

	function recalculateEndDate() {
		if (defaultEnd !== null) {
			update((draft: WizardState) => {
				draft.step2.endDate = defaultEnd;
			});
		}
	}

	// Callback when holidays are imported - updates the wizard state
	function handleHolidaysImported(newOffDays: { date: string; name: string }[]) {
		update((draft: WizardState) => {
			draft.step2.offDays = newOffDays;
			draft.step2.holidaysImported = true;
		});
	}
</script>

<div data-testid="wizard.step-2-panel" class="space-y-4">
	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
		<div class="space-y-4">
			<div>
				<h2 class="mb-2 text-sm font-semibold text-gray-800">
					{term}
					{schoolYear} · starts {startDate} — pick the end date
				</h2>
				<WeekPicker
					mondays={endMondays}
					selectedDate={endDate}
					snapToMonday={false}
					showWeekNumbers={false}
					onPick={handleEndDatePick}
					testId="wizard.step-2-end-picker"
				/>
			</div>

			{#if endBeforeStart}
				<p
					data-testid="wizard.step-2-end-error"
					class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
				>
					The end date ({endDate}) is before the start ({startDate}) — pick a later date.
				</p>
			{:else}
				<div class="flex items-center gap-2">
					<p data-testid="wizard.step-2-end-summary" class="text-sm text-gray-700">
						End date: <strong>{endDate ?? '—'}</strong>
					</p>
					{#if showRecalculateHint()}
						<RecalculateHint
							label="Recalculate"
							testId="wizard.step-2-end-recalculate"
							onRecalculate={recalculateEndDate}
						/>
					{/if}
				</div>
			{/if}

			<!-- "This is also the last exam day" checkbox (default on) -->
			<div class="flex items-center gap-2">
				<input
					type="checkbox"
					id="wizard-step-2-last-exam-day"
					checked={lastExamDay}
					onchange={(event) => handleLastExamDayChange(event.currentTarget.checked)}
					data-testid="wizard.step-2-last-exam-day"
					class="size-4 accent-emerald-700"
				/>
				<label for="wizard-step-2-last-exam-day" class="text-sm text-gray-700">
					This is also the last exam day (no Final exam)
				</label>
			</div>

			<InlineHolidayImport
				semesterId={state.semesterId ?? 'new'}
				term={term ?? 'S1'}
				startDate={startDate ?? ''}
				onImported={handleHolidaysImported}
			/>
		</div>

		<div class="min-w-0">
			<h2 class="mb-2 text-sm font-semibold text-gray-800">Semester preview (read-only)</h2>
			<CalendarPreview {weeks} testId="wizard.step-2-calendar" />
		</div>
	</div>

	<!-- Event list on the right (below calendar on mobile) -->
	<div data-testid="wizard.step-2-event-list" class="mt-4 space-y-2 lg:mt-0">
		<h3 class="text-sm font-semibold text-gray-800">Events</h3>
		{#if sortedOffDays.length === 0}
			<p class="text-sm text-gray-500">No events yet. Import holidays to add off days.</p>
		{:else}
			<ul class="space-y-1.5 text-sm">
				{#each sortedOffDays as day (day.date)}
					<li
						data-testid={`wizard.step-2-event-${day.date}`}
						class="flex items-center gap-2 rounded border border-stone-200 bg-stone-50 px-2 py-1.5"
					>
						<span class="flex items-center gap-1">
							<span class="inline-block size-3 rounded border border-stone-300 bg-stone-200"></span>
							<strong class="text-stone-800">{day.name}</strong>
						</span>
						<span class="text-stone-600">{day.date}</span>
						<span class="text-xs text-stone-500">Off day</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
