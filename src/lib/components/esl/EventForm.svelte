<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import {
		ESL_EVENT_TARGETS,
		ESL_PERIOD_NUMBERS,
		isRangedEventType,
		type EslEventTarget,
		type EslEventType
	} from '$convex/shared/esl';
	import { boundaryCrossWarning, type SiblingSemester } from '$lib/esl-semesters';

	export type EventFormInput = {
		type: EslEventType;
		label: string;
		target: EslEventTarget;
		date: string;
		endDate?: string;
		note?: string;
		startPeriod?: number;
		endPeriod?: number;
	};

	export type EventFormInitial = {
		type: EslEventType;
		label: string;
		target: EslEventTarget;
		date: string;
		endDate?: string;
		note?: string;
		startPeriod?: number;
		endPeriod?: number;
	};

	const TYPE_LABELS: Record<EslEventType, string> = {
		task_due: 'Task due',
		homework_due: 'Homework due',
		quiz: 'Quiz',
		off: 'Day off',
		no_class: 'No class',
		partial: 'Partial day',
		exam: 'Exam',
		start_school: 'Start of school'
	};

	const TYPES: EslEventType[] = [
		'task_due',
		'homework_due',
		'quiz',
		'off',
		'no_class',
		'partial',
		'exam',
		'start_school'
	];

	type Draft = {
		type: EslEventType;
		label: string;
		target: EslEventTarget;
		date: string;
		endDate: string;
		note: string;
		startPeriod: string;
		endPeriod: string;
	};

	function blankDraft(init?: EventFormInitial): Draft {
		return {
			type: init?.type ?? 'exam',
			label: init?.label ?? '',
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

	/**
	 * The S1/S2 cross check is advisory: an exam move that stretches a term
	 * into its sibling warns here and saves anyway. Only off/exam-day
	 * collisions refuse, and that refusal arrives as `serverError`.
	 */
	const warning = $derived(
		draft.date === ''
			? null
			: boundaryCrossWarning({ term, type: draft.type, date: draft.date, sibling })
	);

	function onTypeChange(next: EslEventType) {
		draft.type = next;
		// Ranges live on due-types only, bounds on partials only — switching
		// away drops the now-meaningless value so a stale end cannot ride
		// along onto an exam the backend would refuse.
		if (!isRangedEventType(next)) draft.endDate = '';
		if (next !== 'partial') {
			draft.startPeriod = '';
			draft.endPeriod = '';
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
			label: draft.label.trim(),
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
			<Label for="event-form-label">Label</Label>
			<input
				id="event-form-label"
				type="text"
				placeholder="Final exam"
				bind:value={draft.label}
				disabled={busy}
				required
				class="rounded border px-2 py-1 text-sm"
			/>
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
