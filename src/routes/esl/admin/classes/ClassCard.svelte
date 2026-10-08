<script lang="ts">
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { MapPin, Users } from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import type {
		EslMeetingInput,
		EslScheduleProblemDetail,
		EslScheduleNeighbour,
		EslScheduleProblem,
		EslUnavailableSlot
	} from '$convex/shared/esl';
	import ScheduleCell from './ScheduleCell.svelte';
	import AvailabilityDialog from './AvailabilityDialog.svelte';

	/**
	 * A class as the cohorts query and the schedule query together describe it.
	 *
	 * `cohortId` was deliberately absent once — nothing read it, and carrying an id
	 * that no code consulted only looked like it were enough. It is back because the
	 * schedule gate needs it: the cohort rules (`cohort-slot`, `cohort-days`,
	 * `cohort-teacher`) are all "this and its sibling", and the sibling is identified
	 * by the cohort. The lesson names still carry only the cohort *code*, which the
	 * slug needs and this cannot derive.
	 */
	type CardClass = {
		_id: Id<'esl_classes'>;
		name: string;
		type: 'CLIL' | 'Comm' | 'G9' | 'H10A' | 'H10B';
		/** Optional on the stored row: an unassigned class has no teacher at all. */
		teacherId?: Id<'users'> | null;
		cohortId: Id<'esl_cohorts'>;
	};

	let {
		classRow,
		year,
		schedule,
		neighbours,
		staff,
		slug,
		studentCount,
		partner,
		availabilityByTeacher = {},
		busy = false,
		dimmed = false,
		scheduleErrored = false,
		onsave,
		onteacher
	}: {
		classRow: CardClass;
		year: string;
		/**
		 * The schedule row for this class, or null/undefined while it has not loaded.
		 *
		 * `Map.get` returns `undefined`, so the prop accepts both absences rather
		 * than the page wrapping every lookup in a `?? null`.
		 */
		schedule:
			| {
					meetings: EslMeetingInput[];
					room: string | null;
					scheduleProblem: EslScheduleProblem | null;
					/** Every rule the department runs: the chips and the card marker. */
					problems: EslScheduleProblemDetail[];
			  }
			| null
			| undefined;
		neighbours: (EslScheduleNeighbour & { cohortId: string })[];
		/**
		 * Active students on the cohort's roster.
		 *
		 * The same figure for every class in a cohort, since a cohort's classes
		 * teach one roster between them (ADR-0023).
		 */
		studentCount: number;
		/**
		 * The grade 10 section this class is timetabled with, if any.
		 *
		 * `H101A` and `H101B` split one Chinese class and always meet at the same
		 * slots (ADR-0023 rule 7), so the schedule picker edits the pair. Carries
		 * the partner's saved meetings, room and teacher so the picker opens on
		 * the pair's union and judges the draft clean for both — rooms and
		 * teachers stay independent, slots do not. Null for every other class,
		 * and for a grade 10 section whose partner does not exist.
		 */
		partner: {
			classId: Id<'esl_classes'>;
			name: string;
			cohortId: string;
			meetings?: EslMeetingInput[];
			room?: string;
			teacherId?: string;
		} | null;
		/**
		 * Blocked slots by teacher id, for the year on screen.
		 *
		 * Passed straight to the schedule picker, which judges the draft against
		 * the same blocks the availability dialog displays. Empty by default —
		 * default-free means no entry reads as free everywhere.
		 */
		availabilityByTeacher?: Record<string, EslUnavailableSlot[]>;
		/** Staff who can be assigned as this class's teacher. */
		staff: { _id: Id<'users'>; name: string }[];
		busy?: boolean;
		/** True for an archived class, so the whole card reads as retired. */
		dimmed?: boolean;
		/**
		 * True when the schedule query itself failed.
		 *
		 * Worth separating from "still loading": a query that *errored* leaves its
		 * data undefined exactly as a loading one does, so a card reading "Loading…"
		 * forever would look like a bug rather than a backend problem. The usual
		 * cause is a deploy that failed typecheck, which leaves the function absent
		 * from the deployment entirely.
		 */
		scheduleErrored?: boolean;
		onsave: (
			classIds: Id<'esl_classes'>[],
			year: string,
			meetings: EslMeetingInput[],
			room?: string
		) => void;
		onteacher: (classId: Id<'esl_classes'>, teacherId: string) => void;
		/**
		 * A readable slug for devtools and for a human scanning the DOM:
		 * `26-27_G7-Elementary-1_CLIL`.
		 *
		 * Passed in rather than derived here because it needs the cohort's code, and the
		 * class row carries only its cohort id. It is deliberately *not* the test id —
		 * the name and the year both change over a class's life, and a test that breaks
		 * when someone fixes a typo is a bad test. The id stays the stable one; this is
		 * for reading only.
		 */
		slug: string;
	} = $props();

	/** The class's saved room, shown as a readout — authored in the picker. */
	const room = $derived(schedule?.room ?? null);

	/** True when the schedule is sound but the room is unset. */
	const roomMissing = $derived(schedule?.scheduleProblem?.state === 'missing-room');

	/**
	 * Grey dashed while the class has no room (or the schedule is sound but
	 * unroomed), emerald once it has one — the same status language the schedule
	 * chips and the teacher select speak.
	 */
	const roomUnassigned = $derived(roomMissing || room === null || room === '');

	/**
	 * True while the class has no teacher, which drives the select's amber state.
	 *
	 * Read from the class row rather than from any schedule verdict: unlike the room,
	 * a teacher is assigned independently of whether the class is timetabled, so an
	 * unscheduled class can still have one. `null` and `undefined` both count —
	 * `assignTeacher` models "cleared" as an absent id (ADR-0023).
	 */
	const teacherUnassigned = $derived(classRow.teacherId == null);

	/**
	 * True while this class carries an unresolved conflict, whatever its cause.
	 *
	 * Reads the gate's full `problems` list rather than the per-slot `conflicts`: the
	 * gate is the superset — it adds the cohort-day, same-teacher and availability
	 * rules — and this marker is about "does this card need attention", not about which
	 * chip to repaint.
	 *
	 * Deliberately survives a picker that refuses to save — a conflicted class can still
	 * arrive here three ways: from data written before a rule existed, from a write
	 * outside the picker (an import, a restore), or from *someone else's* edit. A class
	 * is never re-saved when a neighbour breaks it, so this marker is the only thing
	 * telling the person affected. It is a notification about the state of the year,
	 * not a validation error about this card.
	 */
	const conflicted = $derived((schedule?.problems ?? []).length > 0);

	/** The assigned teacher's id, when there is one to block slots for. */
	const assignedTeacherId = $derived(classRow.teacherId ?? undefined);

	/** The assigned teacher's name, for the availability dialog's labels. */
	const assignedTeacherName = $derived(
		staff.find((member) => member._id === assignedTeacherId)?.name ?? 'Teacher'
	);

	/** The assigned teacher's saved blocks this year — free everywhere when absent. */
	const teacherBlocks = $derived(
		assignedTeacherId === undefined ? [] : (availabilityByTeacher[assignedTeacherId] ?? [])
	);

	/**
	 * Everything the assigned teacher teaches this year, as the dialog's context.
	 *
	 * This card plus every neighbour carrying the same teacher id: a blocked slot
	 * and a timetabled clash refuse a save identically, and only this list tells
	 * the admin which one they are looking at.
	 */
	const teacherClasses = $derived.by(() => {
		if (assignedTeacherId === undefined) return [];
		const classes = neighbours
			.filter((other) => other.teacherId === assignedTeacherId)
			.map((other) => ({ name: other.className, meetings: [...other.meetings] }));
		classes.unshift({ name: classRow.name, meetings: [...(schedule?.meetings ?? [])] });
		return classes;
	});
