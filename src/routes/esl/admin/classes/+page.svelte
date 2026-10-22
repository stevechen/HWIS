<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import {
		ESL_GRADES,
		isLevelledGrade,
		grade10SiblingLevel,
		type EslMeetingInput,
		type EslScheduleProblemDetail,
		type EslUnavailableSlot
	} from '$convex/shared/esl';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import ClassCard from './ClassCard.svelte';

	const client = useConvexClient();

	/** What `archiveYear` / `restoreYear` report back, so the notice can be specific. */
	type ArchiveReport = { year: string; cohorts: number; classes: number };

	/**
	 * Archived cohorts are hidden unless the admin asks for them.
	 *
	 * `undefined` rather than an explicit `'active'` on purpose: the query's own
	 * default is `active`, so sending nothing keeps one definition of "hidden by
	 * default" in the query rather than two that can drift apart.
	 */
	let showArchived = $state(false);

	/**
	 * `as const` on the status, because a bare object literal widens
	 * `{ status: 'archived' }` to `string`, which is not the query's
	 * `'active' | 'archived' | 'all'` union and fails to typecheck.
	 *
	 * The `{}` branch stays empty on purpose: the query's own default is
	 * `active`, so sending nothing keeps one definition of "hidden by default" in
	 * the query rather than two that can drift apart.
	 */
	const cohortsQuery = useQuery(api.esl.cohorts.list, () =>
		showArchived ? { status: 'archived' as const } : {}
	);
	const staffQuery = useQuery(api.esl.staff.listAssignable, () => ({}));

	const cohorts = $derived(cohortsQuery.data ?? []);
	const assignable = $derived(staffQuery.data ?? []);

	/**
	 * The year an archive/restore is waiting on confirmation for, or null when
	 * nothing is pending.
	 *
	 * A confirm step rather than a direct click: archiving hides a whole year of
	 * classes from every list, and doing that with one mis-click on a page of
	 * hundred rows is not a mistake worth risking.
	 */
	let pendingYear = $state<string | null>(null);

	/** What the confirm dialog is about to do, so its wording is not ambiguous. */
	const pendingIsArchive = $derived(pendingYear !== null && !showArchived);

	let yearFilter = $state('');
	let gradeFilter = $state('');

	const visibleCohorts = $derived(
		cohorts.filter(
			(cohort) =>
				(!yearFilter || cohort.year === yearFilter) &&
				(!gradeFilter || cohort.grade === Number(gradeFilter))
		)
	);

	const years = $derived([...new Set(cohorts.map((c) => c.year))].sort().reverse());

	/**
	 * The year the page shows, defaulting to the most recent.
	 *
	 * A single-select rather than "All years", because the schedule query loads one
	 * year at a time: a slot is a claim about *one* year — a Mon P1 in 2024-2025 and
	 * the same in 2026-2027 are different facts, and conflict detection is per year
	 * (ADR-0027). Showing several years side by side would render every calendar
	 * icon outside the selected year inert.
	 *
	 * The year is a page-level heading rather than something repeated per card: the
	 * class names have no year in them, so a card that repeated it would say the same
	 * word a hundred times.
	 */
	const shownYear = $derived(yearFilter || years[0] || '');

	/**
	 * The years this page can archive (or restore), oldest first.
	 *
	 * Taken from the cohorts the list is actually showing, so it follows the
	 * lifecycle filter: showing current classes offers the live years, showing
	 * archived ones offers the retired years. Sorting ascending puts the oldest
	 * first, which is the default — the year most likely to be finished.
	 */
	const archivableYears = $derived([...years].sort());

	/**
	 * Which year the archive control is aimed at.
	 *
	 * Defaults to the oldest, and follows it only while the current choice is still
	 * on offer — so a chosen year sticks, but a year that disappears from the list
	 * (archived, or filtered away) cannot leave the control aimed at nothing.
	 */
	let archiveTargetYear = $state('');
	$effect(() => {
		const oldest = archivableYears[0] ?? '';
		untrack(() => {
			if (!archivableYears.includes(archiveTargetYear)) archiveTargetYear = oldest;
		});
	});

	/**
	 * The year the schedule editor and the room vocabulary apply to.
	 *
	 * The same single year the page shows, so the cards on screen and the meetings
	 * behind them can never disagree about which year they are describing.
	 */
	const scheduleYear = $derived(shownYear);

	/**
	 * The selected year's roster sign-off.
	 *
	 * Archived years bypass the gate: they are read-only history, and requiring a
	 * fresh sign-off to look at them would be busywork. A year that already has
	 * meetings is reported confirmed by the query, so introducing the gate does
	 * not lock a running year out.
	 */
	const readinessQuery = useQuery(api.esl.yearStatus.readiness, () =>
		scheduleYear && !showArchived ? { year: scheduleYear } : 'skip'
	);
	const readiness = $derived(
		readinessQuery.data && Array.isArray(readinessQuery.data.blockers) ? readinessQuery.data : null
	);
	const rosterLocked = $derived(!showArchived && readiness !== null && !readiness.confirmed);
	let gateBusy = $state(false);
	let gateError = $state('');

	async function confirmYearRoster() {
		if (!scheduleYear) return;
		gateBusy = true;
		gateError = '';
		try {
			await client.mutation(api.esl.yearStatus.confirm, { year: scheduleYear });
		} catch (error) {
			gateError = error instanceof Error ? error.message : 'Could not confirm the roster';
		} finally {
			gateBusy = false;
		}
	}

	async function unconfirmYearRoster() {
		if (!scheduleYear) return;
		gateBusy = true;
		gateError = '';
		try {
			await client.mutation(api.esl.yearStatus.unconfirm, { year: scheduleYear });
		} catch (error) {
			gateError = error instanceof Error ? error.message : 'Could not withdraw the sign-off';
		} finally {
			gateBusy = false;
		}
	}

	// `skip` until there is a year to ask about, rather than querying an empty one.
	const scheduleQuery = useQuery(api.esl.classes.listScheduleByYear, () =>
		scheduleYear ? { year: scheduleYear } : 'skip'
	);
	/**
	 * The year's teacher blocks, for the picker's gate and the availability dialog.
	 *
	 * One year-wide read rather than one per card: the rows are sparse (a handful
	 * of teachers blocking a handful of slots), and the picker and the dialog must
	 * judge against the same blocks — a save refused for a block the dialog does
	 * not show is unfixable from the UI.
	 */
	const availabilityQuery = useQuery(api.esl.availability.listByYear, () =>
		scheduleYear ? { year: scheduleYear } : 'skip'
	);
	/** Blocked slots by teacher id, so the picker looks up its own and its pair's. */
	const availabilityByTeacher = $derived.by(() => {
		const byTeacher: Record<string, EslUnavailableSlot[]> = {};
		for (const row of availabilityQuery.data ?? []) {
			const slots = byTeacher[row.teacherId] ?? [];
			slots.push({
				day: row.day,
				period: row.period,
				...(row.note === undefined ? {} : { note: row.note })
			});
			byTeacher[row.teacherId] = slots;
		}
		return byTeacher;
	});
	const scheduleByClassId = $derived(
		new Map((scheduleQuery.data ?? []).map((row) => [row.classId, row]))
	);

	/**
	 * Why the Schedule cell has nothing to show, when it has nothing to show.
	 *
	 * Distinguishing these matters: a query that *errored* leaves `data` undefined
	 * exactly as one that is still loading, and showing "Loading…" for a failed
	 * query would spin forever and read as a bug rather than as a backend problem.
	 * The most common cause of the error branch is a deploy that failed typecheck,
	 * which leaves this function absent from the deployment entirely.
	 */
	const scheduleUnavailable = $derived(
		scheduleQuery.error !== null && scheduleQuery.error !== undefined
	);

	/**
	 * Every class in the year, as conflict neighbours for the schedule editor.
	 *
	 * The whole year rather than the cohort, because a teacher or room clash is
	 * with any class in the department — only the *same-cohort* overlap blocks, and
	 * the mutation is what decides that. The editor needs the rest to avoid
	 * suggesting a slot that is already spoken for.
	 *
	 * Retired classes are filtered out here as well as on the server. The query now
	 * returns them (so their cards render as history), which without this would
	 * make the picker treat a retired year's slots as spoken for — the same rule
	 * being enforced twice, at two different points, with only one of them right.
	 */
	const scheduleNeighbours = $derived(
		(scheduleQuery.data ?? [])
			.filter((row) => !row.archived)
			.map((row) => ({
				classId: row.classId,
				className: row.name,
				cohortId: row.cohortId,
				teacherId: row.teacherId ?? undefined,
				room: row.room ?? undefined,
				meetings: row.meetings
			}))
	);

	// Per-action state, keyed by row id so one failure never blocks the rest.
	let busyId = $state<string | null>(null);
	let rowError = $state('');
	let notice = $state('');

	/**
	 * The visible cohorts, grouped grade → level, in the server's own order.
	 *
	 * Levels are collected by key across the whole band rather than as *consecutive
	 * runs*. Grouping runs looks equivalent while the server's sort holds the
	 * levels adjacent, but it silently depends on that: the moment two cohorts of
	 * one level are separated by another, the run splits and the same level appears
	 * twice — which Svelte rejects as a duplicate keyed-each key, taking the whole
	 * page down. Collecting by key makes the grouping correct whatever order the
	 * rows arrive in, and keeps the server's ordering inside each level.
	 *
	 * Grades are grouped by consecutive run, which is safe: `compareEslCohorts`
	 * sorts by grade first and unambiguously, so a grade's cohorts cannot be
	 * interleaved with another grade's.
	 *
	 * Grade is the only band with a full-width label; level is a small heading
	 * within it. Neither repeats the class number or the year, because both are
	 * already implied by the class names underneath.
	 */
	const gradeGroups = $derived.by(() => {
		const groups: {
			grade: number;
			levels: { level: string; cohorts: typeof visibleCohorts }[];
		}[] = [];

		for (const cohort of visibleCohorts) {
			// Grade 10 is not bucketed by level. Its `A`/`B` are two sections of one
			// Chinese class, not two ability bands, so putting them in separate
			// buckets would undo the server's interleaving and render the grade as
			// H101A, H102A, H101B, H102B — each section a screen away from its own
			// class. A single `''` bucket leaves the grade in the order the rows
			// arrive in, and suppresses the level heading that would misdescribe it.
			const level = isLevelledGrade(cohort.grade) ? (cohort.level ?? '') : '';
			let band = groups[groups.length - 1];
			if (band === undefined || band.grade !== cohort.grade) {
				band = { grade: cohort.grade, levels: [] };
				groups.push(band);
			}
			let section = band.levels.find((candidate) => candidate.level === level);
			if (section === undefined) {
				section = { level, cohorts: [] };
				band.levels.push(section);
			}
			section.cohorts.push(cohort);
		}
		return groups;
	});

	/**
	 * The grade 10 section that shares this cohort's Chinese class, or null.
	 *
	 * `H101A` and `H101B` split one Chinese class and are always timetabled together
	 * (ADR-0023 rule 7), so the schedule picker edits the pair rather than one card:
	 * saving from either card writes both. Keyed by cohort id because that is what the
	 * card is handed.
	 *
	 * Enriched with the partner's saved meetings, room and teacher from the schedule
	 * query: the picker opens on the pair's union and judges the draft clean for
	 * *both* sections, which it cannot do from an id and a name. Missing while the
	 * schedule loads — the picker treats absent meetings as none and an absent
	 * room or teacher as unassigned, which is exactly what an unloaded row means.
	 *
	 * Only grade 10 sections take part. A levelled cohort's level names an ability band
	 * shared by every cohort of that level across the year, so `Basic` is not a partner
	 * to anything — pairing on it would rewrite half the grade.
	 */
	const sectionPartners = $derived.by(() => {
		const partners = new SvelteMap<
			string,
			{
				classId: Id<'esl_classes'>;
				name: string;
				cohortId: string;
				meetings?: EslMeetingInput[];
				room?: string;
				teacherId?: string;
			}
		>();

		/** The partner entry for a class, enriched from its schedule row when loaded. */
		function partnerEntry(
			classId: Id<'esl_classes'>,
			name: string,
			cohortId: string
		): {
			classId: Id<'esl_classes'>;
			name: string;
			cohortId: string;
			meetings?: EslMeetingInput[];
			room?: string;
			teacherId?: string;
		} {
			const row = scheduleByClassId.get(classId);
			return {
				classId,
				name,
				cohortId,
				...(row === undefined ? {} : { meetings: row.meetings }),
				...(row?.room == null ? {} : { room: row.room }),
				...(row?.teacherId == null ? {} : { teacherId: row.teacherId })
			};
		}

		for (const cohort of visibleCohorts) {
			if (isLevelledGrade(cohort.grade)) continue;
			const cls = cohort.classes[0];
			if (!cls) continue;

			const siblingLevel = grade10SiblingLevel(cohort.level);
			if (siblingLevel === null) continue;

			// Written into both directions at once, so the pair is symmetric whichever
			// card the admin opens.
			for (const other of visibleCohorts) {
				if (
					other._id === cohort._id ||
					other.grade !== cohort.grade ||
					other.classNumber !== cohort.classNumber ||
					other.level !== siblingLevel
				)
					continue;
				const otherClass = other.classes[0];
				if (!otherClass) continue;
				partners.set(cohort._id, partnerEntry(otherClass._id, otherClass.name, other._id));
				partners.set(other._id, partnerEntry(cls._id, cls.name, cohort._id));
			}
		}

		return partners;
	});

	/** Every visible class, which is what the header counts now that cards are classes. */
	const visibleClassCount = $derived(
		visibleCohorts.reduce((total, cohort) => total + cohort.classes.length, 0)
	);

	/**
	 * The readable slug for one class, mirroring its cohort's code.
	 *
	 * `26-27_G7-Elementary-1_CLIL`. For reading in devtools, never for tests — the
	 * name and the year both change, so a test keyed on this would break when
	 * someone fixed a typo.
	 */
	function classSlug(year: string, code: string, type: string): string {
		return `${year.slice(2, 4)}-${year.slice(7, 9)}_${code}_${type}`;
	}

	function run(action: () => Promise<unknown>, id: string, message: string) {
		busyId = id;
		rowError = '';
		action()
			.then(() => {
				notice = message;
			})
			.catch((error: unknown) => {
				// Unwrapped: a refused save arrives wearing the transport's
				// `[CONVEX M(…)] … Called by client` packaging, and the notice
				// should read the gate's reason, not the crash report.
				rowError = humanConvexErrorMessage(error);
			})
			.finally(() => {
				busyId = null;
			});
	}

	/**
	 * One same-type class this save would also write, as the preview query
	 * reports it.
	 */
	type MirrorTarget = {
		classId: Id<'esl_classes'>;
		name: string;
		cohortLabel: string | null;
		/** True when the save replaces a week the class already has. */
		willOverwrite: boolean;
		/** Predicted gate failures for this class under the proposed week. */
		problems: EslScheduleProblemDetail[];
	};

	/**
	 * A schedule save waiting on the mirror confirmation, or null when nothing
	 * is pending.
	 */
	let pendingSchedule = $state<{
		classIds: Id<'esl_classes'>[];
		year: string;
		meetings: EslMeetingInput[];
		room?: string;
		mirrors: MirrorTarget[];
	} | null>(null);

	/** True while any mirror's predicted problems would refuse the write. */
	const mirrorsBlocked = $derived(
		(pendingSchedule?.mirrors ?? []).some((mirror) => mirror.problems.length > 0)
	);

	/**
	 * Save a week — after the mirror preview has said what else it would write.
	 *
	 * A grade 7–9 class whose cohort shares its Chinese homeroom composition
	 * with sibling cohorts mirrors its week onto every same-type class there
	 * (ADR-0028). The server owns that decision, so the page asks it first:
	 * `listScheduleMirrors` runs the same resolution and the same gate the
	 * write will. No mirrors — grade 10, a lone band, a divergent roster — and
	 * the save commits directly, exactly as before.
	 *
	 * With mirrors, the save waits behind an explicit confirm listing every
	 * class the write will touch: a cross-class write of seven classes is only
	 * safe when the admin has seen the list (the grade 10 pair announces the
	 * same way). Predicted problems disable the confirm, because the mutation
	 * would refuse them atomically anyway.
	 *
	 * A preview that *fails* is a save that cannot be confirmed honestly, so its
	 * error takes the same path as a refused write and nothing is sent.
	 */
	async function saveSchedule(
		classIds: Id<'esl_classes'>[],
		year: string,
		meetings: EslMeetingInput[],
		room?: string
	) {
		const classId = classIds[0];
		if (classId === undefined) return;

		let mirrors: MirrorTarget[];
		try {
			const result: { targets: MirrorTarget[] } = await client.query(
				api.esl.classes.listScheduleMirrors,
				{
					classId,
					year,
					meetings,
					// Absent means "leave the room as it is", the same rule the
					// mutation applies; unchanged-room saves send nothing.
					...(room === undefined ? {} : { room })
				}
			);
			mirrors = result.targets;
		} catch (error) {
			rowError = humanConvexErrorMessage(error);
			return;
		}

		if (mirrors.length === 0) {
			commitSchedule(classIds, year, meetings, room);
			return;
		}
		pendingSchedule = {
			classIds,
			year,
			meetings,
			...(room === undefined ? {} : { room }),
			mirrors
		};
	}

	/** The pressed confirm: write the week to the whole mirror group. */
	function confirmSchedule() {
		const pending = pendingSchedule;
		pendingSchedule = null;
		if (pending === null) return;
		commitSchedule(pending.classIds, pending.year, pending.meetings, pending.room, pending.mirrors);
	}

	/**
	 * Commit a week to `setSchedule`, one mutation for the whole write.
	 *
	 * One mutation, not one per class — the server resolves the group and writes
	 * it atomically, and a first-succeeds/second-fails pair of calls would leave
	 * a split week the gate then refuses to repair. Only the first id is sent;
	 * mirrors and grade 10 partners are facts about the cohorts.
	 *
	 * `room` rides along when the picker drafted one. Absent means the room was
	 * untouched.
	 */
	function commitSchedule(
		classIds: Id<'esl_classes'>[],
		year: string,
		meetings: EslMeetingInput[],
		room?: string,
		mirrors: MirrorTarget[] = []
	) {
		const classId = classIds[0];
		if (classId === undefined) return;
		run(
			() =>
				client.mutation(
					api.esl.classes.setSchedule,
					room === undefined ? { classId, year, meetings } : { classId, year, meetings, room }
				),
			classId,
			// The notice says what the write covered: both sections of a pair by
			// name, a mirror group by count (the confirm just listed every name).
			mirrors.length > 0
				? `Schedule saved for ${scheduleByClassId.get(classId)?.name ?? 'the class'} + ${mirrors.length} same-type classes`
				: classIds.length > 1
					? `Schedule saved for ${classIds.map((id) => scheduleByClassId.get(id)?.name ?? 'a section').join(' + ')}`
					: 'Schedule saved'
		);
	}

	/**
	 * Assigns (or clears) the class teacher. The select's value is the teacher
	 * id, or `''` for "unassigned", which the mutation models as an absent id.
	 */
	function assignTeacher(classId: Id<'esl_classes'>, teacherId: string) {
		run(
			() =>
				client.mutation(api.esl.classes.assignTeacher, {
					id: classId,
					teacherId: teacherId ? (teacherId as Id<'users'>) : undefined
				}),
			classId,
			teacherId ? 'Class teacher assigned' : 'Class teacher cleared'
		);
	}

	/**
	 * Archive or restore a whole school year.
	 *
	 * A year is the unit that gets retired, not a cohort: last year's cohorts all
	 * end together, and archiving them one at a time is the same decision made a
	 * hundred times. The mutation cascades to that year's classes and reports what
	 * it touched, so the notice can say how much moved.
	 *
	 * Never fires automatically when the last roster lands — it is behind an
	 * explicit confirm, because it is the one action on this page that retires data
	 * an admin may still be looking at.
	 */
	function archiveYear(year: string) {
		run(
			() =>
				client.mutation(api.esl.cohorts.archiveYear, { year }).then((report: ArchiveReport) => {
					notice = `Archived ${year}: ${report.cohorts} cohorts, ${report.classes} classes`;
				}),
			year,
			`Archived ${year}`
		);
	}

	function restoreYear(year: string) {
		run(
			() =>
				client.mutation(api.esl.cohorts.restoreYear, { year }).then((report: ArchiveReport) => {
					notice = `Restored ${year}: ${report.cohorts} cohorts, ${report.classes} classes`;
				}),
			year,
			`Restored ${year}`
		);
	}
