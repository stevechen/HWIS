<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { useViewer } from '$lib/viewer.svelte';
	import TeacherScheduleTable from '$lib/components/esl/TeacherScheduleTable.svelte';
	import {
		buildEventNoteMap,
		SCHEDULE_TARGET_FILTERS,
		type ScheduleTargetFilter
	} from '$lib/esl-schedule-list';

	const session = useViewer();

	const teacherId = $derived(session.viewer?._id);

	const semestersQuery = useQuery(api.esl.semesters.list, () => ({}));
	const semesters = $derived(semestersQuery.data ?? []);

	let pickedSemesterId = $state<string | null>(null);
	const selected = $derived(
		semesters.find((semester) => semester._id === pickedSemesterId) ?? semesters[0] ?? null
	);

	let target = $state<ScheduleTargetFilter>('all');

	const today = new Date().toISOString().slice(0, 10);

	const daysQuery = useQuery(api.esl.schedule.teacherDays, () =>
		teacherId !== undefined && selected !== null
			? {
					teacherId,
					semesterId: selected._id,
					fromDate: selected.startDate,
					toDate: selected.derivedEnd ?? today
				}
			: 'skip'
	);

	const classesQuery = useQuery(api.esl.classes.listByTeacher, () =>
		teacherId !== undefined ? { teacherId } : 'skip'
	);

	const eventsQuery = useQuery(api.esl.events.listBySemester, () =>
		selected !== null ? { semesterId: selected._id } : 'skip'
	);

	const rows = $derived(daysQuery.data ?? []);
	const visibleRows = $derived(target === 'all' ? rows : rows.filter((row) => row.type === target));

	const classNames = $derived<Record<string, string>>(
		Object.fromEntries(
			(classesQuery.data ?? []).map((cls): [string, string] => [cls._id, cls.name])
		)
	);
	const eventNotes = $derived(buildEventNoteMap(eventsQuery.data ?? []));

	const semesterLabel = $derived(selected === null ? '' : `${selected.year} ${selected.term}`);
	const finalsTbd = $derived(selected !== null && selected.derivedEnd === null);
	const loading = $derived(semestersQuery.isLoading || daysQuery.isLoading);
</script>

<div class="mx-auto w-full max-w-6xl p-8">
	<h1 data-testid="esl-schedule.title" class="text-2xl font-bold text-emerald-900">
		My Semester Schedule
	</h1>
	<p class="text-muted-foreground mt-2">
		Your semester as a chronological table — countdown, date, description, and note.
	</p>

	{#if semestersQuery.isLoading}
		<p data-testid="esl-schedule.loading" class="mt-6">Loading semesters…</p>
	{:else if selected === null}
		<p data-testid="esl-schedule.empty" class="mt-6">
			No semester is set up yet. Your schedule appears here once an admin creates one.
		</p>
	{:else}
		<div class="mt-6 flex flex-wrap items-end gap-4">
			<label class="flex flex-col gap-1 text-sm font-medium">
				Semester
				<select
					data-testid="esl-schedule.semester"
					aria-label="Semester"
					class="rounded border px-2 py-1"
					value={selected._id}
					onchange={(event) => {
						pickedSemesterId = event.currentTarget.value;
					}}
				>
					{#each semesters as semester (semester._id)}
						<option value={semester._id}>{semester.year} {semester.term}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-sm font-medium">
				Class type
				<select
					data-testid="esl-schedule.target"
					aria-label="Filter by class type"
					class="rounded border px-2 py-1"
					bind:value={target}
				>
					{#each SCHEDULE_TARGET_FILTERS as option (option)}
						<option value={option}>{option === 'all' ? 'All' : option}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if finalsTbd}
			<p
				data-testid="esl-schedule.finals-tbd"
				class="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
			>
				Final exams TBD — showing {selected.startDate} through today until exams are entered.
			</p>
		{/if}

		{#if loading}
			<p data-testid="esl-schedule.loading-rows" class="mt-6">Loading schedule…</p>
		{:else if visibleRows.length === 0}
			<p data-testid="esl-schedule.no-rows" class="mt-6">No meetings in this range yet.</p>
		{:else}
			<div class="mt-4">
				<TeacherScheduleTable
					rows={visibleRows}
					{classNames}
					{eventNotes}
					downloadName={`${semesterLabel} schedule`}
				/>
			</div>
		{/if}
	{/if}
</div>
