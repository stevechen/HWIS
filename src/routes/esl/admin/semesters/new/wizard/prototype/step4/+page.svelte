<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import CalendarPreview from '$lib/components/esl/wizard/CalendarPreview.svelte';
	import {
		addDays,
		buildPreviewWeeks,
		collectClassDays,
		collectClassDaysBackward,
		defaultEndDate,
		defaultStartDate,
		isWeekend,
		mockOffDays,
		schoolYearForTerm,
		type Term
	} from '$lib/components/esl/wizard/wizard-dates';

	/**
	 * Throwaway Step 4 prototype (Events tabs — School / ESL, batch-fill).
	 * Local state only — mock semester context, three mock exam periods, no
	 * Convex calls, nothing is saved. Discarded after promotion; only the
	 * settled components (CalendarPreview, wizard-dates) are reused as-is.
	 *
	 * Feedback F50: no Spring Break row — 4/4 Children's Day + 4/5 Tomb
	 * Sweeping arrive via the gov holiday import, not admin setup.
	 * Feedback F51: no target selector anywhere — no row retains a
	 * meaningful choice (Anniversary/Sports Day are always all grades;
	 * Graduation + G9 mocks are always Grade 9; quizzes are always CLIL;
	 * dues/checks are always Communication), so the control was removed
	 * entirely instead of kept per-row.
	 * Feedback F52: the Anniversary makeup date is PAIRED with Anniversary
	 * and cannot stand alone — disabled until Anniversary is set,
	 * auto-suggested as the next class day when Anniversary is set (the
	 * user can change it after), cleared whenever Anniversary is cleared.
	 * Feedback F54: term-specific rows render only in their term with no
	 * placeholders (Graduation renders in S2 only).
	 * Feedback F55: chronological order gates inside each series (G9 mocks,
	 * quizzes, passport dues, recording dues) reuse the F49 exam-gate
	 * machinery — out-of-order starts render disabled with a naming
	 * tooltip, and the setters quietly refuse them.
	 * Feedback F56: stage gates — Stage 1 = first day of school → Exam 1,
	 * Stage 2 = Exam 1 → Exam 2, Stage 3 = Exam 2 → Final ("Stage 1/2/3"
	 * is the glossary wording, used verbatim in UI). Quizzes 1–2 → Stage 1,
	 * 3–4 → Stage 2, 5–6 → Stage 3; dues Due 1 → Stage 1, Due 2 → Stage 2,
	 * Due 3 → Stage 3 (S2 has 2 dues → Stages 1–2); the two end-of-term
	 * checks → Stage 3 only. Batch-fill places each row inside its stage;
	 * manual picks outside a row's stage render disabled with a tooltip.
	 */

	const today = new Date().toISOString().slice(0, 10);

	type Tab = 'school' | 'esl';

	let term = $state<Term>('S1');
	let tab = $state<Tab>('school');
	let armed = $state<string | null>(null);
	let hoverStart = $state<string | null>(null);

	const schoolYear = $derived(schoolYearForTerm(term, today));
	const startDate = $derived(defaultStartDate(term, schoolYear));
	const endDate = $derived(defaultEndDate(term, schoolYear));
	const offDays = $derived(mockOffDays(term, schoolYear, startDate, endDate));
	const offSet = $derived(new Set(offDays.map((day) => day.date)));

	interface Anchor {
		label: string;
		dates: string[];
	}

	// Three confirmed mock exam ranges anchoring the stage windows.
	const anchors = $derived.by<Anchor[]>(() => {
		const e1 = collectClassDays(addDays(startDate, 28), 2, offSet);
		let e2 = collectClassDays(addDays(startDate, 63), 2, offSet);
		if (e1.length > 0 && e2.length > 0 && e2[0] <= e1[e1.length - 1]) {
			e2 = collectClassDays(addDays(e1[e1.length - 1], 1), 2, offSet);
		}
		let fin = collectClassDaysBackward(endDate, 3, offSet, startDate);
		if (e2.length > 0 && fin.length > 0 && fin[0] <= e2[e2.length - 1]) {
			fin = collectClassDaysBackward(addDays(e2[e2.length - 1], -1), 3, offSet, startDate);
		}
		return [
			{ label: 'Exam 1', dates: e1 },
			{ label: 'Exam 2', dates: e2 },
			{ label: 'Final', dates: fin }
		];
	});
	const examSet = $derived(new Set(anchors.flatMap((a) => a.dates)));
	// Check windows skip weekends, days off AND exam days.
	const skipSet = $derived(new Set([...offSet, ...examSet]));

	// ---- event state (all local, reset on term switch) ----
	const mockCount = $derived(term === 'S1' ? 2 : 3);
	const dueCount = $derived(term === 'S1' ? 3 : 2);

	let singles = $state<Record<string, string | null>>({});
	let pairs = $state<Record<string, string[]>>({});
	let ranges = $state<Record<string, string[]>>({});
	let sportsOn = $state(true);
	let open = $state<Record<string, boolean>>({ schoolFest: true, eslQuiz: true });

	function resetEvents() {
		singles = {};
		pairs = {};
		ranges = {};
		sportsOn = true;
		armed = null;
		hoverStart = null;
	}

	function selectTerm(next: Term) {
		if (next === term) return;
		term = next;
		resetEvents();
	}

	function snapClass(date: string): string | null {
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

	function setSingle(id: string, date: string) {
		// F52 pairing: the makeup date cannot stand alone.
		if (id === 'makeup' && singles['anniv'] == null) return;
		if (isWeekend(date) || offSet.has(date) || examSet.has(date)) return;
		if (date < startDate || date > endDate) return;
		singles = { ...singles, [id]: date };
		// F52 pairing: setting Anniversary auto-suggests the makeup as the
		// next class day after it (the user can change it after).
		if (id === 'anniv') {
			singles = { ...singles, makeup: snapClass(addDays(date, 1)) };
		}
	}

	function clearSingle(id: string) {
		const next = { ...singles, [id]: null };
		// F52 pairing: clearing Anniversary clears the makeup too.
		if (id === 'anniv') {
			next['makeup'] = null;
			if (armed === 'makeup') armed = null;
		}
		singles = next;
	}

	const mockIds = $derived(Array.from({ length: mockCount }, (_, i) => `mock${i + 1}`));
	const quizIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
	const passportIds = $derived(term === 'S1' ? ['pd1', 'pd2', 'pd3'] : ['pd1', 'pd2']);
	const recordingIds = $derived(term === 'S1' ? ['rd1', 'rd2', 'rd3'] : ['rd1', 'rd2']);

	function seriesOf(id: string): { ids: string[]; label: (i: number) => string } | null {
		if (id.startsWith('mock')) return { ids: mockIds, label: (i) => `G9 Mock ${i + 1}` };
		if (id.startsWith('q')) return { ids: quizIds, label: (i) => `Quiz ${i + 1}` };
		if (id.startsWith('pd'))
			return { ids: [...passportIds], label: (i) => `Passport Due ${i + 1}` };
		if (id.startsWith('rd'))
			return { ids: [...recordingIds], label: (i) => `Recording Due ${i + 1}` };
		return null;
	}

	function confirmedRange(id: string): string[] | undefined {
		const stored = id.startsWith('mock') ? pairs[id] : ranges[id];
		return stored !== undefined && stored.length > 0 ? stored : undefined;
	}

	// F55 order gate: `[first, last]` for `id` must sit strictly between
	// the confirmed neighbors in its series, or null when it fits.
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

	interface StageWindow {
		n: number;
		start: string;
		end: string;
		between: string;
	}

	// F56 stage windows derive from the exam anchors: Stage 1 = first day
	// of school → Exam 1 start; Stage 2 = Exam 1 end → Exam 2 start;
	// Stage 3 = Exam 2 end → Final start.
	const stageWindows = $derived.by<StageWindow[]>(() => {
		const e1 = anchors[0]?.dates ?? [];
		const e2 = anchors[1]?.dates ?? [];
		const fin = anchors[2]?.dates ?? [];
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

	// F56: which stage a row belongs to (null = no stage gate). Quizzes
	// 1–2 → Stage 1, 3–4 → Stage 2, 5–6 → Stage 3; dues Due 1 → Stage 1,
	// Due 2 → Stage 2, Due 3 → Stage 3; end-of-term checks → Stage 3 only.
	function stageOf(id: string): number | null {
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

	function stageViolation(id: string, first: string, last: string): string | null {
		const n = stageOf(id);
		if (n === null) return null;
		const window = stageWindows.find((w) => w.n === n);
		if (window === undefined) return null;
		if (first >= window.start && last <= window.end) return null;
		return `${eventLabel(id)} belongs to Stage ${n} — between ${window.between}`;
	}

	function setPair(id: string, date: string) {
		if (isWeekend(date) || offSet.has(date) || examSet.has(date)) return;
		const second = snapClass(addDays(date, 1));
		if (second === null) return;
		if (orderViolation(id, date, second) !== null) return;
		pairs = { ...pairs, [id]: [date, second] };
	}

	function setRange(id: string, date: string, days: number): boolean {
		const snapped = snapClass(date);
		if (snapped === null) return false;
		const dates = collectClassDays(snapped, days, skipSet);
		if (dates.length < days) return false;
		const first = dates[0] as string;
		const last = dates[dates.length - 1] as string;
		if (last > endDate) return false;
		if (stageViolation(id, first, last) !== null) return false;
		if (orderViolation(id, first, last) !== null) return false;
		ranges = { ...ranges, [id]: dates };
		return true;
	}

	// Batch-fill within stage windows (F56): each id lands inside its own
	// stage; rows that no longer fit their stage stay unset.
	function batchWithinStages(ids: string[], first: string, rangeDays: number, gap = 14) {
		const next = { ...ranges };
		let cursor: string | null = snapClass(first);
		ids.forEach((id, i) => {
			if (cursor === null) return;
			const n = stageOf(id);
			const window = n === null ? undefined : stageWindows.find((w) => w.n === n);
			let start = cursor;
			if (window !== undefined && start < window.start) start = window.start;
			const snapped = snapClass(start);
			if (snapped === null) return;
			const dates = collectClassDays(snapped, rangeDays, skipSet);
			const last = dates[dates.length - 1];
			if (
				dates.length === rangeDays &&
				(last ?? '') <= endDate &&
				(window === undefined || (snapped >= window.start && (last ?? '') <= window.end))
			) {
				next[id] = dates;
			}
			cursor = i + 1 < ids.length ? snapClass(addDays(snapped, gap)) : null;
		});
		ranges = next;
	}

	const QUIZ_DAYS = 3;
	const DUE_DAYS = 3;
	const CHECK_DAYS = 5;

	function batchQuizzes(first: string) {
		batchWithinStages(quizIds, first, QUIZ_DAYS);
	}

	function batchPassports(first: string) {
		batchWithinStages(passportIds, first, DUE_DAYS, 21);
	}

	function onCalendarClick(date: string) {
		if (armed === null) return;
		if (['anniv', 'makeup', 'sports', 'grad'].includes(armed)) {
			setSingle(armed, date);
			return;
		}
		if (armed.startsWith('mock')) {
			setPair(armed, date);
			return;
		}
		// Batch sources: picking the first date auto-fills the whole series.
		if (armed === 'q1') {
			if (setRange('q1', date, QUIZ_DAYS)) batchQuizzes(ranges['q1']?.[0] ?? date);
			return;
		}
		if (armed === 'pd1') {
			if (setRange('pd1', date, DUE_DAYS)) batchPassports(ranges['pd1']?.[0] ?? date);
			return;
		}
		const days =
			armed === 'pcheck' || armed === 'wcheck'
				? CHECK_DAYS
				: armed.startsWith('q')
					? QUIZ_DAYS
					: DUE_DAYS;
		setRange(armed, date, days);
	}

	const armedDates = $derived.by<string[]>(() => {
		if (armed === null) return [];
		if (armed in singles) return singles[armed] == null ? [] : [singles[armed] as string];
		if (armed in pairs) return pairs[armed] ?? [];
		return ranges[armed] ?? [];
	});
	const hoverPreview = $derived.by<string[]>(() => {
		if (armed === null || hoverStart === null) return [];
		if (armed in singles || armed.startsWith('mock')) return [hoverStart];
		const days =
			armed === 'pcheck' || armed === 'wcheck'
				? CHECK_DAYS
				: armed.startsWith('q')
					? QUIZ_DAYS
					: DUE_DAYS;
		return collectClassDays(hoverStart, days, skipSet);
	});
	const highlighted = $derived([...new Set([...armedDates, ...hoverPreview])]);

	// F55/F56: per-armed starts disabled by the stage + order gates, with
	// naming tooltips (same refuse-by-construction machinery as F49).
	const armedGate = $derived.by<{ dates: string[]; tips: Record<string, string> }>(() => {
		if (armed === null) return { dates: [], tips: {} };
		const series = seriesOf(armed);
		if (series === null && stageOf(armed) === null) return { dates: [], tips: {} };
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
						const fanout = collectClassDays(snapped, days, skipSet);
						if (fanout.length === days && (fanout[fanout.length - 1] ?? '') <= endDate) {
							first = fanout[0] as string;
							last = fanout[fanout.length - 1] as string;
						}
					}
				}
				if (first !== null && last !== null) {
					const violation =
						stageViolation(armed, first, last) ?? orderViolation(armed, first, last);
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

	const weeks = $derived(buildPreviewWeeks(startDate, endDate, offDays, anchors));

	function fmt(dates: string[] | undefined): string {
		if (dates === undefined || dates.length === 0) return 'unset';
		return dates.length === 1 ? (dates[0] ?? 'unset') : `${dates[0]} → ${dates[dates.length - 1]}`;
	}

	function toggle(id: string) {
		open = { ...open, [id]: !(open[id] ?? false) };
	}

	function arm(id: string) {
		armed = armed === id ? null : id;
		hoverStart = null;
	}

	const isS1 = $derived(term === 'S1');

	// Read-only summary of every set event.
	const summary = $derived.by(() => {
		const rows: Array<{ label: string; value: string }> = [
			{ label: 'First day of school', value: `${startDate} · Periods 1–2 have no class` }
		];
		const s = (label: string, id: string) => {
			const v = singles[id];
			if (v != null) rows.push({ label, value: v });
		};
		s('Anniversary · No class, all grades', 'anniv');
		s('Anniversary makeup date · Day off', 'makeup');
		if (sportsOn) s('Sports Day · No class, all grades', 'sports');
		for (const id of mockIds) {
			const d = pairs[id];
			if (d !== undefined && d.length > 0)
				rows.push({ label: `G9 Mock ${id.slice(4)} · Grade 9`, value: d.join(', ') });
		}
		if (!isS1) s('Graduation · No class, Grade 9 only', 'grad');
		quizIds.forEach((id, i) => {
			const d = ranges[id];
			if (d !== undefined && d.length > 0)
				rows.push({ label: `Quiz ${i + 1} · CLIL · Stage ${stageOf(id)}`, value: fmt(d) });
		});
		passportIds.forEach((id, i) => {
			const d = ranges[id];
			if (d !== undefined && d.length > 0)
				rows.push({
					label: `Passport Due ${i + 1} · Communication · Stage ${stageOf(id)}`,
					value: fmt(d)
				});
		});
		recordingIds.forEach((id, i) => {
			const d = ranges[id];
			if (d !== undefined && d.length > 0)
				rows.push({
					label: `Recording Due ${i + 1} · Communication · Stage ${stageOf(id)}`,
					value: fmt(d)
				});
		});
		if (ranges['pcheck'] !== undefined)
			rows.push({
				label: 'Passport Check · Communication · Stage 3',
				value: fmt(ranges['pcheck'])
			});
		if (ranges['wcheck'] !== undefined)
			rows.push({
				label: 'Workbook Check · CLIL · Stage 3',
				value: fmt(ranges['wcheck'])
			});
		return rows;
	});
</script>

<div data-testid="wizard-step4.root" class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<div>
		<h1 data-testid="wizard-step4.title" class="text-2xl font-bold text-emerald-900">
			Semester setup — Step 4 prototype (Events tabs)
		</h1>
		<p class="mt-2 text-sm text-gray-600">
			Throwaway UX prototype: mock {term}
			{schoolYear} context ({startDate} → {endDate}) with three mock exam periods. Nothing is saved.
		</p>
		<a href="../" data-testid="wizard-step4.back" class="text-sm text-emerald-700 hover:underline">
			← Back to Steps 1–3 prototype
		</a>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm font-medium text-gray-700">Term (mock):</span>
		{#each ['S1', 'S2'] as option (option)}
			<Button
				size="sm"
				variant={term === option ? 'default' : 'outline'}
				onclick={() => selectTerm(option as Term)}
				data-testid={`wizard-step4.term-${option}`}
			>
				{option}
			</Button>
		{/each}
		<span class="text-sm text-gray-600">{schoolYear} · {startDate} → {endDate}</span>
	</div>

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

	<div class="space-y-1">
		<h2 class="text-sm font-semibold text-gray-800">
			{armed === null
				? 'Pick an event row (click its button), then click a calendar date to set it'
				: armed === 'q1'
					? 'Quiz 1 set — click a date: Quiz 1 sets, the rest auto-place in their stages (batch-fill)'
					: armed === 'pd1'
						? 'Passport Due 1 set — click a date: Due 1 sets, the rest auto-place in their stages (batch-fill)'
						: `${eventLabel(armed)} picked — click a school day to set it`}
		</h2>
		<p class="text-xs text-gray-500">
			Days off and exam days can't be picked. Quiz and due windows skip exam days. Stages split the
			term at the exams: Stage 1 runs from the first day of school to Exam 1, Stage 2 from Exam 1 to
			Exam 2, Stage 3 from Exam 2 to the Final.
		</p>
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
							{(open['schoolFest'] ?? false) ? '▾' : '▸'} Anniversary & Sports Day
						</button>
						{#if open['schoolFest'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								<div
									data-testid="wizard-step4.row-anniv"
									class="rounded border p-2 text-sm {armed === 'anniv'
										? 'border-emerald-500 bg-emerald-50'
										: 'border-gray-200'}"
								>
									<div class="flex flex-wrap items-center justify-between gap-2">
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
											<Button
												size="sm"
												variant="outline"
												onclick={() => arm('anniv')}
												data-testid="wizard-step4.anniv-arm"
											>
												{armed === 'anniv' ? 'Disarm' : 'Set date'}
											</Button>
										</span>
									</div>
								</div>
								<div
									data-testid="wizard-step4.row-makeup"
									class="rounded border p-2 text-sm {armed === 'makeup'
										? 'border-emerald-500 bg-emerald-50'
										: 'border-gray-200'}"
								>
									<div class="flex flex-wrap items-center justify-between gap-2">
										<span
											><strong>Anniversary makeup date</strong> · Day off · {fmt(
												singles['makeup'] == null ? [] : [singles['makeup'] as string]
											)}
											{#if singles['anniv'] == null}<span class="ml-1 text-xs text-gray-500"
													>(Set Anniversary first)</span
												>{/if}</span
										>
										<Button
											size="sm"
											variant="outline"
											disabled={singles['anniv'] == null}
											onclick={() => arm('makeup')}
											data-testid="wizard-step4.makeup-arm"
										>
											{armed === 'makeup' ? 'Disarm' : 'Set date'}
										</Button>
									</div>
								</div>
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
													bind:checked={sportsOn}
													data-testid="wizard-step4.sports-toggle"
												/>
												On
											</label>
											<Button
												size="sm"
												variant="outline"
												disabled={!sportsOn}
												onclick={() => arm('sports')}
											>
												{armed === 'sports' ? 'Disarm' : 'Set date'}
											</Button>
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
							{(open['schoolTerm'] ?? false) ? '▾' : '▸'} G9 Mocks · Graduation
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
												><strong>G9 Mock {i + 1}</strong> · Grade 9 · {(pairs[id] ?? []).join(
													', '
												) || 'unset'} (2 days in a row)</span
											>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : 'Set dates'}
											</Button>
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
												)}</span
											>
											<Button size="sm" variant="outline" onclick={() => arm('grad')}>
												{armed === 'grad' ? 'Disarm' : 'Set date'}
											</Button>
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
							windows, one stage each)
						</button>
						{#if open['eslQuiz'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								<p class="text-xs text-gray-500">
									Batch-fill: pick Quiz 1, then click a calendar date — all 6 auto-place ~2 weeks
									apart, each inside its own stage (Quizzes 1–2 → Stage 1, 3–4 → Stage 2, 5–6 →
									Stage 3), skipping weekends, days off and exam days. Each row stays adjustable
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
								{#each quizIds as id, i (id)}
									<div
										data-testid={`wizard-step4.row-${id}`}
										class="rounded border p-2 text-sm {armed === id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span>
												<strong>Quiz {i + 1}</strong> · CLIL · {fmt(ranges[id])} · Stage {stageOf(
													id
												)}
												{#if id === 'q1'}<span class="ml-1 text-xs text-emerald-700"
														>(batch start)</span
													>{/if}
											</span>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : id === 'q1' ? 'Batch-fill…' : 'Set window'}
											</Button>
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
							{(open['eslDues'] ?? false) ? '▾' : '▸'} Passport & Recording Dues ({dueCount} each this
							term)
						</button>
						{#if open['eslDues'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								<p class="text-xs text-gray-500">
									Batch-fill: pick Passport Due 1, then click a calendar date — the remaining dues
									place ~3 weeks apart, each inside its own stage, skipping weekends, days off and
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
												<strong>Passport Due {i + 1}</strong> · Communication · {fmt(ranges[id])} · Stage
												{stageOf(id)}
												{#if id === 'pd1'}<span class="ml-1 text-xs text-emerald-700"
														>(batch start)</span
													>{/if}
											</span>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : id === 'pd1' ? 'Batch-fill…' : 'Set window'}
											</Button>
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
												><strong>Recording Due {i + 1}</strong> · Communication · {fmt(ranges[id])} ·
												Stage {stageOf(id)}</span
											>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : 'Set window'}
											</Button>
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
							{(open['eslCheck'] ?? false) ? '▾' : '▸'} End-of-term Checks (5-school-day windows, Stage
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
												><strong>{row.label}</strong> · {row.where} · {fmt(ranges[row.id])} · Stage 3</span
											>
											<Button size="sm" variant="outline" onclick={() => arm(row.id)}>
												{armed === row.id ? 'Disarm' : 'Set window'}
											</Button>
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
			<CalendarPreview
				{weeks}
				interactive
				{highlighted}
				{disabledDates}
				{disabledTooltips}
				onDateClick={onCalendarClick}
				onDateHover={(date) => (hoverStart = date)}
				testId="wizard-step4.calendar"
			/>
		</div>
	</div>
</div>
