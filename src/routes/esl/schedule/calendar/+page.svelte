<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { useViewer } from '$lib/viewer.svelte';
	import { eslClassShortLabel } from '$convex/shared/esl';
	import TeacherCalendar from './TeacherCalendar.svelte';
	import { buildCalendarFragments } from './calendar-weeks';

	/**
	 * The teacher's per-class semester calendar page (ticket #196). Thin
	 * wiring over three reactive reads: the `teacherDays` join for the
	 * semester's meeting rows, the class roster for the headcount readout,
	 * and the teacher's own notes. Everything renders through
	 * `TeacherCalendar`, which owns the iteration-10 geometry.
	 */

	const session = useViewer();
	const client = useConvexClient();
	const teacherId = $derived(session.viewer?._id ?? null);

	// Wall-clock today, reticked every minute so Today/Next markers and past
	// hatching roll over without a reload (never sent to queries as a range
	// edge except the finals-TBD clamp, which is inherently a view concern).
	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => {
			now = new Date();
		}, 60000);
		return () => clearInterval(id);
	});
	const today = $derived(
		`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
	);

	const semestersQuery = useQuery(api.esl.semesters.list, () => ({}));
	const semesters = $derived(semestersQuery.data ?? []);
	let selectedSemesterId = $state<Id<'esl_semesters'> | ''>('');
	$effect(() => {
		if (selectedSemesterId === '' && semesters.length > 0) {
			selectedSemesterId = semesters[0]._id;
		}
	});
	const semester = $derived(semesters.find((entry) => entry._id === selectedSemesterId) ?? null);

	const classesQuery = useQuery(api.esl.classes.listByTeacher, () =>
		teacherId ? { teacherId } : 'skip'
	);
	const teacherClasses = $derived(
		(classesQuery.data ?? []).filter((entry) => entry.status === 'active')
	);

	// The read window is the whole semester: the join needs later exams for
	// oral marks and per-term counts, and clamps to the derived end itself.
	// Before the first final exists the window ends at today (finals TBD).
	const daysQuery = useQuery(api.esl.schedule.teacherDays, () =>
		teacherId && semester
			? {
					teacherId,
					semesterId: semester._id,
					fromDate: semester.startDate,
					toDate: semester.derivedEnd ?? today
				}
			: 'skip'
	);
	const rows = $derived(daysQuery.data ?? []);

	// One menu entry per class the join returned rows for, so the menu and
	// the data can never disagree (e.g. other-year classes stay out).
	const options = $derived(
		[...new Set(rows.map((row) => row.classId))].map((classId) => {
			const record = teacherClasses.find((entry) => entry._id === classId);
			const first = rows.find((row) => row.classId === classId);
			return {
				id: classId,
				name: record?.name ?? 'Class',
				short: record ? eslClassShortLabel(record.name) : 'Class',
				type: record?.type ?? first?.type ?? 'CLIL',
				room: record?.room ?? null,
				headcount: 0
			};
		})
	);
	let selectedClassId = $state('');
	$effect(() => {
		if (selectedClassId === '' && options.length > 0) {
			selectedClassId = options[0].id;
		}
	});
	const selectedOption = $derived(options.find((option) => option.id === selectedClassId) ?? null);

	const rosterQuery = useQuery(api.esl.classes.getRoster, () =>
		selectedClassId ? { classId: selectedClassId as Id<'esl_classes'> } : 'skip'
	);
	const classes = $derived(
		options.map((option) => ({
			...option,
			headcount: option.id === selectedClassId ? (rosterQuery.data?.students.length ?? 0) : 0
		}))
	);

	const classRows = $derived(rows.filter((row) => row.classId === selectedClassId));
	const calendar = $derived(
		buildCalendarFragments({
			rows: classRows,
			semesterStart: semester?.startDate ?? today,
			today
		})
	);

	// The notes seam degrades to empty boxes: while the query loads (or when
	// the teacher wrote nothing) every card still renders its note box.
	const notesQuery = useQuery(api.esl.notes.listByClass, () =>
		selectedClassId ? { classId: selectedClassId as Id<'esl_classes'> } : 'skip'
	);
	const notes = $derived(
		Object.fromEntries((notesQuery.data ?? []).map((note) => [note.date, note.text]))
	);

	let saveError = $state('');
	async function saveNote(date: string, text: string) {
		if (!selectedClassId) return;
		saveError = '';
		try {
			await client.mutation(api.esl.notes.upsert, {
				classId: selectedClassId as Id<'esl_classes'>,
				date,
				text
			});
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Could not save the note.';
		}
	}

	const loading = $derived(
		session.status === 'loading' ||
			semestersQuery.isLoading ||
			classesQuery.isLoading ||
			daysQuery.isLoading
	);
	const loadError = $derived(semestersQuery.error ?? classesQuery.error ?? daysQuery.error ?? null);
</script>

<svelte:head>
	<title>ESL class calendar</title>
</svelte:head>

<div class="mx-auto min-h-screen w-full max-w-6xl p-4 pb-32 sm:p-8">
	{#if session.status === 'loading'}
		<p role="status" aria-label="Loading">Loading…</p>
	{:else if !teacherId || !session.isEslStaff}
		<p data-testid="teacher-calendar.denied">This calendar is for ESL teachers.</p>
	{:else if loading}
		<p role="status" aria-label="Loading">Loading…</p>
	{:else if loadError}
		<p data-testid="teacher-calendar.error">Could not load the calendar.</p>
	{:else if !semester}
		<p data-testid="teacher-calendar.no-semester">No semester set up yet.</p>
	{:else if options.length === 0 || !selectedOption}
		<p data-testid="teacher-calendar.empty">No meetings scheduled this semester.</p>
	{:else}
		<TeacherCalendar
			{classes}
			{selectedClassId}
			semesterLabel="{semester.term} {semester.year}"
			{today}
			fragments={calendar.fragments}
			nextDate={calendar.nextDate}
			{notes}
			onSelectClass={(classId) => {
				selectedClassId = classId;
			}}
			onSaveNote={saveNote}
		/>
		{#if saveError}
			<p data-testid="teacher-calendar.save-error" role="alert" class="mt-2 text-sm text-red-700">
				{saveError}
			</p>
		{/if}
	{/if}
</div>
