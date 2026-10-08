<script lang="ts">
	import { X } from '@lucide/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import {
		ESL_DAYS,
		ESL_DAY_LABELS,
		ESL_PERIODS,
		eslMeetingLabel,
		type EslDay
	} from '$convex/shared/esl';
	import {
		selectTeacherBlocks,
		type TeacherAvailabilityBlock,
		type TeacherYearContext
	} from './teacher-availability';

	let {
		open = $bindable(false),
		teacherId,
		teacherName,
		year,
		onSaved
	}: {
		open?: boolean;
		/** The page shows the success notice; the dialog closes itself first. */
		onSaved: (savedYear: string, count: number) => void;
	} & TeacherYearContext = $props();

	const client = useConvexClient();

	/**
	 * The teacher's saved blocks for this year only. Subscribed while the
	 * dialog is open; absence of rows means available everywhere, so an
	 * unsubscribed or empty payload stages as a fully available grid.
	 */
	const blocksQuery = useQuery(api.esl.availability.listByYear, () => (open ? { year } : 'skip'));

	const saved = $derived<TeacherAvailabilityBlock[]>(
		selectTeacherBlocks(blocksQuery.data ?? [], teacherId)
	);

	let staged = $state<TeacherAvailabilityBlock[]>([]);
	/** Once the admin touches the grid, late server data stops refreshing the draft. */
	let touched = $state(false);
	let confirmingDiscard = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	$effect(() => {
		if (open && !touched) {
			staged = saved.map((block) => ({ ...block }));
		}
	});

	function slotKey(block: { day: string; period: number; note?: string }): string {
		return `${block.day}|${block.period}|${(block.note ?? '').trim()}`;
	}

	/** Save is a no-op exactly when the draft matches the saved rows. */
	const dirty = $derived.by(() => {
		const before = saved.map(slotKey).sort();
		const after = staged.map(slotKey).sort();
		return before.length !== after.length || before.some((key, index) => key !== after[index]);
	});

	/** Blocked slots in week order, so the note inputs read top to bottom. */
	const blockedOrdered = $derived(
		[...staged].sort(
			(a, b) => ESL_DAYS.indexOf(a.day) - ESL_DAYS.indexOf(b.day) || a.period - b.period
		)
	);

	function isBlocked(day: EslDay, period: number): boolean {
		return staged.some((block) => block.day === day && block.period === period);
	}

	function toggle(day: EslDay, period: number) {
		touched = true;
		confirmingDiscard = false;
		if (isBlocked(day, period)) {
			staged = staged.filter((block) => !(block.day === day && block.period === period));
		} else {
			staged = [...staged, { day, period, note: '' }];
		}
	}

	function reset() {
		touched = false;
		confirmingDiscard = false;
		saving = false;
		saveError = '';
	}

	function requestClose() {
		if (dirty) {
			confirmingDiscard = true;
			return;
		}
		reset();
		open = false;
	}

	/**
	 * The single interception point for every close path the dialog owns
	 * (Escape, outside click, the X button): while the draft differs from the
	 * saved rows the dialog stays open and asks about discarding instead.
	 */
	function handleOpenChange(next: boolean) {
		if (!next && dirty) {
			confirmingDiscard = true;
			return;
		}
		if (!next) reset();
		open = next;
	}

	/**
	 * One replace-all write for the whole grid: the mutation deletes this
	 * teacher's rows for the year and inserts the staged set in one
	 * transaction, so availability can never land half-written.
	 */
	async function save() {
		if (!dirty || saving) return;
		saving = true;
		saveError = '';
		const blocks = staged.map((block) => {
			const note = block.note.trim();
			return note === ''
				? { day: block.day, period: block.period }
				: { day: block.day, period: block.period, note };
		});
		try {
			await client.mutation(api.esl.availability.setBlocks, {
				teacherId,
				year,
				blocks
			});
			const count = blocks.length;
			reset();
			open = false;
			onSaved(year, count);
		} catch (error: unknown) {
			saveError = humanConvexErrorMessage(error);
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content
		class="max-w-xl"
		testId="esl-admin-user-profile.availability.dialog"
		showCloseButton={false}
	>
		<Dialog.Header>
			<Dialog.Title>Set availability</Dialog.Title>
			<Dialog.Description>
				{teacherName} · {year} — click a slot to toggle it between available and NA. Save writes the whole
				week at once.
			</Dialog.Description>
		</Dialog.Header>

		<button
			type="button"
			aria-label="Close"
			onclick={requestClose}
			class="ring-offset-background focus:ring-ring absolute end-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
		>
			<X class="size-4" aria-hidden="true" />
			<span class="sr-only">Close</span>
		</button>

		{#if saveError}
			<p
				data-testid="esl-admin-user-profile.availability.error"
				class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
			>
				{saveError}
			</p>
		{/if}

		<div role="group" aria-label="Availability for {year}">
			<div class="grid grid-cols-[1.25rem_repeat(5,minmax(0,1fr))]">
				<span></span>
				{#each ESL_DAYS as day (day)}
					<span class="text-muted-foreground text-center text-xs">{ESL_DAY_LABELS[day]}</span>
				{/each}
			</div>
			{#each ESL_PERIODS as slot (slot.period)}
				<div class="grid grid-cols-[1.25rem_repeat(5,minmax(0,1fr))]">
					<span class="text-muted-foreground flex items-center text-xs">P{slot.period}</span>
					{#each ESL_DAYS as day (day)}
						{@const blocked = isBlocked(day, slot.period)}
						{@const label = eslMeetingLabel({ day, period: slot.period })}
						<button
							type="button"
							aria-pressed={blocked}
							aria-label="{label} {blocked ? 'unavailable' : 'available'}"
							title={label}
							data-testid="esl-admin-user-profile.availability.cell"
							data-blocked={blocked}
							onclick={() => toggle(day, slot.period)}
							class={[
								'-mt-px -ml-px flex h-6 cursor-pointer items-center justify-center border text-xs',
								blocked
									? 'border-gray-300 bg-gray-100 font-medium text-gray-600'
									: 'border-input text-muted-foreground hover:bg-muted'
							]}
						>
							{#if blocked}NA{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>

		{#if staged.length === 0 && !blocksQuery.isLoading}
			<p
				data-testid="esl-admin-user-profile.availability.hint"
				class="text-muted-foreground text-sm"
			>
				All periods available — click a slot to mark NA.
			</p>
		{/if}

		{#if blockedOrdered.length > 0}
			<div class="space-y-1.5">
				<p class="text-sm font-medium">Blocked notes (optional)</p>
				{#each blockedOrdered as block (`${block.day} ${block.period}`)}
					<div class="flex items-center gap-2">
						<label
							for="availability-note-{block.day}-{block.period}"
							class="w-14 shrink-0 text-xs font-medium"
						>
							{eslMeetingLabel(block)}
						</label>
						<input
							id="availability-note-{block.day}-{block.period}"
							type="text"
							bind:value={
								() => block.note,
								(value) => {
									block.note = value;
									touched = true;
									confirmingDiscard = false;
								}
							}
							placeholder="Note (optional, e.g. HWIS class)"
							data-testid="esl-admin-user-profile.availability.note"
							class="border-input focus-visible:ring-ring h-8 flex-1 rounded-md border bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:ring-1"
						/>
					</div>
				{/each}
			</div>
		{/if}

		{#if confirmingDiscard}
			<div
				data-testid="esl-admin-user-profile.availability.discard"
				class="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"
			>
				<p class="font-medium">Discard unsaved changes?</p>
				<p class="mt-0.5 text-xs">The toggles and notes you entered will be lost.</p>
				<div class="mt-2 flex justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						onclick={() => (confirmingDiscard = false)}
						testId="esl-admin-user-profile.availability.discard-keep"
					>
						Keep editing
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onclick={() => {
							reset();
							open = false;
						}}
						testId="esl-admin-user-profile.availability.discard-yes"
					>
						Discard changes
					</Button>
				</div>
			</div>
		{/if}

		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={requestClose}
				testId="esl-admin-user-profile.availability.cancel"
			>
				Cancel
			</Button>
			<Button
				disabled={!dirty || saving}
				onclick={save}
				testId="esl-admin-user-profile.availability.save"
			>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
