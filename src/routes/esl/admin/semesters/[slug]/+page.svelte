<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import { isProtectedSeedEvent } from '$convex/shared/esl';
	import {
		derivedEndSource,
		parseSemesterSlug,
		semesterStatus,
		type SiblingSemester
	} from '$lib/esl-semesters';
	import {
		buildPreviewWeeks,
		mockOffDays,
		type PreviewExam
	} from '$lib/components/esl/wizard/wizard-dates';
	import SemesterHeader from '$lib/components/esl/SemesterHeader.svelte';
	import HolidayOffDayImport from '$lib/components/esl/HolidayOffDayImport.svelte';
	import EventForm, { type EventFormInput } from '$lib/components/esl/EventForm.svelte';
	import ChecklistPanel, { type ChecklistGroup } from '$lib/components/esl/ChecklistPanel.svelte';
	import CalendarPreview from '$lib/components/esl/wizard/CalendarPreview.svelte';

	const client = useConvexClient();

	const rawId = $derived(page.params.slug ?? '');
	const parsed = $derived(parseSemesterSlug(rawId));

	const semestersQuery = useQuery(api.esl.semesters.list, () => ({}));
	const semesters = $derived(semestersQuery.data ?? []);
	// Friendly slug first (`2026-2027-S1`), raw Convex id as fallback so
	// old bookmarks, e2e links, and wizard handoffs keep working.
	const selected = $derived(
		(parsed !== null
			? semesters.find((semester) => semester.year === parsed.year && semester.term === parsed.term)
			: semesters.find((semester) => semester._id === rawId)) ?? null
	);
	const semesterId = $derived(selected === null ? null : selected._id);

	const eventsQuery = useQuery(api.esl.events.listBySemester, () =>
		semesterId === null ? 'skip' : { semesterId }
	);
	const events = $derived(eventsQuery.data ?? []);

	// Lexical `YYYY-MM-DD` compare, the same rule the backend uses.
	const today = new Date().toISOString().slice(0, 10);

	/**
	 * The #213 advisory checklist: expected off-days, unit/quiz, dues, and
	 * mocks with one-click create. Advisory only — the panel never blocks.
	 */
	const checklistQuery = useQuery(api.esl.checklist.status, () =>
		semesterId === null ? 'skip' : { semesterId, today }
	);

	const status = $derived(
		selected === null ? ('upcoming' as const) : semesterStatus(selected, today)
	);
	const source = $derived(selected === null ? null : derivedEndSource(events, selected.derivedEnd));

	/**
	 * The other term of the same school year, for the advisory S1/S2 cross
	 * check. A warning, never a refusal — S2 is creatable any time and exams
	 * move freely across the boundary.
	 */
	const sibling = $derived.by((): SiblingSemester => {
		if (selected === null) return null;
		const other = semesters.find(
			(semester) => semester.year === selected.year && semester.term !== selected.term
		);
		if (other === undefined) return null;
		return {
			year: other.year,
			term: other.term,
			startDate: other.startDate,
			derivedEnd: other.derivedEnd
		};
	});

	/**
	 * Calendar preview data (ticket #230): build weeks from semester dates,
	 * exams, and mock off-days (real off-days come from HolidayOffDayImport).
	 */
	const previewEndDate = $derived(selected?.derivedEnd ?? today);
	const previewExams = $derived(
		selected === null
			? []
			: (events
					.filter((e) => e.type === 'exam')
					.map((e) => ({
						label: e.title,
						dates: e.endDate !== undefined ? [e.date, e.endDate] : [e.date]
					})) as PreviewExam[])
	);
	const previewOffDays = $derived(
		selected === null
			? []
			: mockOffDays(selected.term as 'S1' | 'S2', selected.year, selected.startDate, previewEndDate)
	);
	const previewWeeks = $derived(
		selected === null
			? []
			: buildPreviewWeeks(selected.startDate, previewEndDate, previewOffDays, previewExams)
	);

	let createBusy = $state(false);
	let createError = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let editBusy = $state(false);
	let editError = $state<string | null>(null);
	let pendingDeleteId = $state<string | null>(null);
	let deleteBusy = $state(false);
	let checklistBusy = $state<ChecklistGroup | null>(null);
	let checklistError = $state<string | null>(null);
	let notice = $state('');

	function createEvent(input: EventFormInput) {
		if (semesterId === null) {
			createError = 'Semester not found — back up to the list and pick another.';
			return;
		}
		createBusy = true;
		createError = null;
		client
			.mutation(api.esl.events.create, { semesterId, ...input })
			.then((created) => {
				// Exam creates fan out to one row per teaching day (#212),
				// so the notice names the row count instead of implying one.
				if (input.type === 'exam') {
					const days = Array.isArray(created) ? created.length : 1;
					notice =
						`Exam saved — ${days} day row${days === 1 ? '' : 's'} sharing one exam group. ` +
						`The semester end follows exam moves silently${selected?.derivedEnd === null ? ', and the finals-TBD banner lifts once exams exist' : ''}.`;
				} else {
					notice = 'Event added.';
				}
			})
			.catch((cause: unknown) => {
				// Collisions refuse here with the date named; the form shows
				// the backend's sentence verbatim.
				createError = humanConvexErrorMessage(cause);
			})
			.finally(() => {
				createBusy = false;
			});
	}

	function saveEvent(eventId: Id<'esl_events'>, input: EventFormInput) {
		editBusy = true;
		editError = null;
		client
			.mutation(api.esl.events.update, {
				eventId,
				type: input.type,
				...(input.type === 'reminder'
					? { reminderKind: input.reminderKind, isBanner: input.isBanner }
					: { clearReminderKind: true }),
				title: input.title,
				target: input.target,
				date: input.date,
				...(input.endDate === undefined ? { clearEndDate: true } : { endDate: input.endDate }),
				// An empty note clears it; bounds outside partials are dropped.
				note: input.note ?? '',
				...(input.type === 'partial'
					? {
							...(input.startPeriod === undefined ? {} : { startPeriod: input.startPeriod }),
							...(input.endPeriod === undefined ? {} : { endPeriod: input.endPeriod }),
							...(input.startPeriod === undefined || input.endPeriod === undefined
								? { clearPeriods: true }
								: {})
						}
					: { clearPeriods: true })
			})
			.then(() => {
				editingId = null;
				notice =
					input.type === 'exam'
						? 'Exam moved — the semester end shifted silently with it.'
						: 'Event saved.';
			})
			.catch((cause: unknown) => {
				editError = humanConvexErrorMessage(cause);
			})
			.finally(() => {
				editBusy = false;
			});
	}

	function deleteEvent(eventId: Id<'esl_events'>) {
		deleteBusy = true;
		client
			.mutation(api.esl.events.remove, { eventId })
			.then(() => {
				pendingDeleteId = null;
				notice = 'Event deleted.';
			})
			.catch((cause: unknown) => {
				pendingDeleteId = null;
				notice = humanConvexErrorMessage(cause);
			})
			.finally(() => {
				deleteBusy = false;
			});
	}

	/**
	 * One-click create for one #213 checklist group. Advisory to the end:
	 * collisions skip with a report in the notice, never a refusal, and the
	 * panel's own error line only shows transport-level failures.
	 */
	function createChecklistDrafts(group: ChecklistGroup) {
		if (semesterId === null) {
			checklistError = 'Semester not found — back up to the list and pick another.';
			return;
		}
		checklistBusy = group;
		checklistError = null;
		client
			.mutation(api.esl.checklist.createMissing, { semesterId, today, group })
			.then((result) => {
				const skipped = result.skipped.length > 0 ? ` Skipped: ${result.skipped.join('; ')}` : '';
				notice =
					result.created.length > 0
						? `Checklist created ${result.created.length} draft row${result.created.length === 1 ? '' : 's'} — fill or delete them below.${skipped}`
						: `Checklist already complete — nothing missing for that group.${skipped}`;
			})
			.catch((cause: unknown) => {
				checklistError = humanConvexErrorMessage(cause);
			})
			.finally(() => {
				checklistBusy = null;
			});
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<a
		href="/esl/admin/semesters"
		data-testid="esl-admin-semester-detail.back"
		class="text-sm font-medium text-emerald-800 hover:underline"
	>
		← All semesters
	</a>

	{#if semestersQuery.isLoading || eventsQuery.isLoading}
		<p
			data-testid="esl-admin-semester-detail.loading"
			class="text-muted-foreground py-8 text-center"
		>
			Loading semester…
		</p>
	{:else if selected === null}
		<p
			data-testid="esl-admin-semester-detail.missing"
			class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
		>
			Semester not found. It may have been removed — back up to the list and pick another.
		</p>
	{:else}
		<SemesterHeader
			year={selected.year}
			term={selected.term}
			startDate={selected.startDate}
			{status}
			derivedEnd={selected.derivedEnd}
			endSourceLabel={source?.label ?? null}
		/>

		{#key selected._id}
			<HolidayOffDayImport
				semesterId={selected._id}
				term={selected.term}
				startDate={selected.startDate}
			/>
		{/key}

		{#if notice}
			<p
				data-testid="esl-admin-semester-detail.notice"
				class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
			>
				{notice}
			</p>
		{/if}

		<ChecklistPanel
			status={checklistQuery.data ?? null}
			loading={checklistQuery.isLoading}
			busyGroup={checklistBusy}
			error={checklistError}
			oncreate={createChecklistDrafts}
		/>

		<!-- Calendar preview (ticket #230): wizard-style semester calendar -->
		{#if selected}
			<section class="space-y-3">
				<h2 class="text-base font-semibold text-emerald-900">Semester calendar</h2>
				<CalendarPreview
					weeks={previewWeeks}
					interactive={false}
					testId="esl-admin-semester-detail.calendar"
				/>
			</section>
		{/if}

		<section class="space-y-3">
			<h2 class="text-base font-semibold text-emerald-900">Events ({events.length})</h2>
			{#if events.length === 0}
				<p
					data-testid="esl-admin-semester-detail.no-events"
					class="text-muted-foreground rounded-lg border border-dashed bg-white py-8 text-center text-sm"
				>
					No events yet — add the first row below.
				</p>
			{:else}
				<ul data-testid="esl-admin-semester-detail.events" class="space-y-2">
					{#each events as event (event._id)}
						<li class="rounded-lg border bg-white p-3 shadow-sm">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-semibold">
									{event.date}{event.endDate === undefined ? '' : ` → ${event.endDate}`}
								</span>
								<span
									class="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
								>
									{event.type}
								</span>
								{#if event.target !== 'all'}
									<span
										class="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900"
									>
										{event.target}
									</span>
								{/if}
								<span class="text-sm">{event.title}</span>
								{#if event.startPeriod !== undefined || event.endPeriod !== undefined}
									<span class="text-xs text-gray-500">
										P{event.startPeriod ?? '…'}–P{event.endPeriod ?? '…'}
									</span>
								{/if}
								{#if event.unverified === true}
									<span
										class="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
									>
										unverified
									</span>
								{/if}
								{#if isProtectedSeedEvent(event)}
									<span
										class="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900"
										title="Exams and the ceremony anchor the semester — move them, never delete them."
									>
										Protected
									</span>
								{/if}
								<span class="ml-auto flex gap-2">
									{#if !isProtectedSeedEvent(event)}
										{#if pendingDeleteId === event._id}
											<Button
												size="sm"
												variant="destructive"
												disabled={deleteBusy}
												onclick={() => deleteEvent(event._id)}
											>
												Yes, delete
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={deleteBusy}
												onclick={() => (pendingDeleteId = null)}
											>
												Keep
											</Button>
										{:else}
											<Button
												size="sm"
												variant="outline"
												aria-label={`Edit ${event.title}`}
												disabled={editBusy}
												onclick={() => {
													editingId = event._id;
													editError = null;
												}}
											>
												Edit
											</Button>
											<Button
												size="sm"
												variant="outline"
												aria-label={`Delete ${event.title}`}
												disabled={deleteBusy}
												onclick={() => (pendingDeleteId = event._id)}
											>
												Delete
											</Button>
										{/if}
									{:else}
										<Button
											size="sm"
											variant="outline"
											aria-label={`Edit ${event.title}`}
											disabled={editBusy}
											onclick={() => {
												editingId = event._id;
												editError = null;
											}}
										>
											Edit
										</Button>
									{/if}
								</span>
							</div>
							{#if event.note}
								<p class="mt-1 text-sm text-gray-600">{event.note}</p>
							{/if}
							{#if editingId === event._id}
								<div class="mt-3">
									{#key event._id}
										<EventForm
											mode="edit"
											term={selected.term}
											{sibling}
											busy={editBusy}
											serverError={editError}
											initial={{
												type: event.type,
												reminderKind: event.reminderKind,
												isBanner: event.isBanner,
												title: event.title,
												target: event.target,
												date: event.date,
												endDate: event.endDate,
												note: event.note,
												startPeriod: event.startPeriod,
												endPeriod: event.endPeriod
											}}
											onsubmit={(input) => saveEvent(event._id, input)}
											oncancel={() => {
												editingId = null;
												editError = null;
											}}
										/>
									{/key}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="space-y-3">
			<h2 class="text-base font-semibold text-emerald-900">Add an event</h2>
			<EventForm
				mode="create"
				term={selected.term}
				{sibling}
				busy={createBusy}
				serverError={createError}
				onsubmit={createEvent}
			/>
		</section>
	{/if}
</div>
