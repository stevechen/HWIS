<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		ESL_DAYS,
		ESL_DAY_LABELS,
		ESL_PERIODS,
		eslClassShortLabel,
		eslMeetingLabel,
		type EslDay
	} from '$convex/shared/esl';
	import { selectTeacherBlocks, type TeacherYearContext } from './teacher-availability';

	type ScheduleClass = {
		name: string;
		type: string;
		room: string | null;
		cohortLabel: string;
		meetings: { day: EslDay; period: number }[];
	};

	let {
		open = $bindable(false),
		teacherId,
		teacherName,
		year,
		classes
	}: {
		open?: boolean;
		/** The teacher's ESL classes for `year`, with meetings and rooms. */
		classes: ScheduleClass[];
	} & TeacherYearContext = $props();

	/**
	 * The teacher's blocked slots for this year only. Subscribed while the
	 * dialog is open; absence of rows means available everywhere, so an
	 * unsubscribed or empty payload renders a blank (available) grid.
	 */
	const blocksQuery = useQuery(api.esl.availability.listByYear, () => (open ? { year } : 'skip'));

	const blocks = $derived(selectTeacherBlocks(blocksQuery.data ?? [], teacherId));

	function taughtAt(day: EslDay, period: number): ScheduleClass | null {
		for (const cls of classes) {
			if (cls.meetings.some((meeting) => meeting.day === day && meeting.period === period)) {
				return cls;
			}
		}
		return null;
	}

	/**
	 * One cell's state, so the label and the styling read the same verdict.
	 *
	 * Taught wins over blocked where the two overlap (story 25): the two busy
	 * reasons stay distinct, as in the class-timetable picker.
	 */
	function cellState(
		day: EslDay,
		period: number
	): {
		state: 'taught' | 'blocked' | 'free';
		taught: ScheduleClass | null;
		note: string | null;
	} {
		const taught = taughtAt(day, period);
		if (taught !== null) return { state: 'taught', taught, note: null };
		const block = blocks.find((candidate) => candidate.day === day && candidate.period === period);
		if (block !== undefined) {
			const note = block.note.trim() === '' ? null : block.note.trim();
			return { state: 'blocked', taught: null, note };
		}
		return { state: 'free', taught: null, note: null };
	}

	/**
	 * How each cell state looks, keyed by state so the markup reads the
	 * verdict rather than a second stack of taught-vs-blocked conditions.
	 */
	const CELL_STATE_CLASSES: Record<'taught' | 'blocked' | 'free', string> = {
		taught: 'border-emerald-200 bg-emerald-50 text-emerald-900',
		blocked: 'border-gray-300 bg-gray-100 font-medium text-gray-600',
		free: 'border-input text-muted-foreground'
	};

	const taughtPeriods = $derived(classes.reduce((count, cls) => count + cls.meetings.length, 0));

	/**
	 * A fully unscheduled week reads as unassigned, not as a load error.
	 *
	 * Gated on the query having resolved (data present), not merely on
	 * `!isLoading`: the skip-to-subscribed transition reports no rows while
	 * not loading, which would flash the notice for one frame.
	 */
	const blocksResolved = $derived(blocksQuery.data !== undefined);
	const isEmptyWeek = $derived(blocksResolved && taughtPeriods === 0 && blocks.length === 0);
</script>

<!--
	Read-only weekly schedule dialog (spec #164 stories 17–23).

	One merged Monday–Friday by period 1–8 grid: ESL-taught cells win over NA
	blocks at the same slot (the two busy reasons stay distinct, as in the
	class-timetable picker), empty cells stay blank (available). Nothing here
	writes — availability editing lives in SetAvailabilityDialog.
-->
<Dialog.Root bind:open>
	<Dialog.Content class="max-w-2xl" testId="esl-admin-user-profile.schedule.dialog">
		<Dialog.Header>
			<Dialog.Title>Weekly schedule</Dialog.Title>
			<Dialog.Description>
				{teacherName} · {year} — ESL classes plus NA blocks, one week at a glance.
			</Dialog.Description>
		</Dialog.Header>

		<div
			role="group"
			aria-label="Weekly schedule for {year}"
			data-testid="esl-admin-user-profile.schedule.grid"
		>
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
						{@const cell = cellState(day, slot.period)}
						{@const taught = cell.taught}
						{@const blocked = cell.state === 'blocked'}
						{@const note = cell.note}
						{@const label = eslMeetingLabel({ day, period: slot.period })}
						{@const marked = taught !== null || blocked}
						{@const room = taught ? (taught.room ?? 'Room not set') : ''}
						{@const short = taught ? eslClassShortLabel(taught.name) : ''}
						{@const cellLabel =
							taught !== null
								? `${label} teaches ${taught.name} (${taught.type}, ${taught.cohortLabel}) in ${room}`
								: note !== null
									? `${label} unavailable: ${note}`
									: blocked
										? `${label} unavailable`
										: label}
						<span
							class={[
								'-mt-px -ml-px flex h-10 flex-col items-center justify-center border px-0.5 text-xs',
								CELL_STATE_CLASSES[cell.state]
							]}
							role={marked ? 'img' : undefined}
							aria-label={marked ? cellLabel : undefined}
							title={cellLabel}
							data-testid="esl-admin-user-profile.schedule.cell"
							data-blocked={blocked}
							data-taught={taught?.name ?? undefined}
						>
							{#if taught !== null}
								<span class="max-w-full truncate text-[0.625rem] leading-tight font-medium">
									{short === '' ? taught.name : short}
								</span>
								<span
									class="max-w-full truncate text-[0.625rem] leading-tight {taught.room
										? ''
										: 'italic'}"
								>
									{room}
								</span>
							{:else if blocked}
								<span class="max-w-full truncate text-[0.625rem] leading-tight">NA</span>
								{#if note !== null}
									<span
										class="max-w-full truncate text-[0.625rem] leading-tight font-normal"
										data-testid="esl-admin-user-profile.schedule.note"
									>
										{note}
									</span>
								{/if}
							{/if}
						</span>
					{/each}
				</div>
			{/each}
		</div>

		{#if isEmptyWeek}
			<p
				data-testid="esl-admin-user-profile.schedule.empty"
				class="text-muted-foreground rounded-lg border border-dashed bg-white px-4 py-6 text-center text-sm"
			>
				No classes or NA blocks in {year}.
			</p>
		{/if}

		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (open = false)}
				testId="esl-admin-user-profile.schedule.close"
			>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
