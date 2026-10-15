<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import CalendarPreview from './CalendarPreview.svelte';
	import type { WizardState, WizardStep4State } from './wizard-state';
	import {
		addDays,
		buildPreviewWeeks,
		collectClassDays,
		dueWindowDates,
		isWeekend,
		type MockOffDay
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
	 *   end-of-term checks → B3 only. Batch-fill lands each row in its block.
	 * - F63: Anniversary + makeup render as one shared bordered card.
	 * - F64: no arming toggle — "Pick date" / "Set batch start" /
	 *   "Set dates" / "Set window"; a slim placing banner with ✕ cancel
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

	const SINGLE_IDS: readonly SingleId[] = ['anniv', 'makeup', 'sports', 'grad'];
	const PAIR_IDS: readonly PairId[] = ['mock1', 'mock2', 'mock3'];
	const QUIZ_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

	const QUIZ_DAYS = 3;
	const DUE_DAYS = 3;
	const CHECK_DAYS = 5;

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
	let open = $state<Record<string, boolean>>({ schoolFest: true, schoolTerm: true });

	function isSingleId(id: string): id is SingleId {
		return (SINGLE_IDS as readonly string[]).includes(id);
	}
	function isPairId(id: string): id is PairId {
		return (PAIR_IDS as readonly string[]).includes(id);
	}
	function isBatchSource(id: string): boolean {
		return id === 'q1' || id === 'pd1';
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
		if (id === 'pcheck') return 'Passport Check';
		if (id === 'wcheck') return 'Workbook Check';
		if (id.startsWith('mock')) return `G9 Mock ${id.slice(4)}`;
		if (id.startsWith('q')) return `Quiz ${id.slice(1)}`;
		if (id.startsWith('pd')) return `Passport Due ${id.slice(2)}`;
		if (id.startsWith('rd')) return `Recording Due ${id.slice(2)}`;
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
	function orderViolation(id: string, first: string, last: string): string | null {
		const series = seriesOf(id);
		if (series === null) return null;
		const idx = series.ids.indexOf(id);
		if (idx < 0) return null;
		const label = series.label(idx);
		for (let i = 0; i < series.ids.length; i++) {
			if (i === idx) continue;
			const other = confirmedRange(series.ids[i] as string);
			if (other === undefined) continue;
			const otherFirst = other[0] as string;
			const otherLast = other[other.length - 1] as string;
			const otherLabel = series.label(i);
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
		if (n === null) return null;
		const window = blockWindows.find((w) => w.n === n);
		if (window === undefined) return null;
		if (first >= window.start && last <= window.end) return null;
		return `${eventLabel(id)} belongs to Block ${n} — between ${window.between}`;
	}

	// A fan-out spanning an off/exam day can never be saved
	// (`events.create` refuses straddling windows with the date named), so
	// Step 4 refuses it at pick time like every other gate. Weekends are
	// fine — non-school days, not events. Mock pairs occupy single dates
	// (never a span), so they cannot straddle.
	function straddleViolation(id: string, first: string, last: string): string | null {
		let cursor = addDays(first, 1);
		while (cursor < last) {
			if (offSet.has(cursor) || examSet.has(cursor)) {
				return `${eventLabel(id)} crosses ${cursor} — pick a window clear of it`;
			}
			cursor = addDays(cursor, 1);
		}
		return null;
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

	function setRange(id: RangeId, date: string, days: number): string[] | null {
		if (endDate === null) return null;
		const snapped = snapClass(date);
		if (snapped === null) return null;
		const dates =
			id === 'pcheck' || id === 'wcheck'
				? dueWindowDates(snapped, skipSet, endDate)
				: collectClassDays(snapped, days, skipSet);
		if (dates.length < days) return null;
		const first = dates[0] as string;
		const last = dates[dates.length - 1] as string;
		if (last > endDate) return null;
		if (blockViolation(id, first, last) !== null) return null;
		if (orderViolation(id, first, last) !== null) return null;
		if (straddleViolation(id, first, last) !== null) return null;
		const placed = [...dates];
		update((draft) => {
			draft.step4.ranges[id] = placed;
		});
		return placed;
	}

	// Batch-fill within block windows (F56): each id lands inside its own
	// block; rows that no longer fit their block stay unset.
	function batchWithinBlocks(ids: readonly string[], first: string, rangeDays: number, gap = 14) {
		const fanout = (id: string, start: string): string[] =>
			id === 'pcheck' || id === 'wcheck'
				? dueWindowDates(start, skipSet, endDate ?? start)
				: collectClassDays(start, rangeDays, skipSet);
		const next: Record<string, string[]> = {};
		let cursor: string | null = snapClass(first);
		ids.forEach((id, i) => {
			if (cursor === null) return;
			const n = blockOf(id);
			const window = n === null ? undefined : blockWindows.find((w) => w.n === n);
			let start = cursor;
			if (window !== undefined && start < window.start) start = window.start;
			let snapped = snapClass(start);
			if (snapped === null) return;
			// Batch-only: advance past straddling starts so every placed
			// row is savable (a manual pick in the same spot is refused).
			for (let bump = 0; bump < 400; bump++) {
				const fan = fanout(id, snapped);
				if (fan.length !== rangeDays) return;
				const l = fan[fan.length - 1] as string;
				if (straddleViolation(id, snapped, l) === null) break;
				const advanced = snapClass(addDays(snapped, 1));
				if (advanced === null) return;
				snapped = advanced;
			}
			const dates = fanout(id, snapped);
			const last = dates[dates.length - 1];
			if (
				dates.length === rangeDays &&
				(last ?? '') <= (endDate ?? '') &&
				(window === undefined || (snapped >= window.start && (last ?? '') <= window.end))
			) {
				next[id] = dates;
			}
			cursor = i + 1 < ids.length ? snapClass(addDays(snapped, gap)) : null;
		});
		update((draft) => {
			for (const [id, dates] of Object.entries(next)) {
				draft.step4.ranges[id as RangeId] = [...dates];
			}
		});
	}

	function batchQuizzes(first: string) {
		batchWithinBlocks(QUIZ_IDS as readonly string[], first, QUIZ_DAYS);
	}

	function batchPassports(first: string) {
		batchWithinBlocks(passportIds, first, DUE_DAYS, 21);
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
		} else if (current === 'q1') {
			// Batch source: picking the first date auto-fills the series.
			const first = setRange(current as RangeId, date, QUIZ_DAYS);
			if (first !== null) {
				batchQuizzes(first[0] as string);
				placed = first;
			}
		} else if (current === 'pd1') {
			const first = setRange(current as RangeId, date, DUE_DAYS);
			if (first !== null) {
				batchPassports(first[0] as string);
				placed = first;
			}
		} else {
			const days =
				current === 'pcheck' || current === 'wcheck'
					? CHECK_DAYS
					: current.startsWith('q')
						? QUIZ_DAYS
						: DUE_DAYS;
			placed = setRange(current as RangeId, date, days);
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
		return ranges[armed as RangeId] ?? [];
	});
	const hoverPreview = $derived.by<string[]>(() => {
		if (armed === null || hoverStart === null) return [];
		// Single-date picks (and 2-day mock pairs, previewed by start day)
		// preview exactly one day.
		if (isSingleId(armed) || armed.startsWith('mock')) return [hoverStart];
		// Checks preview with the same end-bounded window the setter uses,
		// so the preview can never show days the setter would refuse.
		if ((armed === 'pcheck' || armed === 'wcheck') && endDate !== null) {
			return dueWindowDates(hoverStart, skipSet, endDate);
		}
		const days = armed.startsWith('q') ? QUIZ_DAYS : DUE_DAYS;
		return collectClassDays(hoverStart, days, skipSet);
	});
	const highlighted = $derived([...new Set([...armedDates, ...hoverPreview])]);

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
		const isMock = armed.startsWith('mock');
		const days =
			armed === 'pcheck' || armed === 'wcheck'
				? CHECK_DAYS
				: armed.startsWith('q')
					? QUIZ_DAYS
					: DUE_DAYS;
		const dates: string[] = [];
		const tips: Record<string, string> = {};
		let cursor = startDate;
		while (cursor <= endDate) {
			if (!isWeekend(cursor) && !offSet.has(cursor) && !examSet.has(cursor)) {
				let first: string | null = null;
				let last: string | null = null;
				if (isMock) {
					const second = snapClass(addDays(cursor, 1));
					if (second !== null) {
						first = cursor;
						last = second;
					}
				} else {
					const snapped = snapClass(cursor);
					if (snapped !== null) {
						const fanout =
							armed === 'pcheck' || armed === 'wcheck'
								? dueWindowDates(snapped, skipSet, endDate)
								: collectClassDays(snapped, days, skipSet);
						if (fanout.length === days && (fanout[fanout.length - 1] ?? '') <= endDate) {
							first = fanout[0] as string;
							last = fanout[fanout.length - 1] as string;
						}
					}
				}
				if (first !== null && last !== null) {
					const violation =
						blockViolation(armed, first, last) ??
						orderViolation(armed, first, last) ??
						straddleViolation(armed, first, last);
					if (violation !== null) {
						dates.push(cursor);
						tips[cursor] = violation;
					}
				}
			}
			cursor = addDays(cursor, 1);
		}
		return { dates, tips };
	});
	const disabledDates = $derived([...new Set([...offSet, ...examSet, ...armedGate.dates])]);
	const disabledTooltips = $derived(armedGate.tips);

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
		const rows: Array<{ label: string; value: string }> = [
			{ label: 'First day of school', value: `${startDate} · Periods 1–2 have no class` }
		];
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
						<strong>First day of school</strong> — {startDate} · Periods 1–2 have no class (display only,
						pinned to the start date).
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('offdays')}
							data-testid="wizard-step4.group-offdays"
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['offdays'] ?? false) ? '▾' : '▸'} Days off (imported, read-only) — {offDays.length}
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
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['schoolFest'] ?? false) ? '▾' : '▸'}{isS1
								? ' Sports Day'
								: ' Anniversary & Sports Day'}
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
												><strong>Anniversary</strong> · No class · All grades · {fmt(
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
												><strong>Anniversary makeup date</strong> · Day off · {fmt(
													singles['makeup'] == null ? [] : [singles['makeup'] as string]
												)}
												<span class="ml-1 text-xs text-gray-500">(paired with Anniversary)</span>
												{#if singles['anniv'] == null}<span class="ml-1 text-xs text-gray-500"
														>· Set Anniversary first</span
													>{/if}</span
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
											><strong>Sports Day</strong> · No class · All grades · {sportsOn
												? fmt(singles['sports'] == null ? [] : [singles['sports'] as string])
												: 'off this term'}</span
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
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['schoolTerm'] ?? false) ? '▾' : '▸'}{isS1
								? ' G9 Mocks'
								: ' G9 Mocks · Graduation'}
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
												><strong>G9 Mock {i + 1}</strong> · Grade 9 · {(
													pairs[id as PairId] ?? []
												).join(', ') || 'unset'} (2 days in a row)</span
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
												><strong>Graduation</strong> · No class · Grade 9 only · {fmt(
													singles['grad'] == null ? [] : [singles['grad'] as string]
												)} <span class="ml-1 text-xs text-gray-500">· After Exam 2</span></span
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
				</section>
			{:else}
				<section data-testid="wizard-step4.esl-tab" class="space-y-3">
					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('eslQuiz')}
							data-testid="wizard-step4.group-quiz"
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['eslQuiz'] ?? false) ? '▾' : '▸'} CLIL Quizzes ×6 ({QUIZ_DAYS}-school-day
							windows, one block each)
						</button>
						{#if open['eslQuiz'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								<p class="text-xs text-gray-500">
									Batch-fill: pick Quiz 1, then click a calendar date — all 6 auto-place ~2 weeks
									apart, each inside its own block (Quizzes 1–2 → Block 1, 3–4 → Block 2, 5–6 →
									Block 3), skipping weekends, days off and exam days. Each row stays adjustable
									after.
								</p>
								<Button
									size="sm"
									variant="outline"
									disabled={ranges['q1']?.[0] === undefined}
									onclick={() =>
										ranges['q1']?.[0] !== undefined && batchQuizzes(ranges['q1'][0] as string)}
									data-testid="wizard-step4.quiz-batchfill"
								>
									Auto-place from Quiz 1
								</Button>
								{#each QUIZ_IDS as id, i (id)}
									<div
										data-testid={`wizard-step4.row-${id}`}
										class="rounded border p-2 text-sm {armed === id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span>
												<strong>Quiz {i + 1}</strong> · CLIL · {fmt(ranges[id])} · Block {blockOf(
													id
												)}
												{#if id === 'q1'}<span class="ml-1 text-xs text-emerald-700"
														>(batch start)</span
													>{/if}
											</span>
											{#if armed === id}
												<span
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>{isBatchSource(id) ? 'Batch start ✓' : 'Placing ✓'}</span
												>
											{:else}
												<Button size="sm" variant="outline" onclick={() => arm(id)}>
													{id === 'q1' ? 'Set batch start' : 'Set window'}
												</Button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('eslDues')}
							data-testid="wizard-step4.group-dues"
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['eslDues'] ?? false) ? '▾' : '▸'} Passport & Recording Dues ({isS1 ? '3' : '2'} each
							this term)
						</button>
						{#if open['eslDues'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								<p class="text-xs text-gray-500">
									Batch-fill: pick Passport Due 1, then click a calendar date — the remaining dues
									place ~3 weeks apart, each inside its own block, skipping weekends, days off and
									exam days.
									{#if isS1}S2 drops to 2 dues (Grade 9 graduates).{/if}
								</p>
								<Button
									size="sm"
									variant="outline"
									disabled={ranges['pd1']?.[0] === undefined}
									onclick={() =>
										ranges['pd1']?.[0] !== undefined && batchPassports(ranges['pd1'][0] as string)}
									data-testid="wizard-step4.passport-batchfill"
								>
									Auto-place from Passport Due 1
								</Button>
								{#each passportIds as id, i (id)}
									<div
										data-testid={`wizard-step4.row-${id}`}
										class="rounded border p-2 text-sm {armed === id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span>
												<strong>Passport Due {i + 1}</strong> · Communication · {fmt(
													ranges[id as RangeId]
												)} · Block
												{blockOf(id)}
												{#if id === 'pd1'}<span class="ml-1 text-xs text-emerald-700"
														>(batch start)</span
													>{/if}
											</span>
											{#if armed === id}
												<span
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>{isBatchSource(id) ? 'Batch start ✓' : 'Placing ✓'}</span
												>
											{:else}
												<Button size="sm" variant="outline" onclick={() => arm(id)}>
													{id === 'pd1' ? 'Set batch start' : 'Set window'}
												</Button>
											{/if}
										</div>
									</div>
								{/each}
								{#each recordingIds as id, i (id)}
									<div
										data-testid={`wizard-step4.row-${id}`}
										class="rounded border p-2 text-sm {armed === id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>Recording Due {i + 1}</strong> · Communication · {fmt(
													ranges[id as RangeId]
												)} · Block {blockOf(id)}</span
											>
											{#if armed === id}
												<span
													class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
													>Placing ✓</span
												>
											{:else}
												<Button size="sm" variant="outline" onclick={() => arm(id)}>
													Set window
												</Button>
											{/if}
										</div>
									</div>
								{/each}
								{#if !isS1}
									<p class="text-xs text-gray-500">
										Grade 9 graduated — only 2 passport / 2 recording dues in S2.
									</p>
								{/if}
							</div>
						{/if}
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('eslCheck')}
							data-testid="wizard-step4.group-checks"
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['eslCheck'] ?? false) ? '▾' : '▸'} End-of-term Checks (5-school-day windows, Block
							3 only)
						</button>
						{#if open['eslCheck'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								{#each [{ id: 'pcheck', label: 'Passport Check', where: 'Communication' }, { id: 'wcheck', label: 'Workbook Check', where: 'CLIL' }] as row (row.id)}
									<div
										data-testid={`wizard-step4.row-${row.id}`}
										class="rounded border p-2 text-sm {armed === row.id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>{row.label}</strong> · {row.where} · {fmt(
													ranges[row.id as RangeId]
												)} · Block 3</span
											>
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
				</section>
			{/if}

			<section data-testid="wizard-step4.summary" class="rounded-lg border bg-white p-4">
				<h2 class="mb-2 text-sm font-semibold text-gray-800">Summary (read-only, nothing saved)</h2>
				<ul class="space-y-1 text-sm text-gray-700">
					{#each summary as row, i (`${i}-${row.label}`)}
						<li><strong>{row.label}:</strong> {row.value}</li>
					{/each}
				</ul>
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
				{highlighted}
				{disabledDates}
				{disabledTooltips}
				onDateClick={onCalendarClick}
				onDateHover={(date) => (hoverStart = date)}
				testId="wizard-step4-calendar"
			/>
		</div>
	</div>
</div>
