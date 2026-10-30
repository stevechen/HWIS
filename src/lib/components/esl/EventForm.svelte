<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import {
		ESL_EVENT_TARGETS,
		ESL_EVENT_TITLES,
		ESL_EVENT_TYPES,
		ESL_EVENT_TYPE_LABELS,
		ESL_EXAM_TITLES,
		ESL_PARTIAL_TITLES,
		ESL_PERIOD_NUMBERS,
		ESL_REMINDER_KINDS,
		ESL_REMINDER_TITLES,
		EXAM_SEED_WEEKDAYS,
		isNoteHiddenForEventType,
		isNoteRequiredForEventType,
		isRangedEventType,
		lockedTargetForEventType,
		lockedTargetForReminderKind,
		defaultTargetForEventType,
		type EslEventTarget,
		type EslEventType,
		type EslReminderKind
	} from '$convex/shared/esl';
	import { boundaryCrossWarning, type SiblingSemester } from '$lib/esl-semesters';
	import {
		startPickerMondays,
		defaultStartDate,
		schoolYearForTerm
	} from '$lib/components/esl/wizard/wizard-dates';
	import WeekPicker from '$lib/components/esl/wizard/WeekPicker.svelte';
	import ExamRangePicker from '$lib/components/esl/wizard/ExamRangePicker.svelte';
	import RecalculateHint from '$lib/components/esl/wizard/RecalculateHint.svelte';

	export type EventFormInput = {
		type: EslEventType;
		reminderKind?: EslReminderKind;
		isBanner?: boolean;
		title: string;
		target: EslEventTarget;
		date: string;
		endDate?: string;
		note?: string;
		/** The periods that still have class, on a partial day (#293). */
		classPeriods?: number[];
	};

	export type EventFormInitial = {
		type: EslEventType;
		reminderKind?: EslReminderKind;
		isBanner?: boolean;
		title: string;
		target: EslEventTarget;
		date: string;
		endDate?: string;
		note?: string;
		classPeriods?: number[];
	};

	/**
	 * The type dropdown iterates the canonical union with the shared labels,
	 * so adding a type to `ESL_EVENT_TYPES` surfaces it here with no second
	 * list to update.
	 */
	const TYPES: readonly EslEventType[] = ESL_EVENT_TYPES;

	/**
	 * The title a fresh draft of a type carries: locked titles arrive
	 * prefilled (and stay locked), exams default to Exam 1, quiz/task-kind
	 * reminders start blank for a manual row — the banner always shows
	 * their own text. Checklist quiz drafts arrive prefilled via `initial`.
	 */
	function defaultTitleFor(type: EslEventType, reminderKind?: EslReminderKind): string {
		if (type === 'reminder') {
			if (reminderKind === 'quiz' || reminderKind === 'task' || reminderKind === undefined)
				return '';
			return ESL_REMINDER_TITLES[reminderKind];
		}
		if (type === 'exam') return ESL_EXAM_TITLES[0];
		return ESL_EVENT_TITLES[type];
	}

	type Draft = {
		type: EslEventType;
		reminderKind: EslReminderKind;
		isBanner: boolean;
		title: string;
		target: EslEventTarget;
		date: string;
		endDate: string;
		note: string;
		classPeriods: number[];
	};

	function blankDraft(init?: EventFormInitial): Draft {
		const type = init?.type ?? 'exam';
		const reminderKind = init?.reminderKind ?? 'quiz';
		// Editing a row seeded before per-type gating (#212) may carry a
		// target its type no longer allows — snap to the locked value so the
		// edit form opens submittable instead of refusing on save.
		const locked =
			type === 'reminder'
				? lockedTargetForReminderKind(reminderKind)
				: lockedTargetForEventType(type);
		return {
			type,
			reminderKind,
			isBanner: init?.isBanner ?? true,
			title: init?.title ?? defaultTitleFor(type, reminderKind),
			target: locked ?? init?.target ?? 'all',
			date: init?.date ?? '',
			endDate: init?.endDate ?? '',
			note: init?.note ?? '',
			classPeriods: init?.classPeriods === undefined ? [] : [...init.classPeriods]
		};
	}

	let {
		mode,
		term,
		sibling,
		busy,
		serverError,
		initial,
		onsubmit,
		oncancel
	}: {
		mode: 'create' | 'edit';
		term: 'S1' | 'S2';
		sibling: SiblingSemester;
		busy: boolean;
		serverError: string | null;
		initial?: EventFormInitial;
		onsubmit: (input: EventFormInput) => void;
		oncancel?: () => void;
	} = $props();

	/**
	 * Snapshot-at-mount: `initial` seeds the draft once, and the detail page
	 * remounts this form per edited row (`{#key event._id}`), so the snapshot
	 * can never go stale behind a prop change.
	 */
	// svelte-ignore state_referenced_locally
	let draft = $state(blankDraft(initial));
	let periodWarning = $state(false);

	const ranged = $derived(isRangedEventType(draft.type));
	const partial = $derived(draft.type === 'partial');
	const isReminder = $derived(draft.type === 'reminder');
	const noteHidden = $derived(
		isNoteHiddenForEventType(draft.type, isReminder ? draft.reminderKind : undefined)
	);
	const noteRequired = $derived(isNoteRequiredForEventType(draft.type));
	const isFreeTitle = $derived(
		isReminder && (draft.reminderKind === 'task' || draft.reminderKind === 'quiz')
	);
	const isQuizKind = $derived(isReminder && draft.reminderKind === 'quiz');
	const isExam = $derived(draft.type === 'exam');
	const lockedTitle = $derived.by((): string | null => {
		if (draft.type === 'reminder') return ESL_REMINDER_TITLES[draft.reminderKind];
		if (draft.type === 'exam') return null;
		// A partial keeps the title it was stored with: `Start at P3` is a
		// valid partial title (#293), so editing the first day must not
		// demote it to the ordinary `No class` chip.
		if (draft.type === 'partial' && ESL_PARTIAL_TITLES.includes(draft.title)) return draft.title;
		return ESL_EVENT_TITLES[draft.type];
	});
	/**
	 * Per-type target gating (#212, #216): most types lock to one target;
	 * reminders lock per kind (quiz/CLIL, passport+recording+checks/Comm,
	 * workbook/CLIL); only Start, Partial, and task-kind reminders offer
	 * the dropdown. The backend refuses a mistargeted write with the same
	 * rule, so the form snaps on type/kind switch rather than letting a
	 * stale target ride along onto a locked type.
	 */
	const lockedTarget = $derived(
		isReminder
			? lockedTargetForReminderKind(draft.reminderKind)
			: lockedTargetForEventType(draft.type)
	);
	/**
	 * Exam creates fan out from the picked start date (#212): 2 teaching
	 * days for Exam 1/2, 3 for the Final, pushing past weekends and off
	 * days — one row per day sharing the title as its exam group.
	 */
	const examDayCount = $derived(isExam ? (EXAM_SEED_WEEKDAYS[draft.title] ?? 2) : 0);
	// ExamRangePicker only takes 2 | 3; the backend fan-out agrees, so clamp.
	const examRangeLength = $derived((examDayCount === 3 ? 3 : 2) as 2 | 3);

	/**
	 * Wizard-style date picking (ticket #230): WeekPicker for date selection,
	 * ExamRangePicker for exam ranges. The school year is derived from the
	 * semester term and the picked date (or initial date).
	 */
	const schoolYear = $derived(
		draft.date !== ''
			? schoolYearForTerm(term, draft.date)
			: schoolYearForTerm(term, new Date().toISOString().slice(0, 10))
	);
	const mondays = $derived(startPickerMondays(term, schoolYear));
	const defaultStart = $derived(draft.date !== '' ? defaultStartDate(term, schoolYear) : '');
	const dateOverridden = $derived(
		draft.date !== '' && defaultStart !== '' && draft.date !== defaultStart
	);

	/**
	 * The S1/S2 cross check is advisory: an exam move that stretches a term
	 * into its sibling warns here and saves anyway. Only no-school/exam-day
	 * collisions refuse, and that refusal arrives as `serverError`.
	 */
	const warning = $derived(
		draft.date === ''
			? null
			: boundaryCrossWarning({ term, type: draft.type, date: draft.date, sibling })
	);

	function onTypeChange(next: EslEventType) {
		draft.type = next;
		// Ranges live on reminders only, the period pick on partials only —
		// switching away drops the now-meaningless value so a stale end
		// cannot ride along onto an exam the backend would refuse.
		if (!isRangedEventType(next)) draft.endDate = '';
		if (next !== 'partial') draft.classPeriods = [];
		if (next === 'reminder') {
			draft.isBanner = true;
			onReminderKindChange(draft.reminderKind);
			return;
		}
		// Banner-only types show no note field — switching onto one drops the
		// now-meaningless text so a stale note cannot ride along on submit.
		if (isNoteHiddenForEventType(next)) draft.note = '';
		// Locked-target types snap to their target for the same reason: a
		// G7 pick cannot ride along onto a locked type the backend would refuse.
		const locked = lockedTargetForEventType(next);
		if (locked !== null) {
			draft.target = locked;
		} else {
			// For open-target types, use the default target
			draft.target = defaultTargetForEventType(next);
		}
		// Titles are locked per type and never derived from the note: fixed
		// types snap to their locked title, exams keep a valid exam title or
		// fall back to Exam 1.
		if (next === 'exam') {
			if (!(ESL_EXAM_TITLES as readonly string[]).includes(draft.title)) {
				draft.title = ESL_EXAM_TITLES[0];
			}
		} else {
			draft.title = ESL_EVENT_TITLES[next];
		}
	}

	function onReminderKindChange(next: EslReminderKind) {
		const prev = draft.reminderKind;
		draft.reminderKind = next;
		if (isNoteHiddenForEventType('reminder', next)) draft.note = '';
		const locked = lockedTargetForReminderKind(next);
		if (locked !== null) draft.target = locked;
		// Free-text kinds (quiz, task) keep typed text when switching between
		// them; locked kinds snap to their title.
		if (next === 'task' || next === 'quiz') {
			if (prev !== 'task' && prev !== 'quiz') draft.title = '';
		} else {
			draft.title = ESL_REMINDER_TITLES[next];
		}
	}

	function pickDate(date: string) {
		draft.date = date;
	}

	function clearExamRange() {
		draft.endDate = '';
	}
