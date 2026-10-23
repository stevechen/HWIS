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
    type Term,
  } from './wizard-dates';

  /**
   * Step 1 of the semester-setup wizard (ticket #219, spec #215 stories
   * 8–11): the suggested term with its reason, the S1/S2 override, and
   * the start-date week rows.
   *
   * The shell seeds `wizardState.step1` from the same helpers this panel
   * displays, so the panel only reads what it was handed and writes
   * through `update()` — never assigning to `wizardState` directly, which is
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
    state: wizardState,
    update,
    today = new Date().toISOString().slice(0, 10),
  }: {
    state: WizardState;
    update: (mutate: (draft: WizardState) => void) => void;
    today?: string;
  } = $props();
  let customRoomDraft = $state('');
  let roomError = $state('');

  const suggestion = $derived(suggestSemester(today));
  const TERMS: readonly Term[] = ['S1', 'S2'];

  const term = $derived(wizardState.step1.term);
  const schoolYear = $derived(wizardState.step1.schoolYear);
  const startDate = $derived(wizardState.step1.startDate);
  const mondays = $derived(
    term === null || schoolYear === null
      ? []
      : startPickerMondays(term, schoolYear),
  );
  const defaultStart = $derived(
    term === null || schoolYear === null
      ? null
      : defaultStartDate(term, schoolYear),
  );
  const overridden = $derived(
    startDate !== null && defaultStart !== null && startDate !== defaultStart,
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
    if (term === 'S1' && wizardState.step1.eslRoomLimit === null) {
      roomError = 'Choose the highest ESL room letter before continuing.';
      return;
    }
    update((draft) => {
      draft.currentStep = 2;
    });
  }

  function addCustomRoom(): void {
    const room = customRoomDraft.trim();
    if (!room) return;
    const key = room.toLocaleLowerCase();
    const existingNames = [
      ...wizardState.step1.eslCustomRooms,
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((letter) => `ESL ${letter}`),
    ];
    if (existingNames.some((name) => name.trim().toLocaleLowerCase() === key)) {
      roomError = 'That room is already listed.';
      return;
    }
    roomError = '';
    update((draft) => draft.step1.eslCustomRooms.push(room));
    customRoomDraft = '';
  }

  function removeCustomRoom(room: string): void {
    update((draft) => {
      draft.step1.eslCustomRooms = draft.step1.eslCustomRooms.filter(
        (name) => name !== room,
      );
    });
  }

  function isRoomLimit(value: string): value is 'D' | 'E' | 'F' | 'G' {
    return value === 'D' || value === 'E' || value === 'F' || value === 'G';
  }
</script>

<div data-testid="wizard.step-1-panel" class="space-y-4">
  <div
    data-testid="wizard.step-1-suggestion"
    class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
  >
    Suggested: <strong>{suggestion.term} {suggestion.schoolYear}</strong> — {suggestion.reason}
    (today is {today}).
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
    <span data-testid="wizard.step-1-school-year" class="text-sm text-gray-600"
      >{schoolYear}</span
    >
  </div>

  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-sm font-semibold text-gray-800">
      Pick semester start date
    </h2>
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

  {#if term === 'S1'}
    <h2 class="text-sm font-semibold text-gray-800">Set up classrooms</h2>
    <div
      class="space-y-3 rounded-md border p-3"
      data-testid="wizard.step-1-room-settings"
    >
      <div class="flex flex-wrap items-center gap-2">
        <label
          for="wizard-esl-room-limit"
          class="text-sm font-medium text-gray-700">ESL room A to:</label
        >
        <select
          id="wizard-esl-room-limit"
          class="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={wizardState.step1.eslRoomLimit ?? ''}
          onchange={(event) => {
            const value = event.currentTarget.value;
            if (value !== '' && !isRoomLimit(value)) return;
            update((draft) => {
              draft.step1.eslRoomLimit = value === '' ? null : value;
            });
            roomError = '';
          }}
          data-testid="wizard.step-1-room-limit"
        >
          <option value="">Choose…</option>
          {#each ['D', 'E', 'F', 'G'] as letter (letter)}
            <option value={letter} selected={letter === (wizardState.step1.eslRoomLimit ?? '')}>{letter}</option>
          {/each}
        </select>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-56 flex-1 space-y-1">
          <label
            for="wizard-custom-room"
            class="text-sm font-medium text-gray-700">Custom rooms</label
          >
          <input
            id="wizard-custom-room"
            class="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            bind:value={customRoomDraft}
            placeholder="e.g. Library"
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustomRoom();
              }
            }}
            data-testid="wizard.step-1-custom-room-input"
          />
        </div>
        <Button type="button" variant="outline" onclick={addCustomRoom}
          >Add room</Button
        >
      </div>

      {#if wizardState.step1.eslCustomRooms.length > 0}
        <ul class="flex flex-wrap gap-2" aria-label="Custom ESL rooms">
          {#each wizardState.step1.eslCustomRooms as room (room)}
            <li
              class="bg-muted flex items-center gap-2 rounded-full px-3 py-1 text-sm"
            >
              {room}
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground font-medium"
                aria-label="Remove {room}"
                onclick={() => removeCustomRoom(room)}>×</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      <p class="text-muted-foreground text-xs">
        Existing assignments stay if you remove a room; removed rooms will no
        longer be offered for new assignments.
      </p>
      {#if roomError}
        <p class="text-destructive text-sm" role="alert">{roomError}</p>
      {/if}
    </div>
  {/if}

  {#if overridden}
    <RecalculateHint
      testId="wizard.step-1-recalculate"
      onRecalculate={recalculate}
    />
  {/if}

  <div class="flex justify-end">
    <Button
      disabled={startDate === null}
      onclick={confirm}
      data-testid="wizard.step-1-confirm"
    >
      Confirm — continue to Step 2
    </Button>
  </div>
</div>
