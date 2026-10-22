<script lang="ts">
	import { CalendarClock } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		ESL_DAYS,
		ESL_DAY_LABELS,
		ESL_PERIODS,
		eslClassShortLabel,
		eslMeetingLabel,
		type EslDay,
		type EslMeetingInput,
		type EslUnavailableSlot
	} from '$convex/shared/esl';
	import type { Id } from '$convex/_generated/dataModel';
	import AnchoredPanel from './AnchoredPanel.svelte';

	let {
		classId,
		teacherName,
		year,
		blocks,
		teacherClasses,
		busy = false
	}: {
		/** The card's class, so the anchor name and test ids stay unique per card. */
		classId: Id<'esl_classes'>;
		teacherName: string;
		/** The year the blocks belong to. */
		year: string;
		/**
		 * The teacher's blocked slots, as the availability query returned them.
		 *
		 * Displayed, never edited here: blocking is done wherever the teacher is
		 * managed, and this dialog is how a coordinator reads the result — the
		 * whole week at a glance, which the schedule picker (one slot at a time)
		 * cannot show.
		 */
		blocks: EslUnavailableSlot[];
		/**
		 * The teacher's saved classes this year, marking the grid.
		 *
		 * Each taught slot carries its class's short level tag (`Adv.`, `Int.`,
		 * …) with the full name in the tooltip — the list this replaces grew
		 * with every class a teacher holds, while the grid stays one week.
		 */
		teacherClasses: { name: string; meetings: EslMeetingInput[] }[];
		busy?: boolean;
	} = $props();

	let expanded = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);

	const anchorName = $derived(`--esl-availability-${classId}`);

	function close() {
		expanded = false;
		triggerEl?.focus();
	}

	function toggleDialog() {
		if (expanded) close();
		else expanded = true;
	}

	function blockFor(day: EslDay, period: number): EslUnavailableSlot | undefined {
		return blocks.find((block) => block.day === day && block.period === period);
	}

	/**
	 * The class taught at a slot, or null when the teacher is free then.
	 *
	 * Assigned hours mark the grid just like blocks do: a teacher in one room
	 * cannot take another class at the same time, so a taught slot is as
	 * unavailable as a blocked one. The title names which class holds it — the
	 * list below says the same thing in words, for what the grid cannot fit.
	 */
	function taughtBy(day: EslDay, period: number): string | null {
		for (const cls of teacherClasses) {
			if (cls.meetings.some((m) => m.day === day && m.period === period)) return cls.name;
		}
		return null;
	}

	/** Blocked slots in week order, so the notes read top to bottom. */
	const blockedOrdered = $derived(
		[...blocks].sort(
			(a, b) => ESL_DAYS.indexOf(a.day) - ESL_DAYS.indexOf(b.day) || a.period - b.period
		)
	);
</script>

<!-- Relative, so the dialog has something to pin against where anchor positioning is unavailable. -->
<div class="relative flex items-center gap-1">
	<Button
		bind:ref={triggerEl}
		variant="outline"
		size="sm"
		class="h-7 shrink-0 px-2 text-xs"
		style="anchor-name: {anchorName};"
		aria-expanded={expanded}
		aria-label="Availability for {teacherName}"
		title="View {teacherName}'s unavailable times"
		disabled={busy}
		onclick={toggleDialog}
		data-testid="esl-admin-classes.availability.trigger"
	>
		<CalendarClock class="size-3.5" aria-hidden="true" />
	</Button>

	{#if expanded}
		<AnchoredPanel
			bind:open={expanded}
			{anchorName}
			trigger={triggerEl}
			label="When {teacherName} cannot teach, {year}"
			testId="esl-admin-classes.availability.dialog"
			class="space-y-2"
		>
			<div class="space-y-1 text-xs">
				<p class="font-medium">When can't <strong>{teacherName}</strong> teach?</p>
				<p class="text-muted-foreground">
					Gray slots in {year} are spoken for — blocked hours, or classes
					{teacherName} already teaches. Saving another class onto one is refused, with the block's note
					shown as the reason.
				</p>
			</div>
			<div role="group" aria-label="Unavailable times">
				<div class="grid grid-cols-[1.25rem_repeat(5,minmax(0,1fr))]">
					<span></span>
					{#each ESL_DAYS as day (day)}
						<span class="text-muted-foreground text-center text-xs">
							{ESL_DAY_LABELS[day]}
						</span>
					{/each}
				</div>
				{#each ESL_PERIODS as slot (slot.period)}
					<div class="grid grid-cols-[1.25rem_repeat(5,minmax(0,1fr))]">
						<span class="text-muted-foreground flex items-center text-xs">P{slot.period}</span>
						{#each ESL_DAYS as day (day)}
							{@const block = blockFor(day, slot.period)}
							{@const blocked = block !== undefined}
							{@const taught = taughtBy(day, slot.period)}
							{@const marked = blocked || taught !== null}
							{@const label = eslMeetingLabel({ day, period: slot.period })}
							{@const tag = taught === null ? '' : eslClassShortLabel(taught)}
							<!-- Taught wins over NA on overlap (story 25): the class tag reads and NA hides, keeping the two busy reasons distinct. -->
							{@const showNa = blocked && taught === null}
							{@const unavailableLabel =
								taught !== null
									? `${label} teaches ${taught}`
									: block?.note
										? `${label} unavailable: ${block.note}`
										: `${label} unavailable`}
							{@const unavailableTitle =
								taught !== null
									? `${label} teaches ${taught}.`
									: block?.note
										? `${label} unavailable. ${block.note}`
										: `${label} unavailable.`}
							<!--
								Marked cells announce themselves; free cells stay
								decorative, so a screen reader meets the blocks rather
								than forty dimmed checkboxes.
							-->
							<span
								class={[
									// Square and collapsed like the picker grids: shared
									// 1px dividers, no gaps.
									'-mt-px -ml-px flex h-6 items-center justify-center border text-xs',
									// Gray, not red: a marked slot is unavailable, and red
									// is reserved for conflicts.
									marked
										? 'border-gray-300 bg-gray-100 font-medium text-gray-600'
										: 'border-input text-muted-foreground'
								]}
								role={marked ? 'img' : undefined}
								aria-label={marked ? unavailableLabel : undefined}
								title={marked ? unavailableTitle : label}
								data-testid="esl-admin-classes.availability.cell"
								data-blocked={blocked}
								data-taught={taught ?? undefined}
							>
								<input
									type="checkbox"
									class="sr-only"
									tabindex="-1"
									data-testid="esl-admin-classes.availability.slot"
									checked={marked}
									disabled
									aria-hidden="true"
								/>
								{#if tag !== ''}
									<span class="max-w-full truncate text-[0.625rem] leading-none">{tag}</span>
								{:else if showNa}
									<span class="max-w-full truncate text-[0.625rem] leading-none">NA</span>
								{/if}
							</span>
						{/each}
					</div>
				{/each}
			</div>

			<!--
				One note per blocked slot, in week order, as text.
				The note is what the picker quotes when it refuses a save on this
				slot, so it reads here exactly as it will read there.
			-->
			{#if blockedOrdered.length > 0}
				<div class="space-y-1">
					{#each blockedOrdered as block (`${block.day} ${block.period}`)}
						<p class="flex items-center gap-2 text-xs">
							<span class="w-14 shrink-0 font-medium">
								{eslMeetingLabel(block)}
							</span>
							{#if block.note}
								<span data-testid="esl-admin-classes.availability.note">{block.note}</span>
							{/if}
						</p>
					{/each}
				</div>
			{/if}
		</AnchoredPanel>
	{/if}
</div>