</script>

<form
	data-testid="event-form"
	class="space-y-3 rounded-lg border bg-white p-4"
	onsubmit={(event) => {
		event.preventDefault();
		if (partial && draft.classPeriods.length === 0) return;
		const trimmedNote = draft.note.trim();
		onsubmit({
			type: draft.type,
			...(isReminder ? { reminderKind: draft.reminderKind, isBanner: draft.isBanner } : {}),
			title: draft.title.trim(),
			target: draft.target,
			date: draft.date,
			endDate: ranged && draft.endDate !== '' ? draft.endDate : undefined,
			...(noteHidden || trimmedNote === '' ? {} : { note: trimmedNote }),
			...(partial && draft.classPeriods.length > 0 ? { classPeriods: [...draft.classPeriods] } : {})
		});
	}}
>
	<div class="flex flex-wrap gap-3">
		<div class="flex flex-col gap-1">
			<Label for="event-form-type">Event type</Label>
			<select
				id="event-form-type"
				value={draft.type}
				disabled={busy}
				onchange={(event) => onTypeChange(event.currentTarget.value as EslEventType)}
				class="rounded border px-2 py-1 text-sm"
			>
				{#each TYPES as option (option)}
					<option value={option}>{ESL_EVENT_TYPE_LABELS[option]}</option>
				{/each}
			</select>
		</div>
		{#if isReminder}
			<div class="flex flex-col gap-1">
				<Label for="event-form-kind">Reminder kind</Label>
				<select
					id="event-form-kind"
					value={draft.reminderKind}
					disabled={busy}
					onchange={(event) => onReminderKindChange(event.currentTarget.value as EslReminderKind)}
					class="rounded border px-2 py-1 text-sm"
				>
					{#each ESL_REMINDER_KINDS as option (option)}
						<option value={option}>{ESL_REMINDER_TITLES[option]}</option>
					{/each}
				</select>
			</div>
		{/if}
		<div class="flex min-w-48 flex-1 flex-col gap-1">
			<Label for="event-form-title">Title</Label>
			{#if isFreeTitle}
				<input
					id="event-form-title"
					type="text"
					placeholder={isQuizKind ? 'Unit 1 Quiz Due' : 'Passport Unit 3 due'}
					bind:value={draft.title}
					disabled={busy}
					required
					class="rounded border px-2 py-1 text-sm"
				/>
				<span class="text-xs text-gray-500"
					>{#if isQuizKind}Quizzes take a numbered title (Unit 1 Quiz Due, Unit 2 Quiz Due) — edit
						the number after creation when a unit shifts.{:else}Tasks take a free-text title —
						always the banner.{/if}</span
				>
			{:else if isExam}
				<select
					id="event-form-title"
					bind:value={draft.title}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				>
					{#each ESL_EXAM_TITLES as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			{:else}
				<input
					id="event-form-title"
					type="text"
					value={lockedTitle}
					disabled
					readonly
					aria-readonly="true"
					class="rounded border bg-gray-50 px-2 py-1 text-sm text-gray-600"
				/>
				<span class="text-xs text-gray-500"
					>Locked for this type{#if !noteHidden}
						— details go in the note{/if}.</span
				>
			{/if}
		</div>
		<div class="flex flex-col gap-1">
			<Label for="event-form-target">Target</Label>
			{#if lockedTarget !== null}
				<input
					id="event-form-target"
					type="text"
					value={lockedTarget === 'all' ? 'All' : lockedTarget}
					disabled
					readonly
					aria-readonly="true"
					class="rounded border bg-gray-50 px-2 py-1 text-sm text-gray-600"
				/>
				<span class="text-xs text-gray-500">Locked for this type.</span>
			{:else}
				<select
					id="event-form-target"
					bind:value={draft.target}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				>
					{#each ESL_EVENT_TARGETS as option (option)}
						<option value={option}>{option === 'all' ? 'All' : option}</option>
					{/each}
				</select>
			{/if}
		</div>
	</div>

	<div class="flex flex-wrap gap-3">
		<div class="flex w-full flex-col gap-1">
			<Label>Date</Label>
			<div class="space-y-2">
				<WeekPicker
					{mondays}
					selectedDate={draft.date}
					snapToMonday={!isExam}
					onPick={pickDate}
					testId="event-form.picker"
				/>
				<input
					id="event-form-date"
					type="date"
					bind:value={draft.date}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
				{#if dateOverridden}
					<RecalculateHint
						testId="event-form.recalculate"
						onRecalculate={() => {
							draft.date = defaultStart;
						}}
					/>
				{/if}
				{#if isExam}
					<span class="text-xs text-gray-500"
						>Start date — saves {examDayCount} teaching-day rows, skipping weekends and off days.</span
					>
				{:else}
					<span class="text-xs text-gray-500">Pick the week and day for this event.</span>
				{/if}
			</div>
		</div>
		{#if isExam}
			<div class="flex w-full flex-col gap-1">
				<Label>Exam range</Label>
				<ExamRangePicker
					examLabel={draft.title}
					rangeLength={examRangeLength}
					currentDates={draft.endDate ? [draft.date, draft.endDate] : [draft.date]}
					onClear={clearExamRange}
					testId="event-form.exam-range"
				/>
				{#if draft.endDate}
					<RecalculateHint
						testId="event-form.exam-recalculate"
						onRecalculate={clearExamRange}
						label="Clear range"
					/>
				{/if}
			</div>
		{:else if ranged}
			<div class="flex flex-col gap-1">
				<Label for="event-form-end">End date</Label>
				<input
					id="event-form-end"
					type="date"
					bind:value={draft.endDate}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
				<span class="text-xs text-gray-500">Reminder windows only — reminders take ranges.</span>
			</div>
		{/if}
		{#if isReminder}
			<div class="flex flex-col gap-1">
				<Label for="event-form-banner">Banner</Label>
				<label class="flex items-center gap-2 text-sm">
					<input
						id="event-form-banner"
						type="checkbox"
						bind:checked={draft.isBanner}
						disabled={busy}
					/>
					Show as week banner
				</label>
			</div>
		{/if}
		{#if partial}
			<div class="flex flex-col gap-1">
				<span class="text-sm font-medium">Periods with class</span>
				<div class="grid grid-cols-8 gap-1" data-testid="event-form.class-periods">
					{#each ESL_PERIOD_NUMBERS as period (period)}
						<button
							type="button"
							disabled={busy}
							aria-pressed={draft.classPeriods.includes(period)}
							aria-label={`Period ${period}`}
							onclick={() => {
								const idx = draft.classPeriods.indexOf(period);
								if (idx >= 0) {
									draft.classPeriods = draft.classPeriods.toSpliced(idx, 1);
									periodWarning = false;
								} else if (draft.classPeriods.length < 7) {
									draft.classPeriods = [...draft.classPeriods, period].sort((a, b) => a - b);
									periodWarning = false;
								} else {
									periodWarning = true;
								}
							}}
							class="rounded border px-1 py-1 text-xs font-semibold {draft.classPeriods.includes(
								period
							)
								? 'border-emerald-700 bg-emerald-700 text-white'
								: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
						>
							P{period}
						</button>
					{/each}
				</div>
				<div class="flex flex-wrap items-center gap-1">
					<button
						type="button"
						disabled={busy}
						onclick={() => {
							const morning = [1, 2, 3, 4];
							const all = draft.classPeriods;
							const hasAll = morning.every((p) => all.includes(p));
							if (hasAll) {
								draft.classPeriods = all.filter((p) => !morning.includes(p));
								periodWarning = false;
							} else {
								const next = [...new Set([...all, ...morning])].sort((a, b) => a - b);
								if (next.length <= 7) {
									draft.classPeriods = next;
									periodWarning = false;
								} else {
									periodWarning = true;
								}
							}
						}}
						class="rounded border px-1.5 py-0.5 text-[11px] font-medium {draft.classPeriods
							.length === 4 && [1, 2, 3, 4].every((p) => draft.classPeriods.includes(p))
							? 'border-emerald-700 bg-emerald-700 text-white'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-emerald-50'}">Morning</button
					>
					<button
						type="button"
						disabled={busy}
						onclick={() => {
							const afternoon = [5, 6, 7, 8];
							const all = draft.classPeriods;
							const hasAll = afternoon.every((p) => all.includes(p));
							if (hasAll) {
								draft.classPeriods = all.filter((p) => !afternoon.includes(p));
								periodWarning = false;
							} else {
								const next = [...new Set([...all, ...afternoon])].sort((a, b) => a - b);
								if (next.length <= 7) {
									draft.classPeriods = next;
									periodWarning = false;
								} else {
									periodWarning = true;
								}
							}
						}}
						class="rounded border px-1.5 py-0.5 text-[11px] font-medium {draft.classPeriods
							.length === 4 && [5, 6, 7, 8].every((p) => draft.classPeriods.includes(p))
							? 'border-emerald-700 bg-emerald-700 text-white'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-emerald-50'}">Afternoon</button
					>
					{#if periodWarning}
						<span class="text-xs text-red-600">A partial day needs 1–7 periods (not 0 or 8).</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if !noteHidden}
		<div class="flex flex-col gap-1">
			<Label for="event-form-note">Note</Label>
			<textarea
				id="event-form-note"
				bind:value={draft.note}
				disabled={busy}
				required={noteRequired}
				rows="2"
				placeholder="BBQ from 12:00 — collect permission slips"
				class="rounded border px-2 py-1 text-sm"></textarea>
		</div>
	{/if}

	{#if warning}
		<p
			data-testid="event-form.warning"
			class="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"
		>
			{warning}
		</p>
	{/if}
	{#if serverError}
		<p
			data-testid="event-form.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			{serverError}
		</p>
	{/if}

	<div class="flex gap-2">
		<Button type="submit" size="sm" disabled={busy || (partial && draft.classPeriods.length === 0)}>
			{mode === 'create' ? 'Add event' : 'Save changes'}
		</Button>
		{#if mode === 'edit' && oncancel}
			<Button type="button" variant="outline" size="sm" disabled={busy} onclick={oncancel}>
				Cancel
			</Button>
		{/if}
	</div>
</form>
