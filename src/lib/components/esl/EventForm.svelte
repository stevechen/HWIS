<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import {
		ESL_EVENT_TARGETS,
		ESL_EVENT_TITLES,
		ESL_EXAM_TITLES,
		ESL_PERIOD_NUMBERS,
		isRangedEventType,
		type EslEventTarget,
		type EslEventType
	} from '$convex/shared/esl';
	import { boundaryCrossWarning, type SiblingSemester } from '$lib/esl-semesters';

	export type EventFormInput = {
		type: EslEventType;
		title: string;
		target: EslEventTarget;
		date: string;
		endDate?: string;
		note?: string;
		startPeriod?: number;
		endPeriod?: number;
	};

	export type EventFormInitial = {
		type: EslEventType;
		title: string;
		target: EslEventTarget;
		date: string;
		endDate?: string;
		note?: string;
		startPeriod?: number;
		endPeriod?: number;
	};

	const TYPE_LABELS: Record<EslEventType, string> = {
		start_school: 'Start of school',
		quiz: 'Quiz',
		no_school: 'No school',
		no_class: 'No class',
		partial: 'Partial day',
		exam: 'Exam',
		passport_due: 'Passport due',
		recording_due: 'Recording due',
		task: 'Task',
		g9_mock: 'G9 mock'
	};

	const TYPES: EslEventType[] = [
		'start_school',
		'quiz',
		'no_school',
		'no_class',
		'partial',
		'exam',
		'passport_due',
		'recording_due',
		'task',
		'g9_mock'
	];

	/**
	 * The title a fresh draft of a type carries: locked titles arrive
	 * prefilled (and stay locked), exams default to Exam 1, tasks start
	 * blank — the banner always shows the task's own free text.
	 */
	function defaultTitleFor(type: EslEventType): string {
		if (type === 'task') return '';
		if (type === 'exam') return ESL_EXAM_TITLES[0];
		return ESL_EVENT_TITLES[type];
	}

	type Draft = {
		type: EslEventType;
		title: string;
		target: EslEventTarget;
		date: string;
		endDate: string;
		note: string;
		startPeriod: string;
		endPeriod: string;
	};

	function blankDraft(init?: EventFormInitial): Draft {
		const type = init?.type ?? 'exam';
		return {
			type,
			title: init?.title ?? defaultTitleFor(type),
			target: init?.target ?? 'all',
			date: init?.date ?? '',
			endDate: init?.endDate ?? '',
			note: init?.note ?? '',
			startPeriod: init?.startPeriod === undefined ? '' : String(init.startPeriod),
			endPeriod: init?.endPeriod === undefined ? '' : String(init.endPeriod)
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

	const ranged = $derived(isRangedEventType(draft.type));
	const partial = $derived(draft.type === 'partial');
	const isTask = $derived(draft.type === 'task');
	const isExam = $derived(draft.type === 'exam');
	const lockedTitle = $derived(
		draft.type === 'task' || draft.type === 'exam' ? null : ESL_EVENT_TITLES[draft.type]
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
		const prev = draft.type;
		draft.type = next;
		// Ranges live on due-types only, bounds on partials only — switching
		// away drops the now-meaningless value so a stale end cannot ride
		// along onto an exam the backend would refuse.
		if (!isRangedEventType(next)) draft.endDate = '';
		if (next !== 'partial') {
			draft.startPeriod = '';
			draft.endPeriod = '';
		}
		// Titles are locked per type and never derived from the note: fixed
		// types snap to their locked title, exams keep a valid exam title or
		// fall back to Exam 1, tasks start blank unless already typed there.
		if (next === 'task') {
			if (prev !== 'task') draft.title = '';
		} else if (next === 'exam') {
			if (!(ESL_EXAM_TITLES as readonly string[]).includes(draft.title)) {
				draft.title = ESL_EXAM_TITLES[0];
			}
		} else {
			draft.title = ESL_EVENT_TITLES[next];
		}
	}
</script>

<form
	data-testid="event-form"
	class="space-y-3 rounded-lg border bg-white p-4"
	onsubmit={(event) => {
		event.preventDefault();
		const trimmedNote = draft.note.trim();
		const parsedStart = draft.startPeriod === '' ? undefined : Number(draft.startPeriod);
		const parsedEnd = draft.endPeriod === '' ? undefined : Number(draft.endPeriod);
		onsubmit({
			type: draft.type,
			title: draft.title.trim(),
			target: draft.target,
			date: draft.date,
			endDate: ranged && draft.endDate !== '' ? draft.endDate : undefined,
			note: trimmedNote === '' ? undefined : trimmedNote,
			startPeriod: partial ? parsedStart : undefined,
			endPeriod: partial ? parsedEnd : undefined
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
					<option value={option}>{TYPE_LABELS[option]}</option>
				{/each}
			</select>
		</div>
		<div class="flex min-w-48 flex-1 flex-col gap-1">
			<Label for="event-form-title">Title</Label>
			{#if isTask}
				<input
					id="event-form-title"
					type="text"
					placeholder="Passport Unit 3 due"
					bind:value={draft.title}
					disabled={busy}
					required
					class="rounded border px-2 py-1 text-sm"
				/>
				<span class="text-xs text-gray-500">Tasks take a free-text title — always the banner.</span>
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
				<span class="text-xs text-gray-500">Locked for this type — details go in the note.</span>
			{/if}
		</div>
		<div class="flex flex-col gap-1">
			<Label for="event-form-target">Target</Label>
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
		</div>
	</div>

	<div class="flex flex-wrap gap-3">
		<div class="flex flex-col gap-1">
			<Label for="event-form-date">Date</Label>
			<input
				id="event-form-date"
				type="date"
				bind:value={draft.date}
				disabled={busy}
				required
				class="rounded border px-2 py-1 text-sm"
			/>
		</div>
		{#if ranged}
			<div class="flex flex-col gap-1">
				<Label for="event-form-end">End date</Label>
				<input
					id="event-form-end"
					type="date"
					bind:value={draft.endDate}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
				<span class="text-xs text-gray-500">Reminder windows only — due-types take ranges.</span>
			</div>
		{/if}
		{#if partial}
			<div class="flex flex-col gap-1">
				<Label for="event-form-start-period">Starts from period</Label>
				<select
					id="event-form-start-period"
					bind:value={draft.startPeriod}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				>
					<option value="">Full day</option>
					{#each ESL_PERIOD_NUMBERS as period (period)}
						<option value={String(period)}>P{period}</option>
					{/each}
				</select>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="event-form-end-period">Ends at period</Label>
				<select
					id="event-form-end-period"
					bind:value={draft.endPeriod}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				>
					<option value="">Full day</option>
					{#each ESL_PERIOD_NUMBERS as period (period)}
						<option value={String(period)}>P{period}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-1">
		<Label for="event-form-note">Note</Label>
		<textarea
			id="event-form-note"
			bind:value={draft.note}
			disabled={busy}
			rows="2"
			placeholder="BBQ from 12:00 — collect permission slips"
			class="rounded border px-2 py-1 text-sm"
		></textarea>
	</div>

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
		<Button type="submit" size="sm" disabled={busy}>
			{mode === 'create' ? 'Add event' : 'Save changes'}
		</Button>
		{#if mode === 'edit' && oncancel}
			<Button type="button" variant="outline" size="sm" disabled={busy} onclick={oncancel}>
				Cancel
			</Button>
		{/if}
	</div>
</form>
