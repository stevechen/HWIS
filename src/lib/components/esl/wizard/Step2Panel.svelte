<script lang="ts">
	import WeekPicker from './WeekPicker.svelte';
	import CalendarPreview from './CalendarPreview.svelte';
	import HolidayOffDayImport from '../HolidayOffDayImport.svelte';
	import InlineHolidayImport from './InlineHolidayImport.svelte';
	import RecalculateHint from './RecalculateHint.svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { endPickerMondays, defaultEndDate, buildPreviewWeeks } from './wizard-dates';
	import type { WizardState, WizardStepApi } from './wizard-state';

	/**
	 * Step 2 panel — End date & Holiday Import (ticket #220, spec #215).
	 *
	 * Layout: left column = WeekPicker + HolidayImport, right column = CalendarPreview (read-only)
	 * Event list below calendar on right side.
	 *
	 * Edit mode (#256) swaps the create-flow stage-only import for the
	 * saved-semester `HolidayOffDayImport`: it writes `no_school` rows right
	 * away, then reports exactly what it wrote so the same days merge into
	 * wizard state. Without that merge the Step 5 save would reconcile
	 * against a state that never heard of the new rows.
	 */

	let { state, update, mode = 'create' }: WizardStepApi = $props();

	const term = $derived(state.step1.term);
	const schoolYear = $derived(state.step1.schoolYear);
	const startDate = $derived(state.step1.startDate);
	const editSemesterId = $derived(mode === 'edit' ? loadedId(state.semesterId) : null);
	const savedImport = $derived(
		editSemesterId !== null && term !== null && startDate !== null
			? { semesterId: editSemesterId, term, startDate }
			: null
	);

	/** `WizardState.semesterId` survives sessionStorage as a plain string;
	 * in edit mode it is the loader's echo of the real `_id`. */
	function loadedId(id: string | null): Id<'esl_semesters'> | null {
		return id === null ? null : (id as Id<'esl_semesters'>);
	}
	const endDate = $derived(state.step2.endDate);
	const offDays = $derived(state.step2.offDays);
	const endMondays = $derived(term && schoolYear ? endPickerMondays(term, schoolYear) : []);
	const defaultEnd = $derived(term && schoolYear ? defaultEndDate(term, schoolYear) : null);
	const endBeforeStart = $derived(endDate !== null && startDate !== null && endDate < startDate);

	// Build weeks for calendar preview using mock off days format
	const weeks = $derived(
		startDate && endDate
			? buildPreviewWeeks(
					startDate,
					endDate,
					offDays.map((d: { date: string; name: string }) => ({
						date: d.date,
						name: d.name
					})),
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

	/**
	 * Edit mode (#256): merge exactly the rows the saved-semester import
	 * wrote. Deduping by date keeps a re-import idempotent (the backend
	 * skips taken dates and reports only new rows anyway) and the sort
	 * matches how the loader presents off days.
	 */
	function mergeImportedOffDays(imported: { date: string; name: string }[]) {
		if (imported.length === 0) return;
		update((draft: WizardState) => {
			const merged = [...draft.step2.offDays];
			for (const day of imported) {
				const index = merged.findIndex((existing) => existing.date === day.date);
				if (index >= 0) merged[index] = day;
				else merged.push(day);
			}
			draft.step2.offDays = merged.sort((a, b) => a.date.localeCompare(b.date));
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
					{schoolYear} · Pick semester end day
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

			{#if savedImport !== null}
				{#key savedImport.semesterId}
					<HolidayOffDayImport
						semesterId={savedImport.semesterId}
						term={savedImport.term}
						startDate={savedImport.startDate}
						onImported={mergeImportedOffDays}
					/>
				{/key}
			{:else if mode === 'create'}
				<InlineHolidayImport
					semesterId={state.semesterId ?? 'new'}
					term={term ?? 'S1'}
					startDate={startDate ?? ''}
					{schoolYear}
					onImported={handleHolidaysImported}
				/>
			{/if}

			<!-- Event list right below import -->
			<div data-testid="wizard.step-2-event-list" class="space-y-2">
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
									<span class="inline-block size-3 rounded border border-stone-300 bg-stone-200"
									></span>
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

		<div class="min-w-0">
			<h2 class="mb-2 text-sm font-semibold text-gray-800">Semester preview (read-only)</h2>
			<CalendarPreview {weeks} testId="wizard.step-2-calendar" />
		</div>
	</div>
</div>
