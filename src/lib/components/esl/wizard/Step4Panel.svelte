<script lang="ts">
	import { Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import CalendarPreview from './CalendarPreview.svelte';
	import type { WizardState, WizardStep4State } from './wizard-state';
	import {
		addDays,
		buildPreviewWeeks,
		CLIL_CLASSES_PER_QUIZ,
		schoolWeekDates,
		clilQuizWindow,
		collectClassDays,
		isWeekend,
		mondayOfWeek,
		type MockOffDay,
		weekOf
	} from './wizard-dates';

	/**
	 * Step 4 of the semester-setup wizard (ticket #222, spec #215 stories
	 * 21–26): School / ESL event tabs anchored to the Step 3 exam ranges.
	 *
	 * Promoted from the throwaway Step 4 prototype (all F-feedback settled
	 * there is preserved verbatim):
	 * - F50: no Spring Break row — Children's Day + Tomb Sweeping arrive
	 *   via the gov holiday import, not admin setup.
	 * - F51: no target selector anywhere — no row retains a meaningful
	 *   choice, so the control was removed entirely.
	 * - F52: the Anniversary makeup date is PAIRED with Anniversary and
	 *   cannot stand alone (disabled until Anniversary is set,
	 *   auto-suggested as the next class day, cleared with Anniversary).
	 * - F58: Anniversary is S2-only, same conditional rule as Graduation.
	 * - F54: term-specific rows render only in their term.
	 * - F55: chronological order gates inside each series reuse the exam
	 *   gate machinery (disabled starts with naming tooltips, quiet refuse).
	 * - F60: within-series order is SUFFICIENT for G9 mocks — no
	 *   exam-relative constraint (blockOf returns null for mock ids).
	 * - F56: block gates — Block 1 = first day → Exam 1, Block 2 = Exam 1 →
	 *   Exam 2, Block 3 = Exam 2 → Final. Quizzes 1–2 → B1, 3–4 → B2,
	 *   5–6 → B3; dues 1 → B1, 2 → B2, 3 → B3 (S2: 2 dues → B1–B2);
	 *   end-of-term checks → B3 only. Every row is placed manually.
	 * - F63: Anniversary + makeup render as one shared bordered card.
	 * - F64: no arming toggle — "Pick date" / "Set dates" /
	 *   "Set window"; a slim placing banner with ✕ cancel
	 *   while a row is placing. Promotion addition: a successful placement
	 *   also disarms (the prototype kept placing until cancelled).
	 * - F65: pair same-date gate both directions.
	 * - F66: Graduation gated to after Exam 2.
	 *
	 * State lives in `state.step4` (singles / pairs / ranges / sportsOn);
	 * every write goes through `update()` so sessionStorage stays in step.
	 * Exam anchors and off days come from Steps 2–3; the term (S1/S2)
	 * comes from Step 1.
	 */

	let {
		state: wizardState,
		update
	}: {
		state: WizardState;
		update: (mutate: (draft: WizardState) => void) => void;
	} = $props();

	type Tab = 'school' | 'esl';
	type SingleId = keyof WizardStep4State['singles'];
	type PairId = keyof WizardStep4State['pairs'];
	type RangeId = keyof WizardStep4State['ranges'];

	const SINGLE_IDS: readonly SingleId[] = ['anniv', 'makeup', 'sports', 'grad', 'bbq'];
	const PAIR_IDS: readonly PairId[] = ['mock1', 'mock2', 'mock3'];
	const QUIZ_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

	const DUE_DAYS = 5;

	const term = $derived(wizardState.step1.term);
	const startDate = $derived(wizardState.step1.startDate);
	const endDate = $derived(wizardState.step2?.endDate);
	const offDays: MockOffDay[] = $derived(wizardState.step2?.offDays ?? []);
	const exams = $derived(wizardState.step3?.exams ?? []);
	const step4 = $derived(wizardState.step4);
	const singles = $derived(step4.singles);
	const pairs = $derived(step4.pairs);
	const ranges = $derived(step4.ranges);
	const sportsOn = $derived(step4.sportsOn);
	const extras = $derived(step4.extras ?? []);

	const offSet = $derived(new Set(offDays.map((day) => day.date)));
	const examSet = $derived(new Set(exams.flatMap((exam) => exam.dates)));
	// Check windows skip weekends, days off AND exam days.
	const skipSet = $derived(new Set([...offSet, ...examSet]));

	const isS1 = $derived(term !== 'S2');
	const mockIds: readonly string[] = $derived(
		isS1 ? ['mock1', 'mock2'] : ['mock1', 'mock2', 'mock3']
	);
	const passportIds: readonly string[] = $derived(isS1 ? ['pd1', 'pd2', 'pd3'] : ['pd1', 'pd2']);
	const recordingIds: readonly string[] = $derived(isS1 ? ['rd1', 'rd2', 'rd3'] : ['rd1', 'rd2']);

	let tab = $state<Tab>('school');
	let armed = $state<string | null>(null);
	let hoverStart = $state<string | null>(null);
	let open = $state<Record<string, boolean>>({
		b1: true,
		b2: true,
		b3: true,
		schoolFest: true,
		schoolTerm: true
	});

	function isSingleId(id: string): id is SingleId {
		return (SINGLE_IDS as readonly string[]).includes(id);
	}
	function isPairId(id: string): id is PairId {
		return (PAIR_IDS as readonly string[]).includes(id);
	}
	function isExtraId(id: string): boolean {
		return id.startsWith('extra:');
	}

	function snapClass(date: string): string | null {
		if (startDate === null || endDate === null) return null;
		let cursor = date;
		for (let i = 0; i < 400 && cursor <= endDate; i++) {
			if (!isWeekend(cursor) && !skipSet.has(cursor)) return cursor;
			cursor = addDays(cursor, 1);
		}
		return null;
	}

	function eventLabel(id: string): string {
		if (id === 'anniv') return 'Anniversary';
		if (id === 'makeup') return 'Anniversary makeup date';
		if (id === 'sports') return 'Sports Day';
		if (id === 'grad') return 'Graduation';
		if (id === 'bbq') return 'BBQ';
		if (id === 'pcheck') return 'Passport Check';
		if (id === 'wcheck') return 'Workbook Check';
		if (id.startsWith('mock')) return `G9 Mock ${id.slice(4)}`;
		if (id.startsWith('q')) return `Quiz ${id.slice(1)}`;
		if (id.startsWith('pd')) return `Passport Due ${id.slice(2)}`;
		if (id.startsWith('rd')) return `Recording Due ${id.slice(2)}`;
		if (isExtraId(id)) return `Extra day off: ${id.slice(6)}`;
		return id;
	}

	function setSingle(id: SingleId, date: string): string[] | null {
		if (startDate === null || endDate === null) return null;
		// F52 pairing: the makeup date cannot stand alone.
		if (id === 'makeup' && singles['anniv'] == null) return null;
		// F65 pair same-date gate, both directions.
		if (id === 'makeup' && singles['anniv'] != null && date === singles['anniv']) return null;
		if (id === 'anniv' && singles['makeup'] != null && date === singles['makeup']) return null;
		// F66: Graduation gated to after Exam 2.
		if (id === 'grad') {
			const e2 = exams.find((exam) => exam.label === 'Exam 2')?.dates ?? [];
			const e2last = e2[e2.length - 1];
			if (e2last !== undefined && date <= e2last) return null;
		}
		if (isWeekend(date) || offSet.has(date) || examSet.has(date)) return null;
		if (date < startDate || date > endDate) return null;
		update((draft) => {
			draft.step4.singles[id] = date;
			// F52 pairing: setting Anniversary auto-suggests the makeup as
			// the next class day after it (adjustable after).
			if (id === 'anniv') {
				const next = snapClass(addDays(date, 1));
				draft.step4.singles['makeup'] = next;
			}
		});
		return [date];
	}

	function clearSingle(id: SingleId): void {
		update((draft) => {
			draft.step4.singles[id] = null;
			// F52 pairing: clearing Anniversary clears the makeup too.
			if (id === 'anniv') {
				draft.step4.singles['makeup'] = null;
			}
		});
		if (id === 'anniv' && armed === 'makeup') {
			armed = null;
			hoverStart = null;
		}
	}

	function removeExtra(id: string): void {
		update((draft) => {
			draft.step4.extras = draft.step4.extras.filter((extra) => extra.id !== id);
		});
		if (armed === 'extra:' + id) disarm();
	}

	function seriesOf(id: string): { ids: readonly string[]; label: (i: number) => string } | null {
		if (id.startsWith('mock')) return { ids: mockIds, label: (i) => `G9 Mock ${i + 1}` };
		if (id.startsWith('q'))
			return { ids: QUIZ_IDS as readonly string[], label: (i) => `Quiz ${i + 1}` };
		if (id.startsWith('pd')) return { ids: passportIds, label: (i) => `Passport Due ${i + 1}` };
		if (id.startsWith('rd')) return { ids: recordingIds, label: (i) => `Recording Due ${i + 1}` };
		return null;
	}

	function confirmedRange(id: string): string[] | undefined {
		const stored = isPairId(id) ? pairs[id] : ranges[id as RangeId];
		return stored !== undefined && stored !== null && stored.length > 0 ? [...stored] : undefined;
	}

	// F55 order gate: `[first, last]` must sit strictly between the
	// confirmed neighbors in its series, or null when it fits.
	//
	// Ranged ESL rows (quizzes, dues) are gated on OVERLAP rather than strict
	// order: two 5-school-day windows inside one exam block cannot both sit
	// "strictly before" each other, so demanding that made every candidate for
	// either row collide with the other — a placed window could then never be
	// moved and the row read as locked in place. Overlap is the real conflict:
	// two windows may not share a day. Block membership (`blockViolation`)
	// already carries the "which exam period" rule.
	// Mock pairs keep the strict rule: they are short, so they can always be
	// ordered, and "Mock 2 must follow Mock 1" is the real intent there.
	//
	// Overlap is the two-sided interval intersection
	// (`first <= otherLast && otherFirst <= last`). A one-sided test such as
	// `first <= otherLast` refuses every window that merely ENDS before its
	// neighbour ends — which is most of them — and left a placed row with no
	// selectable date anywhere.
	function orderViolation(id: string, first: string, last: string): string | null {
		const series = seriesOf(id);
		if (series === null) return null;
		const idx = series.ids.indexOf(id);
		if (idx < 0) return null;
		const label = series.label(idx);
		const overlapOnly = id.startsWith('q') || id.startsWith('pd') || id.startsWith('rd');
		for (let i = 0; i < series.ids.length; i++) {
			if (i === idx) continue;
			const other = confirmedRange(series.ids[i] as string);
			if (other === undefined) continue;
			const otherFirst = other[0] as string;
			const otherLast = other[other.length - 1] as string;
			const otherLabel = series.label(i);
			if (overlapOnly) {
				// Shares a day with this sibling, whichever side it sits on.
				if (first <= otherLast && otherFirst <= last) {
					return i < idx
						? `${otherLabel} must end before ${label} starts`
						: `${label} must end before ${otherLabel} starts`;
				}
				continue;
			}
			if (i < idx) {
				if (!(first > otherLast)) return `${otherLabel} must end before ${label} starts`;
			} else {
				if (!(last < otherFirst)) return `${label} must end before ${otherLabel} starts`;
			}
		}
		return null;
	}

	interface BlockWindow {
		n: number;
		start: string;
		end: string;
		between: string;
	}

	// F56 block windows derive from the exam anchors: Block 1 = first day
	// of school → Exam 1 start; Block 2 = Exam 1 end → Exam 2 start;
	// Block 3 = Exam 2 end → Final start.
	const blockWindows = $derived.by<BlockWindow[]>(() => {
		if (startDate === null) return [];
		const e1 = exams.find((exam) => exam.label === 'Exam 1')?.dates ?? [];
		const e2 = exams.find((exam) => exam.label === 'Exam 2')?.dates ?? [];
		const fin = exams.find((exam) => exam.label === 'Final')?.dates ?? [];
		const e1first = e1[0];
		const e1last = e1[e1.length - 1];
		const e2first = e2[0];
		const e2last = e2[e2.length - 1];
		const finFirst = fin[0];
		if (
			e1first === undefined ||
			e1last === undefined ||
			e2first === undefined ||
			e2last === undefined ||
			finFirst === undefined
		)
			return [];
		return [
			{
				n: 1,
				start: startDate,
				end: addDays(e1first, -1),
				between: 'the first day of school and Exam 1'
			},
			{ n: 2, start: addDays(e1last, 1), end: addDays(e2first, -1), between: 'Exam 1 and Exam 2' },
			{
				n: 3,
				start: addDays(e2last, 1),
				end: addDays(finFirst, -1),
				between: 'Exam 2 and the Final'
			}
		];
	});

	// F56: which block a row belongs to (null = no block gate). Quizzes
	// 1–2 → Block 1, 3–4 → Block 2, 5–6 → Block 3; dues Due 1 → Block 1,
	// Due 2 → Block 2, Due 3 → Block 3; end-of-term checks → Block 3 only.
	// F60: G9 mocks return null — within-series order is sufficient.
	function blockOf(id: string): number | null {
		if (id.startsWith('q')) {
			const n = Number(id.slice(1));
			return Number.isInteger(n) && n >= 1 && n <= 6 ? Math.floor((n - 1) / 2) + 1 : null;
		}
		if (id.startsWith('pd') || id.startsWith('rd')) {
			const n = Number(id.slice(2));
			return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null;
		}
		if (id === 'pcheck' || id === 'wcheck') return 3;
		return null;
	}

	function blockViolation(id: string, first: string, last: string): string | null {
		const n = blockOf(id);
		const window = blockWindowOf(id);
		if (n === null || window === null) return null;
		if (first >= window.start && last <= window.end) return null;
		return blockMessage(id);
	}

	function blockWindowOf(id: string): BlockWindow | null {
		const n = blockOf(id);
		if (n === null) return null;
		return blockWindows.find((w) => w.n === n) ?? null;
	}

	function blockMessage(id: string): string | null {
		const n = blockOf(id);
		const window = blockWindowOf(id);
		if (n === null || window === null) return null;
		return `${eventLabel(id)} belongs to Block ${n} — between ${window.between}`;
	}

	function isWeekEvent(id: string): boolean {
		return id === 'pcheck' || id === 'wcheck' || id.startsWith('pd') || id.startsWith('rd');
	}

	function inBlock(id: string, date: string): boolean {
		const window = blockWindowOf(id);
		return window === null || (date >= window.start && date <= window.end);
	}

	/**
	 * The dates a week-scoped row (Passport/Recording Due or Check) places
	 * when anchored on `date`.
	 *
	 * The window is a SCHOOL WEEK, whatever number of school days it holds:
	 * a four-day holiday week is as valid as a five-day one. A short week
	 * (three or fewer school days, e.g. the days before an exam) also
	 * collects the previous school week, so teachers have collection time.
	 *
	 * `currentWeek` never leaves the row's block. Days after the block end —
	 * such as the days following Exam 1 that sit in the same calendar week —
	 * belong to the next block and are never placed here. The block and order
	 * gates check `currentWeek` / the saved range, so a short pre-exam week
	 * is accepted while a post-exam day in the same week still is not.
	 */
	function weekWindow(id: string, date: string): { dates: string[]; currentWeek: string[] } {
		const window = blockWindowOf(id);
		const weekDates = schoolWeekDates(date, skipSet);
		const currentWeek =
			window === null
				? weekDates
				: weekDates.filter((day) => day >= window.start && day <= window.end);
		if (currentWeek.length === 0) return { dates: [], currentWeek };
		if (currentWeek.length <= 3) {
			const prevMonday = addDays(mondayOfWeek(date), -7);
			const prevWeekDates = schoolWeekDates(prevMonday, skipSet);
			return { dates: [...prevWeekDates, ...currentWeek], currentWeek };
		}
		return { dates: currentWeek, currentWeek };
	}

	function setPair(id: PairId, date: string): string[] | null {
		if (endDate === null) return null;
		if (isWeekend(date) || offSet.has(date) || examSet.has(date)) return null;
		const second = snapClass(addDays(date, 1));
		if (second === null) return null;
		if (orderViolation(id, date, second) !== null) return null;
		const placed: [string, string] = [date, second];
		update((draft) => {
			draft.step4.pairs[id] = [...placed];
		});
		return [...placed];
	}

	/**
	 * Quizzes span THREE CLIL class days, anchored on the school week the admin
	 * clicks. Every day of a week resolves to the same window, so clicking
	 * Jan 12 selects the same window as clicking Jan 11.
	 *
	 * The run walks forward from that week's Monday and skips weekends,
	 * holidays and exam days, so a week whose Friday class is a holiday
	 * (Christmas, New Year) simply reaches into the next week and still
	 * delivers three classes. Refused only when fewer than three classes exist
	 * before the term ends, when the window leaves the exam block, or when it
	 * overlaps a sibling quiz.
	 */
	function setQuizWindow(id: RangeId, date: string): string[] | null {
		if (startDate === null || endDate === null) return null;
		const blockN = blockOf(id);
		const gateEnd =
			blockN !== null ? (blockWindows.find((w) => w.n === blockN)?.end ?? null) : null;
		const dates = clilQuizWindow(date, skipSet, CLIL_CLASSES_PER_QUIZ, gateEnd);
		if (dates.length < CLIL_CLASSES_PER_QUIZ) return null;
		const first = dates[0] as string;
		const last = dates[dates.length - 1] as string;
		if (first < startDate || last > endDate) return null;
		if (blockViolation(id, first, last) !== null) return null;
		if (orderViolation(id, first, last) !== null) return null;
		const placed = [...dates];
		update((draft) => {
			draft.step4.ranges[id] = placed;
		});
		return placed;
	}

	function setRange(id: RangeId, date: string): string[] | null {
		if (endDate === null || !inBlock(id, date)) return null;
		const week = weekWindow(id, date);
		if (week.dates.length === 0) return null;
		const dates = week.dates;
		const first = dates[0] as string;
		const last = dates[dates.length - 1] as string;
		if (last > endDate) return null;
		const currentFirst = week.currentWeek[0];
		const currentLast = week.currentWeek[week.currentWeek.length - 1];
		const blockViol =
			currentFirst === undefined || currentLast === undefined
				? blockMessage(id)
				: blockViolation(id, currentFirst, currentLast);
		if (blockViol !== null) return null;
		if (orderViolation(id, first, last) !== null) return null;
		const placed = [...dates];
		update((draft) => {
			draft.step4.ranges[id] = placed;
		});
		return placed;
	}

	function disarm() {
		armed = null;
		hoverStart = null;
	}

	// Confirm toast (ticket #222 acceptance criteria): names what the last
	// calendar click set. Cleared by arming another row, cancelling, or ✕.
	let confirmation = $state<string | null>(null);

	function onCalendarClick(date: string) {
		if (armed === null) return;
		const current = armed;
		let placed: string[] | null = null;
		if (isSingleId(current)) {
			placed = setSingle(current, date);
		} else if (isPairId(current)) {
			placed = setPair(current, date);
		} else if (isExtraId(current)) {
			const extra = extras.find((e) => 'extra:' + e.id === current);
			if (extra) {
				if (extra.end) {
					// Range extra: set the start date, keep the end
					update((draft) => {
						const idx = draft.step4.extras.findIndex((e) => 'extra:' + e.id === current);
						if (idx >= 0) {
							draft.step4.extras[idx] = { ...draft.step4.extras[idx], start: date };
						}
					});
					placed = [date];
				} else {
					// Single-day extra
					update((draft) => {
						const idx = draft.step4.extras.findIndex((e) => 'extra:' + e.id === current);
						if (idx >= 0) {
							draft.step4.extras[idx] = { ...draft.step4.extras[idx], start: date };
						}
					});
					placed = [date];
				}
			}
		} else if (current.startsWith('q')) {
			// Quizzes pick a school week (3 CLIL classes), not a fixed run.
			placed = setQuizWindow(current as RangeId, date);
		} else {
			placed = setRange(current as RangeId, date);
		}
		// Promotion addition over the prototype: a successful placement
		// completes the placing flow (the banner clears) and confirms.
		if (placed !== null) {
			confirmation = `${eventLabel(current)} set — ${fmt(placed)}`;
			disarm();
		}
	}

	// F62: static armed-row kinds.
	const armedDates = $derived.by<string[]>(() => {
		if (armed === null) return [];
		if (isSingleId(armed)) return singles[armed] == null ? [] : [singles[armed] as string];
		if (isPairId(armed)) return pairs[armed] ?? [];
		if (isExtraId(armed)) {
			const extra = extras.find((e) => 'extra:' + e.id === armed);
			if (extra) {
				if (extra.end) {
					// For range extras, return both start and end for highlighting
					return [extra.start, extra.end];
				}
				return extra.start ? [extra.start] : [];
			}
			return [];
		}
		return ranges[armed as RangeId] ?? [];
	});
	const hoverPreview = $derived.by<string[]>(() => {
		if (armed === null || hoverStart === null) return [];
		// Single-date picks (and 2-day mock pairs, previewed by start day)
		// preview exactly one day.
		if (isSingleId(armed) || armed.startsWith('mock') || isExtraId(armed)) return [hoverStart];
		// Quizzes preview the hovered week's CLIL classes, matching what the
		// click will place — so the highlight never disagrees with the result.
		if (armed.startsWith('q')) {
			const blockN = blockOf(armed as string);
			const gateEnd =
				blockN !== null ? (blockWindows.find((w) => w.n === blockN)?.end ?? null) : null;
			return clilQuizWindow(hoverStart, skipSet, CLIL_CLASSES_PER_QUIZ, gateEnd);
		}
		// Checks preview with the same block-bounded week window the setter
		// uses, so the preview can never show days the setter would refuse.
		if (isWeekEvent(armed)) return weekWindow(armed, hoverStart).dates;
		return collectClassDays(hoverStart, DUE_DAYS, skipSet);
	});
	const highlighted = $derived([...new Set([...armedDates, ...hoverPreview])]);

	/**
	 * Disabled dates for an armed quiz row, computed per school WEEK. A week's
	 * window is refused when fewer than three CLIL classes remain before the
	 * term ends, when it leaves the exam block, or when it overlaps a sibling
	 * quiz — in which case every school day of that week is disabled with the
	 * same tooltip, because they all resolve to the same window.
	 */
	function quizWeekGate(armed: string): { dates: string[]; tips: Record<string, string> } {
		const dates: string[] = [];
		const tips: Record<string, string> = {};
		if (startDate === null || endDate === null) return { dates, tips };
		const blockN = blockOf(armed);
		const gateEnd =
			blockN !== null ? (blockWindows.find((w) => w.n === blockN)?.end ?? endDate) : endDate;

		// Quizzes: week-based 3 CLIL classes. Dues and checks go through the
		// general week loop below.
		let cursor = startDate;
		while (cursor <= endDate) {
			if (!isWeekend(cursor) && !offSet.has(cursor) && !examSet.has(cursor)) {
				const classes = clilQuizWindow(cursor, skipSet, CLIL_CLASSES_PER_QUIZ, gateEnd);
				let violation: string | null = null;
				if (classes.length < CLIL_CLASSES_PER_QUIZ) {
					violation = `${eventLabel(armed)} needs ${CLIL_CLASSES_PER_QUIZ} CLIL classes — only ${classes.length} left before the term ends`;
				} else {
					const first = classes[0] as string;
					const last = classes[classes.length - 1] as string;
					if (first < startDate || last > endDate) {
						violation = `${eventLabel(armed)} window ${first} → ${last} falls outside the semester`;
					} else {
						violation = blockViolation(armed, first, last) ?? orderViolation(armed, first, last);
					}
				}
				if (violation !== null) {
					dates.push(cursor);
					tips[cursor] = violation;
				}
			}
			cursor = addDays(cursor, 1);
		}
		return { dates, tips };
	}

	// F55/F60: per-armed starts disabled by the block + order gates, with
	// naming tooltips. Mocks carry only the order gate.
	const armedGate = $derived.by<{ dates: string[]; tips: Record<string, string> }>(() => {
		if (armed === null || startDate === null || endDate === null) return { dates: [], tips: {} };
		// F65 pair same-date gate, both directions.
		if (armed === 'makeup') {
			const anniv = singles['anniv'];
			if (anniv != null)
				return {
					dates: [anniv],
					tips: { [anniv]: 'The makeup date cannot be the Anniversary date' }
				};
		}
		if (armed === 'anniv') {
			const makeup = singles['makeup'];
			if (makeup != null)
				return { dates: [makeup], tips: { [makeup]: 'Anniversary cannot be the makeup date' } };
		}
		// F66: Graduation gated to after Exam 2.
		if (armed === 'grad') {
			const e2 = exams.find((exam) => exam.label === 'Exam 2')?.dates ?? [];
			const e2last = e2[e2.length - 1];
			if (e2last !== undefined) {
				const dates: string[] = [];
				const tips: Record<string, string> = {};
				let cursor = startDate;
				while (cursor <= e2last && cursor <= endDate) {
					if (!isWeekend(cursor) && !offSet.has(cursor) && !examSet.has(cursor)) {
						dates.push(cursor);
						tips[cursor] = 'Graduation must be after Exam 2';
					}
					cursor = addDays(cursor, 1);
				}
				return { dates, tips };
			}
			return { dates: [], tips: {} };
		}
		const series = seriesOf(armed);
		if (series === null && blockOf(armed) === null) return { dates: [], tips: {} };
		// Quizzes are picked by WEEK: every school day of a usable week is a
		// valid start, because the week — not the day — is what gets placed.
		// Gating day-by-day (the old fan-out) left only the last usable start
		// clickable, which read as "the dates are fixed".
		if (armed.startsWith('q')) return quizWeekGate(armed);
		const isMock = armed.startsWith('mock');
		const days = DUE_DAYS;
		const dates: string[] = [];
		const tips: Record<string, string> = {};
		let cursor = startDate;
		while (cursor <= endDate) {
			if (!isWeekend(cursor) && !offSet.has(cursor) && !examSet.has(cursor)) {
				let violation: string | null = null;
				if (isMock) {
					const second = snapClass(addDays(cursor, 1));
					if (second !== null) violation = orderViolation(armed, cursor, second);
				} else {
					const snapped = snapClass(cursor);
					if (snapped !== null) {
						if (isWeekEvent(armed)) {
							if (!inBlock(armed, snapped)) {
								violation = blockMessage(armed);
							} else {
								const week = weekWindow(armed, snapped);
								if (week.dates.length > 0) {
									const first = week.dates[0] as string;
									const last = week.dates[week.dates.length - 1] as string;
									violation =
										week.currentWeek.length === 0
											? blockMessage(armed)
											: (blockViolation(
													armed,
													week.currentWeek[0] as string,
													week.currentWeek[week.currentWeek.length - 1] as string
												) ?? orderViolation(armed, first, last));
								}
							}
						} else {
							const fanout = collectClassDays(snapped, days, skipSet);
							if (fanout.length > 0) {
								const first = fanout[0] as string;
								const last = fanout[fanout.length - 1] as string;
								violation =
									blockViolation(armed, first, last) ?? orderViolation(armed, first, last);
							}
						}
					}
				}
				if (violation !== null) {
					dates.push(cursor);
					tips[cursor] = violation;
				}
			}
			cursor = addDays(cursor, 1);
		}
		return { dates, tips };
	});
	const disabledDates = $derived([...new Set([...offSet, ...examSet, ...armedGate.dates])]);
	const disabledTooltips = $derived(armedGate.tips);

	function rangeSet(id: RangeId): boolean {
		const value = ranges[id];
		return value != null && value.length > 0;
	}

	interface EslRow {
		id: string;
		name: string;
		meta: string;
	}

	interface EslBlock {
		n: number;
		range: string | null;
		rows: EslRow[];
	}

	// ESL work is set block by block: every row that belongs to a block sits
	// under that block, with its date window and a remaining count in the
	// header. The admin never has to work out which block a quiz or due is in.
	const eslBlocks = $derived.by<EslBlock[]>(() => {
		const rowsOf = (n: number): EslRow[] => {
			const rows: EslRow[] = [0, 1].map((offset) => ({
				id: `q${(n - 1) * 2 + offset + 1}`,
				name: `Quiz ${(n - 1) * 2 + offset + 1}`,
				meta: 'CLIL'
			}));
			if (n <= passportIds.length) {
				rows.push({ id: `pd${n}`, name: `Passport Due ${n}`, meta: 'Communication' });
			}
			if (n <= recordingIds.length) {
				rows.push({ id: `rd${n}`, name: `Recording Due ${n}`, meta: 'Communication' });
			}
			if (n === 3) {
				rows.push({ id: 'pcheck', name: 'Passport Check', meta: 'Communication' });
				rows.push({ id: 'wcheck', name: 'Workbook Check', meta: 'CLIL' });
			}
			return rows;
		};
		return [1, 2, 3].map((n) => {
			const window = blockWindows.find((w) => w.n === n);
			return {
				n,
				range: window ? `${window.start} → ${window.end}` : null,
				rows: rowsOf(n)
			};
		});
	});

	function remainingRows(block: EslBlock): number {
		return block.rows.filter((row) => !rangeSet(row.id as RangeId)).length;
	}

	// School-side rows split the same way: what is missing from the no-class
	// group, and what is missing from the Grade 9 group.
	const schoolRemaining = $derived.by(() => {
		let noClass = 0;
		// The makeup date follows Anniversary, so it is not separate work.
		if (!isS1) {
			if (singles['anniv'] == null) noClass++;
			else if (singles['makeup'] == null) noClass++;
		}
		if (sportsOn && singles['sports'] == null) noClass++;
		let grade9 = mockIds.filter((id) => (pairs[id as PairId]?.length ?? 0) === 0).length;
		if (!isS1 && singles['grad'] == null) grade9++;
		return { noClass, grade9 };
	});

	const weeks = $derived(
		startDate !== null && endDate !== null
			? buildPreviewWeeks(
					startDate,
					endDate,
					offDays,
					exams.map((exam) => ({ label: exam.label, dates: exam.dates }))
				)
			: []
	);

	function fmt(dates: readonly string[] | null | undefined): string {
		if (dates === undefined || dates === null || dates.length === 0) return 'unset';
		return dates.length === 1 ? (dates[0] ?? 'unset') : `${dates[0]} → ${dates[dates.length - 1]}`;
	}

	function toggle(id: string) {
		open = { ...open, [id]: !(open[id] ?? false) };
	}

	function arm(id: string) {
		// F64: placing sticks — cancel via the banner ✕ or by placing
		// another row. The placing row shows a static chip, not a toggle.
		armed = id;
		hoverStart = null;
		confirmation = null;
	}

	function cancelPlacing() {
		disarm();
		confirmation = null;
	}

	// Read-only summary of every set event.
	const summary = $derived.by(() => {
		if (startDate === null) return [];
		const rows: Array<{ label: string; value: string }> = [];
		const s = (label: string, id: SingleId) => {
			const v = singles[id];
			if (v != null) rows.push({ label, value: v });
		};
		s('Anniversary · No class, all grades', 'anniv');
		s('Anniversary makeup date · Day off', 'makeup');
		if (sportsOn) s('Sports Day · No class, all grades', 'sports');
		for (const id of mockIds) {
			const d = pairs[id as PairId];
			if (d !== undefined && d !== null && d.length > 0)
				rows.push({ label: `G9 Mock ${id.slice(4)} · Grade 9`, value: d.join(', ') });
		}
		if (!isS1) s('Graduation · No class, Grade 9 only', 'grad');
		for (const [i, id] of (QUIZ_IDS as readonly string[]).entries()) {
			const d = ranges[id as RangeId];
			if (d !== undefined && d !== null && d.length > 0)
				rows.push({ label: `Quiz ${i + 1} · CLIL · Block ${blockOf(id)}`, value: fmt(d) });
		}
		for (const [i, id] of passportIds.entries()) {
			const d = ranges[id as RangeId];
			if (d !== undefined && d !== null && d.length > 0)
				rows.push({
					label: `Passport Due ${i + 1} · Communication · Block ${blockOf(id)}`,
					value: fmt(d)
				});
		}
		for (const [i, id] of recordingIds.entries()) {
			const d = ranges[id as RangeId];
			if (d !== undefined && d !== null && d.length > 0)
				rows.push({
					label: `Recording Due ${i + 1} · Communication · Block ${blockOf(id)}`,
					value: fmt(d)
				});
		}
		if (ranges['pcheck'] !== undefined && ranges['pcheck'] !== null)
			rows.push({
				label: 'Passport Check · Communication · Block 3',
				value: fmt(ranges['pcheck'])
			});
		if (ranges['wcheck'] !== undefined && ranges['wcheck'] !== null)
			rows.push({
				label: 'Workbook Check · CLIL · Block 3',
				value: fmt(ranges['wcheck'])
			});
		// BBQ (S1 starter, folded from seed #229)
		if (isS1 && singles.bbq !== null) {
			rows.push({ label: 'BBQ · Partial day, All grades', value: singles.bbq });
		}
		// Extra days off (folded from seed #229)
		for (const extra of extras) {
			if (extra.start) {
				rows.push({
					label: `Extra day off: ${extra.name} · All grades`,
					value: extra.end ? `${extra.start} → ${extra.end}` : extra.start
				});
			}
		}
		return rows;
	});
</script>

<div data-testid="wizard.step-4-panel" class="space-y-4">
	<div class="flex gap-2" role="tablist" aria-label="Event tabs">
		{#each [{ id: 'school', label: 'School' }, { id: 'esl', label: 'ESL' }] as t (t.id)}
			<Button
				size="sm"
				variant={tab === t.id ? 'default' : 'outline'}
				onclick={() => (tab = t.id as Tab)}
				data-testid={`wizard-step4.tab-${t.id}`}
				role="tab"
				aria-selected={tab === t.id}
			>
				{t.label}
			</Button>
		{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
		<div class="min-w-0 space-y-4">
			{#if tab === 'school'}
				<section data-testid="wizard-step4.school-tab" class="space-y-3">
					<div
						data-testid="wizard-step4.start-school"
						class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900"
					>
						<strong>First day of school</strong> · {startDate} · Periods 1–2 have no class
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('offdays')}
							data-testid="wizard-step4.group-offdays"
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['offdays'] ?? false) ? '▾' : '▸'} Imported days off · {offDays.length}
						</button>
						{#if open['offdays'] ?? false}
							<ul
								data-testid="wizard-step4.offdays-list"
								class="space-y-0.5 px-3 pb-3 text-xs text-gray-500"
							>
								{#each offDays as day (day.date)}
									<li>{day.date} — 🎉 {day.name}</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('schoolFest')}
							data-testid="wizard-step4.group-fest"
							class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							<span>{(open['schoolFest'] ?? false) ? '▾' : '▸'} No-class days · all grades</span>
							<span
								class="shrink-0 text-xs font-normal {schoolRemaining.noClass === 0
									? 'text-emerald-700'
									: 'text-gray-500'}"
							>
								{schoolRemaining.noClass === 0 ? 'All set' : `${schoolRemaining.noClass} left`}
							</span>
						</button>
						{#if open['schoolFest'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								{#if !isS1}
									<div
										data-testid="wizard-step4.row-anniv-pair"
										class="rounded border p-2 text-sm {armed === 'anniv' || armed === 'makeup'
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div
											data-testid="wizard-step4.row-anniv"
											class="flex flex-wrap items-center justify-between gap-2"
										>
											<span
												><strong>Anniversary</strong> · {fmt(
													singles['anniv'] == null ? [] : [singles['anniv'] as string]
												)}</span
											>
											<span class="flex items-center gap-2">
												{#if singles['anniv'] != null}
													<Button
														size="sm"
														variant="outline"
														onclick={() => clearSingle('anniv')}
														data-testid="wizard-step4.anniv-clear"
													>
														Clear
													</Button>
												{/if}
												{#if armed === 'anniv'}
													<span
														data-testid="wizard-step4.anniv-chip"
														class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
														>Placing ✓</span
													>
												{:else}
													<Button
														size="sm"
														variant="outline"
														onclick={() => arm('anniv')}
														data-testid="wizard-step4.anniv-arm"
													>
														Pick date
													</Button>
												{/if}
											</span>
										</div>
										<div
											data-testid="wizard-step4.row-makeup"
											class="mt-2 flex flex-wrap items-center justify-between gap-2 border-l-2 border-emerald-300 pl-3"
										>
											<span
												><strong>Anniversary makeup</strong> · {fmt(
													singles['makeup'] == null ? [] : [singles['makeup'] as string]
												)}
												<span class="ml-1 text-xs text-gray-500">
													{singles['anniv'] == null
														? 'Set Anniversary first'
														: 'follows Anniversary'}
												</span></span
											>
											{#if armed === 'makeup'}
												<span
													data-testid="wizard-step4.makeup-chip"
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>Placing ✓</span
												>
											{:else}
												<Button
													size="sm"
													variant="outline"
													disabled={singles['anniv'] == null}
													onclick={() => arm('makeup')}
													data-testid="wizard-step4.makeup-arm"
												>
													Pick date
												</Button>
											{/if}
										</div>
									</div>
								{/if}
								<div
									data-testid="wizard-step4.row-sports"
									class="rounded border p-2 text-sm {armed === 'sports'
										? 'border-emerald-500 bg-emerald-50'
										: 'border-gray-200'} {sportsOn ? '' : 'opacity-60'}"
								>
									<div class="flex flex-wrap items-center justify-between gap-2">
										<span
											><strong>Sports Day</strong> · {sportsOn
												? fmt(singles['sports'] == null ? [] : [singles['sports'] as string])
												: 'not this term'}</span
										>
										<span class="flex items-center gap-2">
											<label class="flex items-center gap-1 text-xs text-gray-600">
												<input
													type="checkbox"
													checked={sportsOn}
													onchange={(event) =>
														update((draft) => {
															draft.step4.sportsOn = event.currentTarget.checked;
														})}
													data-testid="wizard-step4.sports-toggle"
												/>
												On
											</label>
											{#if armed === 'sports'}
												<span
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>Placing ✓</span
												>
											{:else}
												<Button
													size="sm"
													variant="outline"
													disabled={!sportsOn}
													onclick={() => arm('sports')}
													data-testid="wizard-step4.sports-arm"
												>
													Pick date
												</Button>
											{/if}
										</span>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('schoolTerm')}
							data-testid="wizard-step4.group-term"
							class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							<span>
								{(open['schoolTerm'] ?? false) ? '▾' : '▸'}
								{isS1 ? 'Grade 9 · mocks' : 'Grade 9 · mocks and graduation'}
							</span>
							<span
								class="shrink-0 text-xs font-normal {schoolRemaining.grade9 === 0
									? 'text-emerald-700'
									: 'text-gray-500'}"
							>
								{schoolRemaining.grade9 === 0 ? 'All set' : `${schoolRemaining.grade9} left`}
							</span>
						</button>
						{#if open['schoolTerm'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								{#each mockIds as id, i (`${term}-${id}`)}
									<div
										data-testid={`wizard-step4.row-${id}`}
										class="rounded border p-2 text-sm {armed === id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>G9 Mock {i + 1}</strong> · {(pairs[id as PairId] ?? []).join(
													', '
												) || 'unset'} · 2 days in a row</span
											>
											{#if armed === id}
												<span
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>Placing ✓</span
												>
											{:else}
												<Button size="sm" variant="outline" onclick={() => arm(id)}>
													Set dates
												</Button>
											{/if}
										</div>
									</div>
								{/each}
								{#if !isS1}
									<div
										data-testid="wizard-step4.row-grad"
										class="rounded border p-2 text-sm {armed === 'grad'
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>Graduation</strong> · {fmt(
													singles['grad'] == null ? [] : [singles['grad'] as string]
												)} <span class="ml-1 text-xs text-gray-500">after Exam 2</span></span
											>
											{#if armed === 'grad'}
												<span
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>Placing ✓</span
												>
											{:else}
												<Button size="sm" variant="outline" onclick={() => arm('grad')}>
													Pick date
												</Button>
											{/if}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('extras')}
							data-testid="wizard-step4.group-extras"
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['extras'] ?? false) ? '▾' : '▸'} Extra days off · {extras.length}
						</button>
						{#if open['extras'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								{#each extras as extra (extra.id)}
									<div
										data-testid="wizard-step4.row-extra"
										class="rounded border p-2 text-sm {armed === 'extra:' + extra.id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>{extra.name || 'Untitled day off'}</strong> · {extra.end
													? extra.start + ' → ' + extra.end
													: extra.start}
												<span class="ml-1 text-xs text-gray-500"
													>{extra.end ? 'calendar days' : 'single day'}</span
												></span
											>
											{#if armed === 'extra:' + extra.id}
												<span
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>Placing ✓</span
												>
											{:else}
												<Button
													size="sm"
													variant="outline"
													onclick={() => arm('extra:' + extra.id)}
													data-testid="wizard-step4.extra-arm"
												>
													{extra.end ? 'Set range' : 'Pick date'}
												</Button>
											{/if}
											<Button
												size="icon-sm"
												variant="ghost"
												onclick={() => removeExtra(extra.id)}
												data-testid="wizard-step4.extra-remove"
												aria-label={`Remove extra day off ${extra.name || '(unnamed)'}`}
												class="text-red-700 hover:bg-red-50 hover:text-red-800"
											>
												<Trash2 class="size-4" />
											</Button>
										</div>
									</div>
								{/each}
								<Button
									size="sm"
									variant="outline"
									onclick={() => {
										update((draft) => {
											draft.step4.extras.push({
												id: 'extra-' + Date.now(),
												name: '',
												start: '',
												end: null
											});
										});
									}}
									data-testid="wizard-step4.extra-add"
								>
									Add extra day off
								</Button>
							</div>
						{/if}
					</div>
				</section>
			{:else}
				<section data-testid="wizard-step4.esl-tab" class="space-y-3">
					<p class="text-xs text-gray-500">
						Pick a row, then a date on the calendar. Rows stay inside their block and skip weekends,
						days off and exam days.
					</p>

					{#if isS1}
						<div
							data-testid="wizard-step4.row-bbq"
							class="rounded border p-2 text-sm {armed === 'bbq'
								? 'border-emerald-500 bg-emerald-50'
								: 'border-gray-200'}"
						>
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span
									><strong>BBQ</strong> · {fmt(
										singles['bbq'] == null ? [] : [singles['bbq'] as string]
									)}
									<span class="ml-1 text-xs text-gray-500"
										>· any time this term · periods 1–4, off from 12:00</span
									></span
								>
								{#if armed === 'bbq'}
									<span
										data-testid="wizard-step4.bbq-chip"
										class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
										>Placing ✓</span
									>
								{:else}
									<Button
										size="sm"
										variant="outline"
										onclick={() => arm('bbq')}
										data-testid="wizard-step4.bbq-arm"
									>
										Pick date
									</Button>
								{/if}
							</div>
						</div>
					{/if}

					{#each eslBlocks as block (block.n)}
						<div class="rounded border bg-white">
							<button
								type="button"
								onclick={() => toggle(`b${block.n}`)}
								data-testid={`wizard-step4.block-${block.n}`}
								class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-800"
							>
								<span class="min-w-0">
									{(open[`b${block.n}`] ?? false) ? '▾' : '▸'} Block {block.n}
									{#if block.range}
										<span class="font-normal text-gray-500">· {block.range}</span>
									{/if}
								</span>
								<span
									class="shrink-0 text-xs font-normal {remainingRows(block) === 0
										? 'text-emerald-700'
										: 'text-gray-500'}"
								>
									{remainingRows(block) === 0 ? 'All set' : `${remainingRows(block)} left`}
								</span>
							</button>
							{#if open[`b${block.n}`] ?? false}
								<div class="space-y-2 px-3 pb-3">
									{#each block.rows as row (row.id)}
										<div
											data-testid={`wizard-step4.row-${row.id}`}
											class="rounded border p-2 text-sm {armed === row.id
												? 'border-emerald-500 bg-emerald-50'
												: 'border-gray-200'}"
										>
											<div class="flex flex-wrap items-center justify-between gap-2">
												<span>
													<strong>{row.name}</strong> · {row.meta} · {fmt(
														ranges[row.id as RangeId]
													)}
												</span>
												{#if armed === row.id}
													<span
														class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
														>Placing ✓</span
													>
												{:else}
													<Button size="sm" variant="outline" onclick={() => arm(row.id)}>
														Set window
													</Button>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</section>
			{/if}

			<section data-testid="wizard-step4.summary" class="rounded-lg border bg-white p-4">
				<h2 class="mb-2 text-sm font-semibold text-gray-800">
					Summary <span class="font-normal text-gray-500">· nothing saved yet</span>
				</h2>
				{#if summary.length === 0}
					<p class="text-sm text-gray-500">Rows you set will appear here.</p>
				{:else}
					<ul class="space-y-1 text-sm text-gray-700">
						{#each summary as row, i (`${i}-${row.label}`)}
							<li><strong>{row.label}:</strong> {row.value}</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<div class="min-w-0">
			{#if confirmation !== null}
				<div
					data-testid="wizard-step4.confirm-toast"
					class="mb-2 flex items-center justify-between gap-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"
					role="status"
				>
					<span>{confirmation}</span>
					<Button
						size="sm"
						variant="ghost"
						onclick={() => (confirmation = null)}
						aria-label="Dismiss confirmation"
					>
						✕
					</Button>
				</div>
			{/if}
			{#if armed !== null}
				<div
					data-testid="wizard-step4.placing-banner"
					class="mb-2 flex items-center justify-between gap-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"
				>
					<span>Placing {eventLabel(armed)} — click a date to set</span>
					<Button
						size="sm"
						variant="ghost"
						onclick={cancelPlacing}
						data-testid="wizard-step4.placing-cancel"
						aria-label="Cancel placing"
					>
						✕ cancel
					</Button>
				</div>
			{/if}
			<CalendarPreview
				{weeks}
				interactive
				highlighted={hoverPreview}
				oldHighlighted={armedDates}
				{disabledDates}
				{disabledTooltips}
				onDateClick={onCalendarClick}
				onDateHover={(date) => (hoverStart = date)}
				testId="wizard-step4-calendar"
			/>
		</div>
	</div>
</div>
