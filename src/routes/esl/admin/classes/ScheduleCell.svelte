<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { SvelteSet } from 'svelte/reactivity';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import {
		ESL_DAYS,
		ESL_DAY_LABELS,
		ESL_PERIODS,
		ESL_ROOM_SUGGESTIONS,
		assertValidMeetings,
		describeMeetingShapeError,
		eslMeetingLabel,
		eslMeetingsPerWeek,
		findScheduleProblems,
		type EslDay,
		type EslScheduleProblemDetail,
		type EslMeetingInput,
		type EslScheduleNeighbour,
		type EslUnavailableSlot
	} from '$convex/shared/esl';
	import AnchoredPanel from './AnchoredPanel.svelte';

	/** The class being edited, as the year's schedule query returned it. */
	type ScheduleClass = {
		classId: Id<'esl_classes'>;
		name: string;
		type: 'CLIL' | 'Comm' | 'G9' | 'H10A' | 'H10B';
		/** Identifies the cohort's sibling class, which every cohort rule compares against. */
		cohortId: string;
		/** Absent when the class has no teacher, which is not itself a conflict. */
		teacherId?: string;
		/** Absent when the class has no room yet. */
		room?: string;
		meetings: EslMeetingInput[];
		/**
		 * Every rule the department runs against this class's *saved* week.
		 *
		 * The same list the summary badge and the card marker read, so all three agree
		 * by construction. They used to come from two overlapping rule passes, which is
		 * how a chip could stay green while the marker said the class was conflicted.
		 *
		 * Optional only so a payload written before the gate existed still renders; the
		 * read has returned it throughout.
		 */
		problems?: EslScheduleProblemDetail[];
	};

	/**
	 * How one chip reads on the card.
	 *
	 * `valid` and `conflict` carry a glyph as well as a colour, because red/green
	 * alone is invisible to a red-green colourblind admin and to a greyscale
	 * printout. `empty` is dashed rather than filled, which separates "not done
	 * yet" from "done and wrong" without a third hue — red for both would make a
	 * freshly imported year read as a wall of errors when it is merely a wall of
	 * blanks.
	 */
	type Chip = {
		key: string;
		label: string;
		state: ChipState;
		title: string;
	};

	/** The three ways a chip can read. */
	type ChipState = 'valid' | 'conflict' | 'empty';

	/**
	 * The box every chip shares, whatever its state.
	 *
	 * One string rather than part of the per-state map below, because nothing about
	 * the shape varies: only the colour, and whether the `?` needs centring.
	 *
	 * Natural width, never wrapping and never clipping: three short labels always
	 * fit one strip at any card width, so there is nothing to truncate and no
	 * second line to spill onto. The tooltip keeps the full label regardless.
	 */
	const CHIP_BASE_CLASS =
		'inline-flex shrink-0 items-center gap-1 rounded px-2 py-1.5 text-[0.6875rem] leading-none';

	/**
	 * How each state looks, keyed by state so the markup reads `chip.state` rather
	 * than a stack of conditions.
	 *
	 * `Record<ChipState, string>` rather than a plain object literal on purpose: the
	 * annotation makes the map *exhaustive*, so adding a fourth state to `ChipState`
	 * fails the typecheck here rather than silently rendering that chip with no
	 * styling at all.
	 *
	 * Empty is dashed and centred. Dashed separates "not done yet" from "done and
	 * wrong" without a third hue — a filled red would make a freshly imported year
	 * read as a wall of errors when it is merely a wall of blanks. Centred because a
	 * lone `?` in a box as wide as `✓ Mo P1` sits hard left otherwise, and the
	 * filled chips already read well without it.
	 */
	const CHIP_STATE_CLASSES: Record<ChipState, string> = {
		valid: 'border border-emerald-600 bg-emerald-50 text-emerald-800',
		conflict: 'bg-red-100 text-red-900',
		empty: 'border border-current border-dashed text-muted-foreground justify-center'
	};

	let {
		classRecord,
		year,
		neighbours,
		partner = null,
		availabilityByTeacher = {},
		busy = false,
		onsave
	}: {
		classRecord: ScheduleClass;
		/** The year the slot belongs to, which is not necessarily the list's filter. */
		year: string;
		/** Every other class in the year, so a suggestion can avoid what is taken. */
		neighbours: (EslScheduleNeighbour & { cohortId: string })[];
		/**
		 * The grade 10 section this class is timetabled with, if any.
		 *
		 * `H101A` and `H101B` split one Chinese class and always meet at the same
		 * slots (ADR-0023 rule 7), so the picker edits and saves both. Carries the
		 * partner's saved meetings, room and teacher so the draft opens on the
		 * pair's union and the gate judges both sections — rooms and teachers stay
		 * independent, but slots do not. Optional so a single-class card reads as
		 * `null` without the caller saying so.
		 */
		partner?: {
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
		 * The page reads one year of `availability.listByYear` and hands the picker
		 * the lookup, so the gate judges the same blocks the availability dialog
		 * displays. Absent (or missing an id) means free everywhere — the
		 * default-free rule, not a loading hole.
		 */
		availabilityByTeacher?: Record<string, EslUnavailableSlot[]>;
		/** True while a write for this class is in flight, so its inputs can lock. */
		busy?: boolean;
		onsave: (
			classIds: Id<'esl_classes'>[],
			year: string,
			meetings: EslMeetingInput[],
			room?: string
		) => void;
	} = $props();

	let expanded = $state(false);
	let draft = $state<EslMeetingInput[]>([]);
	/**
	 * The room as drafted, `''` for no room.
	 *
	 * Seeded from the saved room on open and saved with the week: one Save writes
	 * both or neither, so a schedule can never land in a room the gate refused.
	 * Compared against the saved room on save — unchanged drafts send nothing, so
	 * a slots-only edit does not rewrite the room.
	 */
	let draftRoom = $state('');
	/** The Other field's text, committed into the draft on blur or Enter. */
	let customRoom = $state('');
	/** True once Other is chosen, revealing the text field. */
	let typingCustom = $state(false);
	let error = $state('');
	let triggerEl = $state<HTMLButtonElement | null>(null);

	/**
	 * Room suggestions for the cohort, read only while the picker is open.
	 *
	 * Department rooms come from the static list so they render instantly; the
	 * derived homerooms arrive with the query and slot in underneath. Scoped to
	 * the open picker rather than per card, so a page of a hundred cards holds
	 * no hundred subscriptions.
	 */
	const suggestionsQuery = useQuery(api.esl.classes.listRoomSuggestions, () =>
		expanded ? { cohortId: classRecord.cohortId as Id<'esl_cohorts'> } : 'skip'
	);
	const homerooms = $derived(suggestionsQuery.data?.homerooms ?? []);

	/**
	 * Seed the editor from what is saved.
	 *
	 * Called when the editor opens rather than from an `$effect`: an effect that
	 * reads the class and writes the draft re-runs on every Convex push of the
	 * year's schedule — including one caused by a *different* class — which would
	 * replace the admin's in-progress choices. Seeding on open gives the same
	 * "the editor starts from what is saved" behaviour with no such coupling, and
	 * a save always comes from an explicit click.
	 *
	 * A pair opens on the *union* of both sections' saved weeks: the two can only
	 * differ from data written before the atomic pair path (or outside it), and
	 * the way back to one identical set has to start from seeing both.
	 */
	function open() {
		const partnerMeetings = partner?.meetings ?? [];
		const union = [...classRecord.meetings.map((m) => ({ day: m.day, period: m.period }))];
		const keys = new SvelteSet(union.map((m) => `${m.day} ${m.period}`));
		for (const m of partnerMeetings) {
			if (!keys.has(`${m.day} ${m.period}`)) {
				keys.add(`${m.day} ${m.period}`);
				union.push({ day: m.day, period: m.period });
			}
		}
		draft = union;
		const savedRoom = classRecord.room ?? '';
		draftRoom = savedRoom;
		customRoom = isListedRoom(savedRoom) ? '' : savedRoom;
		typingCustom = savedRoom !== '' && !isListedRoom(savedRoom);
		error = '';
		expanded = true;
	}

	/**
	 * The first afternoon period.
	 *
	 * P1–P4 run before the lunch break and P5–P8 after it, so P5 is where the morning
	 * ends. Named rather than written inline because the picker, and any future
	 * teacher-facing view, has to agree on where that break falls.
	 */
	const AFTERNOON_FIRST_PERIOD = 5;

	/**
	 * The CSS anchor name for this card's schedule trigger.
	 *
	 * Anchor positioning addresses an element by *name*, not by reference, so the
	 * name has to be unique per class — otherwise opening one class's picker would
	 * drag another's along with it. The class id makes it unique by construction.
	 *
	 * The leading `--` is not decoration: a `<dashed-ident>` — the value type
	 * `anchor-name` and `position-anchor` both take — must begin with two dashes.
	 * Without them the declaration is invalid and silently computes to `none`,
	 * leaving the panel with no anchor at all and no error to explain why.
	 *
	 * Derived rather than a plain `const` because `classRecord` is reactive: a plain
	 * const would freeze the first class this cell ever saw.
	 */
	const anchorName = $derived(`--esl-schedule-${classRecord.classId}`);

	/** How many periods a week this class type must meet. */
	const required = $derived(eslMeetingsPerWeek(classRecord.type));

	/**
	 * The saved meetings in week order.
	 *
	 * Sorted rather than rendered in database order, because a card whose chips
	 * jump around between renders reads as random. Day order first, then period.
	 */
	const sortedMeetings = $derived(
		[...classRecord.meetings].sort(
			(a, b) => ESL_DAYS.indexOf(a.day) - ESL_DAYS.indexOf(b.day) || a.period - b.period
		)
	);

	/**
	 * The problem on one meeting, if any.
	 *
	 * Keyed by `(day, period)` rather than taken from the first problem, because a
	 * class can be double-booked in more than one slot and every one of those chips
	 * has to turn red. Reading a single problem turned only one chip per class, so
	 * a class clashing in two places looked half right.
	 *
	 * Problems with no slot — `cohort-teacher`, which is about the pair rather than
	 * a meeting — deliberately match nothing. There is no one chip to redden for a
	 * fault with no meeting of its own; the card marker is where that shows.
	 *
	 * The first match wins so the tooltip names one concrete reason: two classes
	 * sharing a room *and* a teacher is one problem to read, not two.
	 */
	function problemFor(meeting: EslMeetingInput): EslScheduleProblemDetail | null {
		return (
			(classRecord.problems ?? []).find(
				(candidate) => candidate.day === meeting.day && candidate.period === meeting.period
			) ?? null
		);
	}

	/**
	 * One chip per required meeting, in week order.
	 *
	 * The count is the class type's *requirement*, not what happens to be saved, so
	 * an unscheduled class shows three empty placeholders rather than nothing. That
	 * is the point: the card shows the work outstanding, and the placeholders are
	 * what the admin clicks to start it.
	 */
	const chips = $derived.by<Chip[]>(() => {
		const out: Chip[] = sortedMeetings.map((meeting) => {
			const label = eslMeetingLabel(meeting);
			const clash = problemFor(meeting);
			return {
				key: `${meeting.day}-${meeting.period}`,
				label,
				state: clash !== null ? 'conflict' : 'valid',
				// The gate's own sentence, which names the other class and why. The
				// badge text it replaced read "shares its room" without saying whose.
				title: clash !== null ? `${eslMeetingLabel(meeting)} — ${clash.message}` : label
			};
		});
		for (let index = out.length; index < required; index += 1) {
			out.push({ key: `empty-${index}`, label: '?', state: 'empty', title: 'Not yet assigned' });
		}
		return out;
	});

	/** This class's teacher's blocked slots, or free everywhere when unassigned. */
	function unavailableFor(teacherId: string | undefined): EslUnavailableSlot[] {
		if (teacherId === undefined || teacherId === '') return [];
		return availabilityByTeacher[teacherId] ?? [];
	}

	/**
	 * Whether the assigned teacher is marked NA at `(day, period)`.
	 *
	 * Read straight from the availability lookup — the same rows the gate judges —
	 * so the label and the refusal always agree. Only NA blocks read `NA`: a slot
	 * blocked for another reason (room taken, teacher with another class) keeps
	 * its current blank cell, and the tooltip still carries the full reason.
	 */
	function availabilityBlocked(day: EslDay, period: number): boolean {
		const teacherIds = [classRecord.teacherId, partner?.teacherId].filter(
			(id): id is string => id !== undefined && id !== ''
		);
		return teacherIds.some((teacherId) =>
			(availabilityByTeacher[teacherId] ?? []).some(
				(slot) => slot.day === day && slot.period === period
			)
		);
	}

	/**
	 * Run the department's rules against a *proposed* week and room.
	 *
	 * The same function `setSchedule` calls, so the picker cannot offer a slot the
	 * server will refuse — which is the whole point of computing it here rather than
	 * letting the admin find out by pressing Save.
	 *
	 * For a pair this mirrors the server's `writeGrade10Pair`: the pair's own
	 * room/teacher rules first (against the *draft* room, which is what this
	 * section will hold), then each section gated against the rest of the year
	 * with its own room, teacher and blocks. The draft is one set by construction,
	 * so "clean for both" is what enables Save.
	 */
	function problemsFor(
		meetings: readonly EslMeetingInput[],
		room: string | undefined
	): EslScheduleProblemDetail[] {
		const rest = neighbours.filter(
			(other) => other.classId !== classRecord.classId && other.classId !== partner?.classId
		);
		if (partner === null) {
			return findScheduleProblems(
				{
					type: classRecord.type,
					cohortId: classRecord.cohortId,
					teacherId: classRecord.teacherId,
					room,
					meetings
				},
				rest,
				unavailableFor(classRecord.teacherId)
			);
		}
		const problems: EslScheduleProblemDetail[] = [];
		const partnerMeetings = partner.meetings ?? [];
		const asNeighbour: EslScheduleNeighbour & { cohortId: string } = {
			classId: partner.classId,
			className: partner.name,
			cohortId: partner.cohortId,
			teacherId: partner.teacherId,
			room: partner.room,
			meetings: partnerMeetings
		};
		if (room !== undefined && room !== '' && room === partner.room) {
			problems.push({
				kind: 'room',
				message: `${classRecord.name} and ${partner.name} both meet in ${room}; the two sections need different rooms.`,
				otherName: partner.name,
				other: asNeighbour
			});
		}
		if (
			classRecord.teacherId !== undefined &&
			classRecord.teacherId !== '' &&
			classRecord.teacherId === partner.teacherId
		) {
			problems.push({
				kind: 'cohort-teacher',
				message: `${classRecord.name} and ${partner.name} have the same teacher; the two sections need different ones.`,
				otherName: partner.name,
				other: asNeighbour
			});
		}
		for (const section of [
			{
				name: classRecord.name,
				type: classRecord.type,
				cohortId: classRecord.cohortId,
				teacherId: classRecord.teacherId,
				room
			},
			{
				name: partner.name,
				type: classRecord.type,
				cohortId: partner.cohortId,
				teacherId: partner.teacherId,
				room: partner.room
			}
		]) {
			problems.push(
				...findScheduleProblems(
					{ ...section, meetings },
					rest,
					unavailableFor(section.teacherId)
				).map((problem) => ({
					...problem,
					message: `${section.name}: ${problem.message}`
				}))
			);
		}
		return problems;
	}

	/**
	 * What the current draft would be refused for.
	 *
	 * Every problem, not the first: the reasons are listed above a disabled Save, and
	 * making the admin fix them one save at a time is the behaviour this exists to
	 * remove.
	 */
	const draftProblems = $derived(problemsFor(draft, draftRoom === '' ? undefined : draftRoom));

	/**
	 * Whether picking `(day, period)` would break a rule *at that slot*.
	 *
	 * Scoped to the clicked slot on purpose. A whole-week check would mark every one
	 * of the 40 cells blocked the moment the draft had a clash anywhere — the admin
	 * would see an entirely red grid and no indication of which cell to move.
	 *
	 * The candidate week is "this day moved here", matching `toggle`, so the answer is
	 * the reason Save would refuse *this* pick.
	 */
	function cellBlocked(day: EslDay, period: number): boolean {
		return cellReasons(day, period).length > 0;
	}

	/**
	 * The reasons a given cell would be refused, for its tooltip.
	 *
	 * Empty when the clash is elsewhere in the week and this pick neither causes nor
	 * cures it — the reasons panel above Save already names that one.
	 */
	function cellReasons(day: EslDay, period: number): string[] {
		const candidate = [...draft.filter((m) => m.day !== day), { day, period }];
		return problemsFor(candidate, draftRoom === '' ? undefined : draftRoom)
			.filter((problem) => problem.day === day && problem.period === period)
			.map((problem) => problem.message);
	}

	/**
	 * A week that breaks no rule, or an empty week when none exists.
	 *
	 * Greedy over days and periods, accepting a candidate only when the gate is silent —
	 * so the suggestion respects *every* rule, not merely "the slot is empty" as the
	 * original did. A slot can be free of other classes and still be unusable because
	 * the room is taken, the teacher is busy, or the cohort's sibling already meets
	 * that day.
	 *
	 * The week's own partial picks are preserved: the admin's earlier choices are
	 * kept where a rule allows, and only the impossible ones are moved. Otherwise
	 * "find free slots" would silently discard work.
	 */
	function solve(): EslMeetingInput[] {
		const room = draftRoom === '' ? undefined : draftRoom;
		const chosen: EslMeetingInput[] = [];
		for (const meeting of draft) {
			if (problemsFor([...chosen, meeting], room).length === 0) chosen.push(meeting);
		}
		for (const day of ESL_DAYS) {
			if (chosen.length === required) break;
			if (chosen.some((m) => m.day === day)) continue;
			for (const slot of ESL_PERIODS) {
				const candidate = { day, period: slot.period };
				if (problemsFor([...chosen, candidate], room).length > 0) continue;
				chosen.push(candidate);
				break;
			}
		}
		return chosen.length === required ? chosen : [];
	}

	/**
	 * Pick a slot, or move the day's lesson to it.
	 *
	 * A day carries at most one ESL period (`assertValidMeetings` rejects two), so a
	 * second pick on a day that already has one can only mean "move it" — the previous
	 * behaviour stacked the two and then failed the save with a shape error the admin
	 * had to decode, having clicked exactly what they meant.
	 *
	 * Clicking the picked slot itself still clears it, so one cell is both "set" and
	 * "unset" and there is no separate erase affordance to discover.
	 */
	function toggle(meeting: EslMeetingInput) {
		error = '';
		const alreadyPicked = draft.some((m) => m.day === meeting.day && m.period === meeting.period);
		draft = draft.filter((m) => m.day !== meeting.day).concat(alreadyPicked ? [] : [meeting]);
	}

	/**
	 * Whether a room name is one of the button-grid answers.
	 *
	 * The department rooms are static, so they are known before the homeroom query
	 * lands; the homerooms join once loaded. Anything else is an Other room, which
	 * is what decides whether the text field opens on its own.
	 */
	function isListedRoom(value: string): boolean {
		if (value === '') return true;
		if ((ESL_ROOM_SUGGESTIONS as readonly string[]).includes(value)) return true;
		return homerooms.includes(value);
	}

	/**
	 * Choose a room button: single-select, saved with the week.
	 *
	 * Choosing the picked room again clears it — the same toggle-off the slot
	 * cells use, so there is no separate clear control to discover.
	 */
	function pickRoom(value: string) {
		error = '';
		draftRoom = draftRoom === value ? '' : value;
		typingCustom = false;
	}

	/** Reveal the Other field, seeded from the draft when it is itself custom. */
	function pickOther() {
		error = '';
		customRoom = isListedRoom(draftRoom) ? '' : draftRoom;
		typingCustom = true;
	}

	/** Commit the typed room into the draft. Empty means no room. */
	function commitCustom() {
		draftRoom = customRoom.trim();
		typingCustom = false;
	}

	/**
	 * The room buttons in grid order: department rooms, then homerooms, then the
	 * Other escape hatch. Choosing the picked room again clears it.
	 *
	 * Homerooms sort ascending on the server, so they arrive ordered. Deduplicated
	 * against the department list defensively — a department room that is also a
	 * homeroom code would otherwise render twice with the same value.
	 */
	const roomOptions = $derived.by(() => {
		const seen = new SvelteSet<string>();
		const options: { value: string; kind: 'department' | 'homeroom' }[] = [];
		for (const name of ESL_ROOM_SUGGESTIONS) {
			seen.add(name);
			options.push({ value: name, kind: 'department' });
		}
		for (const name of homerooms) {
			if (seen.has(name)) continue;
			seen.add(name);
			options.push({ value: name, kind: 'homeroom' });
		}
		return options;
	});

	/**
	 * What holds a room at the drafted slots — the busy mark's detail.
	 *
	 * Computed against the *live draft*, not the saved week: each candidate room
	 * is judged with the slots as currently picked, so the clash appears before
	 * saving rather than after. The first holder wins — one room, one sentence —
	 * matching how the chips name one reason per clash.
	 */
	function roomBusy(room: string): { holder: string; slot: string } | null {
		const clashes = problemsFor(draft, room === '' ? undefined : room).filter(
			(problem) => problem.kind === 'room'
		);
		const first = clashes.find(
			(problem) => problem.day !== undefined && problem.period !== undefined
		);
		if (first?.otherName === undefined || first.day === undefined || first.period === undefined) {
			return null;
		}
		// The draft's own room is judged too, so a clash the draft itself causes
		// reads on its own button rather than only in the reasons panel.
		return {
			holder: first.otherName,
			slot: eslMeetingLabel({ day: first.day, period: first.period })
		};
	}

	/**
	 * Slots the pair disagrees on, for the divergence flags.
	 *
	 * The union opened the draft, so a slot in exactly one section's saved week is
	 * a realignment still to make: flagged on its cell and named in the impact
	 * line, because saving aligns the pair and that side effect should be visible
	 * before the press, not discovered after.
	 */
	const divergentSlots = $derived.by(() => {
		if (partner === null) return new SvelteSet<string>();
		const own = new SvelteSet(classRecord.meetings.map((m) => `${m.day} ${m.period}`));
		const other = new SvelteSet((partner.meetings ?? []).map((m) => `${m.day} ${m.period}`));
		const out = new SvelteSet<string>();
		for (const key of own) if (!other.has(key)) out.add(key);
		for (const key of other) if (!own.has(key)) out.add(key);
		return out;
	});

	/** Which section a divergent slot belongs to, for the flag's wording. */
	function divergentOwner(day: EslDay, period: number): string | null {
		const key = `${day} ${period}`;
		if (!divergentSlots.has(key) || partner === null) return null;
		const onOwn = classRecord.meetings.some((m) => m.day === day && m.period === period);
		return onOwn ? classRecord.name : partner.name;
	}

	/**
	 * One gate problem as the impact line's single entry.
	 *
	 * Slot, class, and the room the clash is in: `Mo P1 - G7 Basic 1 CLIL @ESL
	 * A`. The room is the actionable half — it says where the other class sits,
	 * which is what the coordinator negotiates. A block with no other class
	 * reads `Mo P1 - unavailable`; its note stays in the cell tooltip, which is
	 * where the one-line entry cannot fit it.
	 */
	function shortProblem(problem: EslScheduleProblemDetail): string {
		const slot =
			problem.day !== undefined && problem.period !== undefined
				? `${eslMeetingLabel({ day: problem.day, period: problem.period })} - `
				: '';
		if (problem.kind === 'teacher-availability') return `${slot}unavailable`;
		const where = problem.other?.room ? ` @${problem.other.room}` : '';
		return `${slot}${problem.otherName ?? 'Teacher'}${where}`;
	}

	/**
	 * The persistent impact line: what the current draft would disturb.
	 *
	 * Always on screen while the picker is open, so the consequences stay visible
	 * rather than hidden in hovers — the cell tooltips stay as the detail. One
	 * entry per problem plus one per unaligned pair slot, each naming the slot
	 * and who is affected.
	 */
	const impactEntries = $derived.by(() => {
		const entries: string[] = [];
		for (const problem of draftProblems) {
			entries.push(shortProblem(problem));
		}
		if (partner !== null) {
			const drafted = new SvelteSet(draft.map((m) => `${m.day} ${m.period}`));
			for (const meeting of draft) {
				const owner = divergentOwner(meeting.day, meeting.period);
				if (owner !== null) {
					entries.push(`${eslMeetingLabel(meeting)} — only on ${owner}; saving aligns the pair.`);
				}
			}
			// Partner slots the draft drops: saving one set writes it to both
			// sections, so a slot the partner holds alone is removed, not kept.
			// Own dropped slots are ordinary editing — every save rewrites the
			// week — and naming them would bury the cross-class side effect.
			for (const meeting of partner.meetings ?? []) {
				if (!drafted.has(`${meeting.day} ${meeting.period}`)) {
					entries.push(`${eslMeetingLabel(meeting)} — only on ${partner.name}; saving removes it.`);
				}
			}
		}
		return entries;
	});

	function save() {
		error = '';
		const shape = assertValidMeetings(classRecord.type, draft);
		if (shape !== null) {
			error = describeMeetingShapeError(classRecord.type, shape);
			return;
		}
		// Both sections of a grade 10 pair, in one call. The slots are identical by
		// rule (ADR-0023 rule 7), so writing one meeting list to both ids is the whole
		// rule — there is no second schedule to reconcile afterwards.
		const classIds =
			partner === null ? [classRecord.classId] : [classRecord.classId, partner.classId];
		// The room rides along only when it changed: absent means "leave it", so a
		// slots-only edit does not rewrite the room — and an unchanged room never
		// re-triggers the room rule.
		const savedRoom = classRecord.room ?? '';
		const room = draftRoom === savedRoom ? undefined : draftRoom;
		onsave(classIds, year, draft, room);
		expanded = false;
		// Focus was on the Save button, which is about to leave the DOM. Move it
		// before that happens — letting it fall to `<body>` strands keyboard users
		// at the top of the document, and Save is the path that ends an edit
		// deliberately, so it needs this as much as Escape does.
		triggerEl?.focus();
	}

	/**
	 * Move focus across the slot grid with the arrow keys; space toggles natively.
	 *
	 * The cells are labels wrapping sr-only checkboxes, so Tab reaches every one —
	 * arrows are the fast path across the 5×8 grid rather than the only path in.
	 */
	function onSlotKeyDown(event: KeyboardEvent, day: EslDay, period: number) {
		const dayIndex = ESL_DAYS.indexOf(day);
		let nextDay = dayIndex;
		let nextPeriod = period;
		if (event.key === 'ArrowRight') nextDay = Math.min(dayIndex + 1, ESL_DAYS.length - 1);
		else if (event.key === 'ArrowLeft') nextDay = Math.max(dayIndex - 1, 0);
		else if (event.key === 'ArrowDown') nextPeriod = Math.min(period + 1, ESL_PERIODS.length);
		else if (event.key === 'ArrowUp') nextPeriod = Math.max(period - 1, 1);
		else return;
		event.preventDefault();
		document
			.getElementById(`slot-${classRecord.classId}-${ESL_DAYS[nextDay]}-${nextPeriod}`)
			?.focus();
	}

	/**
	 * Move focus across the room buttons; space and Enter press natively.
	 *
	 * The options read as one flat list — department rooms, homerooms, Other —
	 * so every arrow steps to the neighbour in that order.
	 */
	function onRoomKeyDown(event: KeyboardEvent, index: number, total: number) {
		let next = index;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
			next = Math.min(index + 1, total - 1);
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(index - 1, 0);
		else return;
		event.preventDefault();
		document.getElementById(`room-${classRecord.classId}-${next}`)?.focus();
	}

	/** The Save button's label: a pair save names both sections it writes. */
	const saveLabel = $derived(
		partner === null ? 'Save schedule' : `Save ${classRecord.name} + ${partner.name}`
	);
</script>

<!--
	The schedule line: chips on the left, the calendar icon on the right, and the
	whole strip one button.

	One button rather than an icon beside a separate click target, because the
	strip's job is "open this class's schedule picker" and an admin hunting for the
	button should not have to work out which of two small things is it. It also
	means one tab stop and one `aria-expanded` for the pair.

	`title` on each chip carries the reason a chip is red — which class it clashes
	with, on what dimension. Hover is unavailable to keyboard and touch users, so
	this is a real compromise; the alternative is a tooltip primitive, which does
	not exist in this project yet and is a larger job than this layout change.
-->
<div class="flex flex-col gap-2" data-testid="esl-admin-classes.schedule.{classRecord.classId}">
	<!--
		Relative, so the picker panel has something to pin against where anchor
		positioning is unavailable. The panel is out of flow either way, so
		opening it never moves the card.
	-->
	<div class="relative">
		<Button
			bind:ref={triggerEl}
			variant="ghost"
			size="sm"
			class="h-auto w-full justify-start gap-1 px-0 py-1 text-left font-normal hover:bg-transparent"
			style="anchor-name: {anchorName};"
			aria-expanded={expanded}
			aria-label="Schedule for {classRecord.name}"
			disabled={busy}
			onclick={() => (expanded ? (expanded = false) : open())}
			data-testid="esl-admin-classes.schedule.toggle"
		>
			<span class="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5">
				{#each chips as chip (chip.key)}
					<span
						class={[CHIP_BASE_CLASS, CHIP_STATE_CLASSES[chip.state]]}
						title={chip.title}
						data-testid="esl-admin-classes.schedule.chip"
						data-chip-state={chip.state}
					>
						{#if chip.state === 'valid'}<span aria-hidden="true">✓</span>{/if}
						{#if chip.state === 'conflict'}<span aria-hidden="true">!</span>{/if}
						{chip.label}
					</span>
				{/each}
			</span>
		</Button>

		{#if expanded}
			<AnchoredPanel
				bind:open={expanded}
				{anchorName}
				trigger={triggerEl}
				label="Schedule for {classRecord.name}"
				testId="esl-admin-classes.schedule.editor"
				class="space-y-2"
			>
				<p class="text-muted-foreground text-xs">Meets {required} times/week.</p>

				<!--
				The pair notice, stated before the grid rather than after it. A grade 10
				`A`/`B` pair is timetabled together, so saving here writes both sections —
				and a cross-class write that is not announced reads as the admin having
				edited more than the card they opened. Naming the other section makes the
				side effect the visible part of the action.
			-->
				{#if partner !== null}
					<p
						class="bg-muted/60 rounded px-2 py-1.5 text-xs"
						data-testid="esl-admin-classes.schedule.pair"
					>
						Also schedules <strong>{partner.name}</strong> — the pair shares every slot.
					</p>
				{/if}

				<div role="group" aria-label="Meeting slots">
					<div class="grid grid-cols-[1.25rem_repeat(5,minmax(0,1fr))]">
						<span></span>
						{#each ESL_DAYS as day (day)}
							<span class="text-muted-foreground text-center text-xs">
								{ESL_DAY_LABELS[day]}
							</span>
						{/each}
					</div>
					{#each ESL_PERIODS as slot (slot.period)}
						<div
							class="grid grid-cols-[1.25rem_repeat(5,minmax(0,1fr))]"
							class:mt-3={slot.period === AFTERNOON_FIRST_PERIOD}
						>
							<span class="text-muted-foreground flex items-center text-xs">P{slot.period}</span>
							{#each ESL_DAYS as day (day)}
								{@const selected = draft.some((m) => m.day === day && m.period === slot.period)}
								{@const blocked = cellBlocked(day, slot.period)}
								{@const reasons = cellReasons(day, slot.period)}
								{@const naBlocked = availabilityBlocked(day, slot.period)}
								{@const divergent = divergentOwner(day, slot.period) !== null}
								{@const conflict =
									selected && draftProblems.some((p) => p.day === day && p.period === slot.period)}
								<label
									for="slot-{classRecord.classId}-{day}-{slot.period}"
									// Blocked cells stay *visible*, never hidden: a cell that
									// vanishes reads as a broken picker and sends the admin
									// hunting for the slot they expected.
									class={[
										// Square and collapsed: shared 1px dividers with no gaps
										// (the P4–P5 lunch break keeps its own spacing), so the
										// grid reads as one table rather than loose tiles.
										'border-input text-muted-foreground -mt-px -ml-px flex h-6 items-center justify-center border text-xs focus-within:ring-2 focus-within:ring-emerald-600',
										// A pick that breaks a rule turns red at staging: red is
										// a verdict about this cell, and gray stays the color
										// of merely unavailable. Lifted above its neighbours
										// so all four sides of its border show.
										conflict
											? 'relative z-10 border-red-400 bg-red-100 font-medium text-red-800'
											: selected
												? 'slot-checked relative z-10'
												: // A blocked cell is not interactive, but it is still readable.
													blocked
													? 'border-gray-300 bg-gray-100 text-gray-400 opacity-50'
													: 'cursor-pointer',
										// A divergent pair slot is outlined amber: it is not blocked, but
										// saving will move the other section onto it.
										divergent && !conflict ? 'border-dashed border-amber-500' : ''
									]}
									title={[
										...reasons,
										divergent
											? `Only on ${divergentOwner(day, slot.period)}; saving aligns the pair.`
											: null
									]
										.filter((reason) => reason !== null)
										.join(' ') || undefined}
									data-testid="esl-admin-classes.schedule.cell"
									data-blocked={blocked}
									data-conflict={conflict}
									data-divergent={divergent}
								>
									<input
										type="checkbox"
										id="slot-{classRecord.classId}-{day}-{slot.period}"
										class="sr-only"
										data-testid="esl-admin-classes.schedule.slot"
										checked={selected}
										onchange={() => toggle({ day, period: slot.period })}
										onkeydown={(event) => onSlotKeyDown(event, day, slot.period)}
									/>
									{#if naBlocked}
										<span class="max-w-full truncate text-[0.625rem] leading-none">NA</span>
									{/if}
								</label>
							{/each}
						</div>
					{/each}
				</div>

				<!--
				The room grid: one scheduling gesture, not a separate form.

				Department rooms first, then the cohort's derived homerooms, then the
				Other escape hatch — the same order the query returns, so the
				department's own space reads as the default. Busy marks are judged
				against the *live draft*: each candidate room runs the gate with the
				slots as currently picked, and a held room names its holder and slot
				on the button rather than only in a tooltip. Choosing the picked
				room again clears it, so there is no separate clear control.
			-->
				<fieldset class="space-y-1">
					<legend class="text-muted-foreground text-xs font-medium">Room</legend>
					<div class="grid grid-cols-3" role="group" aria-label="Room choices">
						{#each roomOptions as option, index (option.value)}
							{@const busyMark = roomBusy(option.value)}
							{@const selectedRoom = draftRoom === option.value}
							<button
								type="button"
								id="room-{classRecord.classId}-{index}"
								class={[
									// Lifted on select and on hover so all four sides of the
									// border show above the shared dividers.
									'-mt-px -ml-px flex min-h-7 flex-col items-center justify-center border px-1 py-0.5 text-xs leading-tight hover:relative hover:z-10 focus-visible:ring-2 focus-visible:ring-emerald-600',
									selectedRoom
										? 'relative z-10 border-emerald-600 bg-emerald-100 font-medium text-emerald-900'
										: busyMark !== null
											? // Gray: the room is taken, and red is reserved for conflicts.
												'border-gray-300 bg-gray-100 text-gray-600'
											: 'border-input text-muted-foreground hover:border-emerald-400'
								]}
								title={busyMark !== null
									? `${option.value} is taken by ${busyMark.holder} at ${busyMark.slot}.`
									: selectedRoom
										? `${option.value} selected — choose again to clear.`
										: option.kind === 'homeroom'
											? `${option.value} is this cohort's homeroom.`
											: undefined}
								aria-pressed={selectedRoom}
								data-testid="esl-admin-classes.schedule.room"
								data-room={option.value}
								data-busy={busyMark !== null}
								disabled={busy}
								onclick={() => pickRoom(option.value)}
								onkeydown={(event) => onRoomKeyDown(event, index, roomOptions.length + 1)}
							>
								<span>{option.value}</span>
								{#if busyMark !== null}
									<span class="text-[0.625rem] font-normal opacity-80">
										{busyMark.holder} · {busyMark.slot}
									</span>
								{/if}
							</button>
						{/each}
						<button
							type="button"
							id="room-{classRecord.classId}-{roomOptions.length}"
							class={[
								'-mt-px -ml-px flex min-h-7 flex-col items-center justify-center border px-1 py-0.5 text-xs leading-tight focus-visible:ring-2 focus-visible:ring-emerald-600',
								typingCustom || (!isListedRoom(draftRoom) && draftRoom !== '')
									? 'border-emerald-600 bg-emerald-100 font-medium text-emerald-900'
									: 'border-input text-muted-foreground hover:border-emerald-400'
							]}
							title="Pick a room outside both lists."
							aria-pressed={typingCustom}
							data-testid="esl-admin-classes.schedule.room.other"
							disabled={busy}
							onclick={pickOther}
							onkeydown={(event) =>
								onRoomKeyDown(event, roomOptions.length, roomOptions.length + 1)}
						>
							<span>Other…</span>
						</button>
					</div>
					{#if typingCustom || (draftRoom !== '' && !isListedRoom(draftRoom))}
						<Input
							class="h-7 text-xs"
							data-testid="esl-admin-classes.schedule.room.input"
							bind:value={customRoom}
							placeholder="e.g. Library"
							aria-label="Custom room for {classRecord.name}"
							disabled={busy}
							onblur={commitCustom}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									commitCustom();
								}
							}}
						/>
					{/if}
				</fieldset>

				<!--
				The impact line: what the draft would disturb, always on screen.

				The blocked-reason tooltips and the reasons panel stay as the detail;
				this is the summary that does not require hovering. Clean drafts say
				so, because an empty line would read as "not computed yet".
			-->
				<div
					class={[
						'rounded px-2 py-1.5 text-xs',
						impactEntries.length > 0
							? 'bg-amber-50 text-amber-900'
							: 'bg-emerald-50 text-emerald-800'
					]}
					data-testid="esl-admin-classes.schedule.impact"
					role="status"
				>
					{#if impactEntries.length === 0}
						No conflicts — saves as drafted.
					{:else}
						<ul class="list-disc pl-4">
							{#each impactEntries as entry, index (index)}
								<li>{entry}</li>
							{/each}
						</ul>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							// Offered whenever something is blocked, not only for an unscheduled
							// class: the commonest way to get stuck is a half-built week that
							// cannot be saved, and one click should clear it.
							draft = solve();
							error = '';
						}}
						data-testid="esl-admin-classes.schedule.suggest"
					>
						Find free slots
					</Button>
					<Button
						size="sm"
						onclick={save}
						disabled={draft.length !== required || draftProblems.length > 0}
						data-testid="esl-admin-classes.schedule.save"
					>
						{saveLabel}
					</Button>
				</div>

				{#if error}
					<p
						class="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
						data-testid="esl-admin-classes.schedule.error"
					>
						{error}
					</p>
				{/if}
			</AnchoredPanel>
		{/if}
	</div>
</div>
