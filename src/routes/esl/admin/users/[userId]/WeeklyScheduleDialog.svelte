<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
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
		teacherId: Id<'users'>;
		teacherName: string;
		/** The profile's selected school year — the only year this dialog reads. */
		year: string;
		/** The teacher's ESL classes for `year`, with meetings and rooms. */
		classes: ScheduleClass[];
	} = $props();

	/**
	 * The teacher's blocked slots for this year only. Subscribed while the
	 * dialog is open; absence of rows means available everywhere, so an
	 * unsubscribed or empty payload renders a blank (available) grid.
	 */
	const blocksQuery = useQuery(api.esl.availability.listByYear, () => (open ? { year } : 'skip'));

	const blocks = $derived(
		(blocksQuery.data ?? [])
			.filter((row) => row.teacherId === teacherId)
			.map((row) => ({ day: row.day, period: row.period, note: row.note ?? '' }))
	);

	function taughtAt(day: EslDay, period: number): ScheduleClass | null {
		for (const cls of classes) {
			if (cls.meetings.some((meeting) => meeting.day === day && meeting.period === period)) {
				return cls;
			}
		}
		return null;
	}

	function blockNote(day: EslDay, period: number): string | null {
		const block = blocks.find((candidate) => candidate.day === day && candidate.period === period);
		return block ? (block.note.trim() === '' ? null : block.note.trim()) : null;
	}

	function hasBlock(day: EslDay, period: number): boolean {
		return blocks.some((candidate) => candidate.day === day && candidate.period === period);
	}

	const taughtPeriods = $derived(classes.reduce((count, cls) => count + cls.meetings.length, 0));

	/** A fully unscheduled week reads as unassigned, not as a load error. */
	const isEmptyWeek = $derived(
		!blocksQuery.isLoading && taughtPeriods === 0 && blocks.length === 0
	);
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
						{@const taught = taughtAt(day, slot.period)}
						{@const blocked = taught === null && hasBlock(day, slot.period)}
						{@const note = blocked ? blockNote(day, slot.period) : null}
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
								taught !== null
									? 'border-emerald-200 bg-emerald-50 text-emerald-900'
									: blocked
										? 'border-gray-300 bg-gray-100 font-medium text-gray-600'
										: 'border-input text-muted-foreground'
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