</script>

<!--
	One class, four lines, nothing else.

	Deliberately identical for every class in every group. A card that rendered a
	Type column would say `G7/8 CLIL` beside a name already ending in `CLIL`, and a
	card that showed a status badge would read `active` forever, because only the
	year is ever archived.
-->
<article
	class="flex flex-col gap-1.5 rounded-md border bg-white p-2"
	class:opacity-60={dimmed}
	data-testid="esl-admin-classes.card.{classRow._id}"
	data-class-slug={slug}
>
	<!--
		The name wraps rather than truncates. `G7 Pre-Elementary 1 CLIL` is the longest
		a name gets and `truncate` was cutting it to `G7 Pre-Elementary 1 Co…` — which
		removes exactly the part that distinguishes the class from its siblings. Two
		lines is the cost, and a wrapped name is still shorter than the alternative of
		not knowing which class is which.
	-->
	<div class="flex items-start justify-between gap-1">
		<h4 class="text-sm font-semibold text-emerald-900">
			{classRow.name}
		</h4>

		<!--
			The card marker. On the header rather than the schedule line because the
			conflict may be about the *teacher* or the *room*, which live further down,
			and a reader scanning for "which cards need attention" should not have to know
			which row carries the fault.

			`role="img"` with an `aria-label` because an exclamation mark alone tells a
			screen-reader user nothing — without the role and the label it is announced as
			punctuation.
		-->
		{#if conflicted}
			<span
				class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-red-100 text-[0.625rem] font-bold text-red-700"
				title="Has an unresolved conflict"
				aria-label="Has an unresolved conflict"
				role="img"
				data-testid="esl-admin-classes.card.conflict"
			>
				!
			</span>
		{/if}
	</div>

	<!--
		Both `null` and `undefined` count as "not loaded": `Map.get` returns
		undefined, and the page passes that straight through rather than wrapping
		every lookup. So the guard is a truthiness check, not `!== null`.
	-->
	{#if schedule}
		<ScheduleCell
			classRecord={{
				classId: classRow._id,
				name: classRow.name,
				type: classRow.type,
				cohortId: classRow.cohortId,
				// The gate's subject: the schedule rules are all relative — to the
				// cohort for the sibling rules, to the teacher and room for the rest —
				// so all three have to reach the picker.
				teacherId: classRow.teacherId ?? undefined,
				room: room ?? undefined,
				meetings: schedule.meetings,
				problems: schedule.problems ?? []
			}}
			{year}
			{neighbours}
			{partner}
			{availabilityByTeacher}
			{busy}
			{onsave}
		/>
	{:else if scheduleErrored}
		<p class="text-xs text-red-700" data-testid="esl-admin-classes.schedule.unavailable">
			Schedule unavailable — the backend rejected this query.
		</p>
	{:else}
		<p class="text-muted-foreground py-1 text-xs">Loading…</p>
	{/if}

	<!--
		Roster size, then the room readout.

		Both classes of a cohort show the same number, because they teach one roster
		(ADR-0023) — so the headcount is a property of the cohort rather than of the
		card. A room holds a certain number of people, and the pairing is what lets an
		admin see at a glance whether a class has outgrown its room.

		Read-only: the room is authored in the schedule picker, where the draft
		slots are visible and the busy marks react to them. Editing it here, beside
		a week it cannot see, is how clashes were discovered only after saving.
	-->
	<div class="flex items-center gap-2">
		<span
			class="text-muted-foreground inline-flex shrink-0 items-center gap-0.5 text-xs"
			title="{studentCount} students"
			data-testid="esl-admin-classes.students"
		>
			<Users class="size-3.5" aria-hidden="true" />
			{studentCount}
		</span>
		<span
			class={[
				'inline-flex min-w-0 flex-1 items-center gap-1 text-xs',
				roomUnassigned ? 'text-muted-foreground' : 'text-emerald-800'
			]}
			title={room ?? 'No room'}
			data-testid="esl-admin-classes.room.readout"
		>
			<MapPin class="size-3.5 shrink-0" aria-hidden="true" />
			{#if roomUnassigned}
				<span class="border-b border-dashed border-current">No room</span>
			{:else}
				<span class="truncate">{room}</span>
			{/if}
		</span>
	</div>

	<!--
		The teacher select, squashed to match the room button above it and stretched
		to the card's full width.

		Every box metric is a Tailwind class. This is safe because `NativeSelect`
		builds its classes through `cn` = `twMerge(clsx(...))`, so a class passed
		here *replaces* the primitive's baked-in one rather than competing with it on
		stylesheet order. An earlier version of this used inline styles to sidestep
		that uncertainty; `twMerge` settles it properly, so the styles belong in the
		class attribute with the rest of the card.

		Logical padding (`ps-`/`pe-`) rather than physical (`pl-`/`pr-`) for exactly
		this reason: the primitive sets `px-3 pe-9`, and `twMerge` only collapses
		classes in the *same* group. `pe-7` supersedes `pe-9`; `pr-7` is a different
		property (`padding-right`) and would instead race it on cascade order.

		`leading-4` pins the line box to 1rem, matching `text-xs`, so the height and
		the line cannot drift apart if the font size changes. `pe-7` leaves room for
		the chevron the primitive draws into that space, so a long teacher name
		cannot run under it.

		Not covered by a component test, deliberately: the browser test environment
		loads no Tailwind, so `text-xs` and `py-2` never apply and any assertion
		about this box would be measuring the UA defaults rather than the real page.

		The `**:data-[slot=…]:w-full` on the wrapper exists because the primitive sets
		`w-fit` on it, which would otherwise shrink the select to its content. It
		compiles to `:is(.cls *)[data-slot=…]` — specificity (0,2,0) — so it beats
		`w-fit` (0,1,0) on specificity rather than on stylesheet order. The equivalent
		arbitrary form `[&_[data-slot=…]]` has the same specificity, so this is the
		canonical spelling rather than a behavioural change.
	-->
	<!--
		The teacher select, with the availability dialog one step beside it.

		Blocking a slot is one step from assigning: the dialog stages the teacher's
		blocked grid with Save/Discard, so a misclick never silently blocks a term.
		No teacher, no dialog — there is nobody to block.
	-->
	<div class="flex items-center gap-1">
		<div class="min-w-0 flex-1 **:data-[slot=native-select-wrapper]:w-full">
			<NativeSelect.Root
				aria-label="Class teacher for {classRow.name}"
				class={[
					'h-7 w-full py-0 ps-2 pe-7 text-xs leading-4',
					// The same status language the schedule chips and the room readout use:
					// emerald once assigned, grey dashed while the select still reads
					// "Unassigned". `border-current` ties the border to that grey so it
					// matches the chips rather than the primitive's `border-input`.
					// `border-dashed` is a style rather than a width, so the box does not
					// resize when a teacher is chosen.
					teacherUnassigned
						? 'text-muted-foreground border-dashed border-current'
						: 'border-emerald-600 bg-emerald-50 text-emerald-800'
				].join(' ')}
				data-testid="esl-admin-classes.teacher.{classRow._id}"
				value={classRow.teacherId ?? ''}
				disabled={busy}
				onchange={(event) => onteacher(classRow._id, event.currentTarget.value)}
			>
				<NativeSelect.Option value="">Unassigned</NativeSelect.Option>
				{#each staff as member (member._id)}
					<NativeSelect.Option value={member._id}>{member.name}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</div>
		{#if assignedTeacherId !== undefined}
			<AvailabilityDialog
				classId={classRow._id}
				teacherName={assignedTeacherName}
				{year}
				blocks={teacherBlocks}
				{teacherClasses}
				{busy}
			/>
		{/if}
	</div>
</article>