</script>

<!--
	No max width: the grid below is the point of the page, and capping it at 72rem
	left most of a wide screen empty. `w-full` alone lets the cards use whatever is
	there.
-->
<div class="w-full space-y-6 p-6">
	<!--
		Title, count, then the import button — one row, in that order.

		The count moved up here from a second "Classes (N)" heading that repeated the
		title directly beneath it. The import button came with it, because the import
		now costs one button rather than a bordered panel, which puts it in the same
		weight class as the rest of the page furniture.
	-->
	<header class="flex flex-wrap items-center gap-3">
		<h1
			data-testid="esl-admin-classes.title"
			class="flex items-baseline gap-2 text-2xl font-bold text-emerald-900"
		>
			Classes
			<span
				data-testid="esl-admin-classes.count"
				class="text-muted-foreground text-base font-normal"
			>
				({visibleClassCount})
			</span>
		</h1>
		<a
			href={`/esl/admin/students?import=1&year=${encodeURIComponent(shownYear)}`}
			class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium shadow-xs transition-colors"
			data-testid="esl-admin-classes.import.link"
		>
			Import a roster
		</a>
		{#if readiness?.confirmedReason === 'signoff'}
			<div class="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
				<span data-testid="esl-admin-classes.roster.confirmed">
					Roster confirmed{readiness.confirmedBy ? ` by ${readiness.confirmedBy}` : ''}
				</span>
				<Button
					variant="ghost"
					size="sm"
					disabled={gateBusy}
					onclick={unconfirmYearRoster}
					testId="esl-admin-classes.roster.unconfirm"
				>
					Withdraw
				</Button>
			</div>
		{/if}
	</header>

	<!--
		The importer lives on Students now: roster setup and the year's sign-off are
		one task, and this page is the one that is gated by it. The link keeps the
		old one-click path to a workbook from here.
	-->

	<!--
		One row, two groups.

		Left is *viewing* the grid — year, grade, lifecycle — and all three only change
		what is already on screen. Right is *changing* it: archive takes a whole school
		year out of every list on the page. Running those side by side with no visible
		separation is what made the bar read as five interchangeable dropdowns, when
		one of them is a destructive action sitting a thumb-width from "Grade".

		The border and the rightward push are what mark the divide. Labels were
		shortened to match: "Grade" says what "Filter by …" already implied, and
		"Lifecycle" was the only label naming a concept rather than the thing being
		chosen — the options inside it read "Current classes" and "Archived years",
		which is what "Show" now leads with.
	-->
	<div class="flex flex-wrap items-end gap-x-3 gap-y-3">
		<section aria-label="Filters" class="flex flex-wrap items-end gap-3">
			<div class="space-y-1">
				<Label for="esl-classes-filter-year">Year</Label>
				<NativeSelect.Root
					id="esl-classes-filter-year"
					data-testid="esl-admin-classes.filter.year"
					value={shownYear}
					onchange={(event) => (yearFilter = event.currentTarget.value)}
				>
					{#each years as year (year)}
						<NativeSelect.Option value={year}>{year}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
			<div class="space-y-1">
				<Label for="esl-classes-filter-grade">Grade</Label>
				<NativeSelect.Root
					id="esl-classes-filter-grade"
					data-testid="esl-admin-classes.filter.grade"
					bind:value={gradeFilter}
				>
					<NativeSelect.Option value="">All grades</NativeSelect.Option>
					{#each ESL_GRADES as grade (grade)}
						<NativeSelect.Option value={String(grade)}>G{grade}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
			<div class="space-y-1">
				<Label for="esl-classes-lifecycle">Show</Label>
				<NativeSelect.Root
					id="esl-classes-lifecycle"
					data-testid="esl-admin-classes.filter.archived"
					value={showArchived ? 'archived' : 'active'}
					onchange={(event) => (showArchived = event.currentTarget.value === 'archived')}
				>
					<NativeSelect.Option value="active">Current classes</NativeSelect.Option>
					<NativeSelect.Option value="archived">Archived years</NativeSelect.Option>
				</NativeSelect.Root>
			</div>
		</section>

		<!--
			The year-level archive, not a per-cohort button. A school year ends as a
			whole — last year's cohorts retire together — and archiving them one at a
			time is the same decision made a hundred times. It stays next to the filters
			because it acts on the year they are showing; it is set apart because it is
			the only control here that writes.

			A dropdown rather than a single button whenever more than one year is on
			offer: with several live years, "Archive 2026-2027" would be a guess about
			which one the admin meant. The default is the *oldest*, because the oldest
			year is the one most likely to have finished.
		-->
		{#if archivableYears.length > 0}
			<section
				aria-label="Archive a school year"
				class="border-border ml-auto flex items-end gap-2 border-l pl-3"
			>
				<div class="space-y-1">
					<Label for="esl-classes-archive-year">
						{showArchived ? 'Restore year' : 'Archive year'}
					</Label>
					<!--
						The dropdown and the button share a line. The year is already named
						in the select beside it, so repeating it on the button said the same
						thing twice; the button now only names the action it takes.

						`aria-label` puts the year back onto the button, because its visible
						text is just "Archive" — without it a screen reader would announce
						the same bare verb as every other button on the page.
					-->
					<div class="flex gap-2">
						{#if archivableYears.length > 1}
							<NativeSelect.Root
								id="esl-classes-archive-year"
								class="flex-1"
								data-testid="esl-admin-classes.archiveYearSelect"
								bind:value={archiveTargetYear}
							>
								{#each archivableYears as year (year)}
									<NativeSelect.Option value={year}>{year}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						{:else}
							<!--
							    With one year there is nothing to pick, but the select is still rendered:
							    it gives the label's `for` a real target, and it keeps the year on screen now
							    that the button no longer names it.
						    -->
							<NativeSelect.Root
								id="esl-classes-archive-year"
								class="flex-1"
								data-testid="esl-admin-classes.archiveYearSelect"
								value={archiveTargetYear}
								disabled
							>
								<NativeSelect.Option value={archiveTargetYear}
									>{archiveTargetYear}</NativeSelect.Option
								>
							</NativeSelect.Root>
						{/if}
						<Button
							variant="outline"
							data-testid="esl-admin-classes.archiveYear"
							aria-label={showArchived
								? `Restore ${archiveTargetYear}`
								: `Archive ${archiveTargetYear}`}
							disabled={busyId === archiveTargetYear}
							onclick={() => (pendingYear = archiveTargetYear)}
						>
							{showArchived ? 'Restore' : 'Archive'}
						</Button>
					</div>
				</div>
			</section>
		{/if}
	</div>

	<!--
		Everything below the filters: the archive confirmation, any notices, and the
		grid. Outside the filters' flex row on purpose — a row of controls has no
		business being the parent of a page of cards.
	-->
	<div class="space-y-4">
		<!--
            The confirm step. Archiving hides a whole year from every list on the
            page, and one mis-click among a hundred rows is not a mistake worth
            risking — so it is a deliberate act, and restorable afterwards.
        -->
		{#if pendingYear !== null}
			<div
				class="rounded border border-amber-300 bg-amber-50 p-4"
				data-testid="esl-admin-classes.archiveConfirm"
			>
				<p class="text-sm text-amber-900">
					{#if pendingIsArchive}
						Archive every class in <strong>{pendingYear}</strong>? They will be hidden from every
						list, and their rosters kept as history. You can restore the year afterwards.
					{:else}
						Restore every archived class in <strong>{pendingYear}</strong>? They will return to the
						current lists.
					{/if}
				</p>
				<div class="mt-3 flex gap-2">
					<Button
						size="sm"
						data-testid="esl-admin-classes.archiveConfirm.yes"
						onclick={() => {
							const year = pendingYear;
							const archiving = pendingIsArchive;
							pendingYear = null;
							if (year === null) return;
							if (archiving) archiveYear(year);
							else restoreYear(year);
						}}
					>
						{pendingIsArchive ? 'Archive year' : 'Restore year'}
					</Button>
					<Button
						variant="outline"
						size="sm"
						data-testid="esl-admin-classes.archiveConfirm.no"
						onclick={() => (pendingYear = null)}
					>
						Cancel
					</Button>
				</div>
			</div>
		{/if}

		<!--
			The mirror confirm: what the save will touch besides this card.

			Saving a grade 7–9 week writes the same slots to every same-type class
			sharing the cohort's Chinese homerooms, so the write waits behind the
			class list. Predicted problems disable the confirm — the mutation would
			refuse them atomically anyway, and saying so before the press reads
			better than an error after it.
		-->
		{#if pendingSchedule !== null}
			<div
				class="rounded border border-amber-300 bg-amber-50 p-4"
				data-testid="esl-admin-classes.mirrorConfirm"
			>
				<p class="text-sm text-amber-900">
					Saving this week also sets the same day and period for
					{pendingSchedule.mirrors.length}
					{pendingSchedule.mirrors.length === 1 ? 'same-type class' : 'same-type classes'}:
				</p>
				<ul class="mt-2 space-y-1">
					{#each pendingSchedule.mirrors as mirror (mirror.classId)}
						<li class="text-sm text-amber-900" data-testid="esl-admin-classes.mirrorConfirm.target">
							<strong>{mirror.name}</strong>
							{#if mirror.willOverwrite}
								<span class="text-xs">— replaces its current week</span>
							{/if}
							{#each mirror.problems as problem, problemIndex (problemIndex)}
								<span
									class="block text-xs text-red-700"
									data-testid="esl-admin-classes.mirrorConfirm.problem"
								>
									{problem.message}
								</span>
							{/each}
						</li>
					{/each}
				</ul>
				{#if mirrorsBlocked}
					<p
						class="mt-2 text-xs font-medium text-red-700"
						data-testid="esl-admin-classes.mirrorConfirm.blocked"
					>
						These have to be fixed first — the write would be refused until every class passes.
					</p>
				{/if}
				<div class="mt-3 flex gap-2">
					<Button
						size="sm"
						data-testid="esl-admin-classes.mirrorConfirm.yes"
						disabled={mirrorsBlocked}
						onclick={confirmSchedule}
					>
						Save all
					</Button>
					<Button
						variant="outline"
						size="sm"
						data-testid="esl-admin-classes.mirrorConfirm.no"
						onclick={() => (pendingSchedule = null)}
					>
						Cancel
					</Button>
				</div>
			</div>
		{/if}

		{#if rowError}
			<p
				data-testid="esl-admin-classes.error"
				class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
			>
				{rowError}
			</p>
		{/if}
		{#if notice}
			<p
				data-testid="esl-admin-classes.notice"
				class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
			>
				{notice}
			</p>
		{/if}

		{#if rosterLocked && readiness}
			<section
				class="rounded-lg border border-amber-300 bg-amber-50 p-6"
				data-testid="esl-admin-classes.rosterGate"
			>
				<h2 class="text-lg font-semibold text-amber-900">
					Roster not confirmed for {scheduleYear}
				</h2>
				<p class="mt-1 text-sm text-amber-900">
					Classes stays locked until an admin confirms the year's roster is complete. Import or
					correct the roster on the Students page, then confirm here.
				</p>

				<div class="mt-4 grid gap-4 md:grid-cols-2">
					<div>
						<h3 class="text-sm font-medium text-red-800">Blockers</h3>
						{#if readiness.blockers.length === 0}
							<p
								class="mt-1 text-sm text-amber-900"
								data-testid="esl-admin-classes.rosterGate.blockers"
							>
								None.
							</p>
						{:else}
							<ul
								class="mt-1 list-disc space-y-1 pl-5 text-sm text-red-800"
								data-testid="esl-admin-classes.rosterGate.blockers"
							>
								{#each readiness.blockers as blocker (blocker.kind)}
									<li>{blocker.message}</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div>
						<h3 class="text-sm font-medium text-amber-900">Warnings</h3>
						{#if readiness.warnings.length === 0}
							<p class="mt-1 text-sm text-amber-900">None.</p>
						{:else}
							<ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
								{#each readiness.warnings as warning (warning.kind)}
									<li>{warning.message}</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>

				<div class="mt-4 flex flex-wrap items-center gap-3">
					<Button
						size="sm"
						disabled={gateBusy || !readiness.canConfirm}
						onclick={confirmYearRoster}
						testId="esl-admin-classes.rosterGate.confirm"
					>
						{gateBusy ? 'Confirming…' : 'The roster is complete'}
					</Button>
					<a
						href={`/esl/admin/students?import=1&year=${encodeURIComponent(scheduleYear)}`}
						class="text-sm font-medium underline"
						data-testid="esl-admin-classes.rosterGate.import"
					>
						Import the roster on Students
					</a>
				</div>

				{#if gateError}
					<p class="mt-3 text-sm text-red-700" data-testid="esl-admin-classes.rosterGate.error">
						{gateError}
					</p>
				{/if}
			</section>
		{:else if cohortsQuery.isLoading}
			<p class="text-muted-foreground py-8 text-center" data-testid="esl-admin-classes.loading">
				Loading classes…
			</p>
		{:else if visibleCohorts.length === 0}
			<p
				class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
				data-testid="esl-admin-classes.empty"
			>
				{showArchived
					? 'No archived classes.'
					: 'No classes yet. Import a grade roster on the Students page to create its classes.'}
			</p>
		{:else}
			<!--
				Grouped by grade, then level, then class number — by **position only**.

				Every heading is gone: the year, the `G7`, the `Basic`. The class names
				already carry grade, level and number (`G7 Elementary 1 CLIL`), so the
				labels were saying the same thing a second time in larger type, and a
				page of them pushed the cards below the fold. What is left is the
				grouping itself — which is what the arrangement was for.

				The two-character grid minimum is what lets a wide screen hold many
				more than four cards per row, since the page no longer caps its width.
			-->
			<div class="space-y-6">
				{#each gradeGroups as band (band.grade)}
					<section class="space-y-4" data-testid="esl-admin-classes.grade.{band.grade}">
						<!--
							`sr-only`, not gone. These headings are how a screen-reader user
							jumps between grades, and an unnamed section is invisible to that
							navigation — removing the visible label without this would leave
							assistive tech with one undifferentiated wall of cards. Nothing is
							drawn on screen.
						-->
						<h3 class="sr-only">G{band.grade}</h3>
						{#each band.levels as section (section.level)}
							<div class="space-y-2">
								{#if section.level !== ''}
									<h4 class="sr-only">{section.level}</h4>
								{/if}
								<div class="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-2">
									{#each section.cohorts as cohort (cohort._id)}
										{#if cohort.classes.length > 1}
											<!--
												A two-class cohort — grades 7 and 8, whose
												`CLIL` and `Comm` draw one roster (ADR-0023) —
												takes two grid columns so the pair stays adjacent
												and cannot be split by an unrelated card. The
												connector line that used to join them is gone.
											-->
											<div
												class="col-span-2 flex items-stretch gap-2"
												data-testid={`esl-admin-classes.pair.${cohort.code}`}
											>
												{#each cohort.classes as cls (cls._id)}
													{@const schedule = scheduleByClassId.get(cls._id)}
													<div class="min-w-0 flex-1">
														<ClassCard
															classRow={cls}
															year={cohort.year}
															slug={classSlug(cohort.year, cohort.code, cls.type)}
															{schedule}
															neighbours={scheduleNeighbours}
															studentCount={cohort.studentCount}
															staff={assignable}
															busy={busyId === cls._id}
															dimmed={cohort.status !== 'active'}
															scheduleErrored={scheduleUnavailable}
															onsave={saveSchedule}
															partner={sectionPartners.get(cohort._id) ?? null}
															{availabilityByTeacher}
															onteacher={assignTeacher}
														/>
													</div>
												{/each}
											</div>
										{:else}
											{#each cohort.classes as cls (cls._id)}
												{@const schedule = scheduleByClassId.get(cls._id)}
												<ClassCard
													classRow={cls}
													year={cohort.year}
													slug={classSlug(cohort.year, cohort.code, cls.type)}
													{schedule}
													neighbours={scheduleNeighbours}
													studentCount={cohort.studentCount}
													staff={assignable}
													busy={busyId === cls._id}
													dimmed={cohort.status !== 'active'}
													scheduleErrored={scheduleUnavailable}
													onsave={saveSchedule}
													partner={sectionPartners.get(cohort._id) ?? null}
													{availabilityByTeacher}
													onteacher={assignTeacher}
												/>
											{/each}
										{/if}
									{/each}
								</div>
							</div>
						{/each}
					</section>
				{/each}
			</div>
		{/if}
	</div>
</div>
