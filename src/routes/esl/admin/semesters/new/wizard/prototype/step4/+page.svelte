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
	 * Local state only — mock semester context, three mock exam anchors, no
	 * Convex calls, nothing is saved. Discarded after promotion; only the
	 * settled components (CalendarPreview, wizard-dates) are reused as-is.
	 */

	const today = new Date().toISOString().slice(0, 10);
	const GRADES = ['all', 'G7', 'G8', 'G9', 'H1'] as const;
	type Grade = (typeof GRADES)[number];

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

	// Three confirmed mock exam ranges anchoring the exam-period windows.
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
	// Reminder ranges skip weekends, off days AND exam days.
	const skipSet = $derived(new Set([...offSet, ...examSet]));

	// ---- event state (all local, reset on term switch) ----
	const mockCount = $derived(term === 'S1' ? 2 : 3);
	const dueCount = $derived(term === 'S1' ? 3 : 2);

	let singles = $state<Record<string, string | null>>({});
	let pairs = $state<Record<string, string[]>>({});
	let ranges = $state<Record<string, string[]>>({});
	let targets = $state<Record<string, Grade>>({ anniv: 'all', sports: 'all' });
	let sportsOn = $state(true);
	let open = $state<Record<string, boolean>>({ schoolFest: true, eslQuiz: true });

	function resetEvents() {
		singles = {};
		pairs = {};
		ranges = {};
		targets = { anniv: 'all', sports: 'all' };
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

	function setSingle(id: string, date: string) {
		if (isWeekend(date) || offSet.has(date) || examSet.has(date)) return;
		if (date < startDate || date > endDate) return;
		singles = { ...singles, [id]: date };
	}

	function setPair(id: string, date: string) {
		if (isWeekend(date) || offSet.has(date) || examSet.has(date)) return;
		const second = snapClass(addDays(date, 1));
		if (second === null) return;
		pairs = { ...pairs, [id]: [date, second] };
	}

	function setRange(id: string, date: string, days: number): boolean {
		const snapped = snapClass(date);
		if (snapped === null) return false;
		const dates = collectClassDays(snapped, days, skipSet);
		if (dates.length < days) return false;
		const last = dates[dates.length - 1];
		if (last === undefined || last > endDate) return false;
		ranges = { ...ranges, [id]: dates };
		return true;
	}

	// Batch-fill: space `count` starts ~2 weeks apart from `first`, snapping
	// to class days (skipping weekends/off/exam days); each fills its range.
	function batchSpace(ids: string[], first: string, rangeDays: number, gap = 14) {
		const starts: string[] = [];
		let cursor: string | null = snapClass(first);
		for (let i = 0; i < ids.length && cursor !== null; i++) {
			starts.push(cursor);
			cursor = i + 1 < ids.length ? snapClass(addDays(cursor, gap)) : null;
		}
		const next = { ...ranges };
		starts.forEach((start, i) => {
			const id = ids[i];
			if (id === undefined) return;
			const dates = collectClassDays(start, rangeDays, skipSet);
			if (dates.length === rangeDays && (dates[dates.length - 1] ?? '') <= endDate)
				next[id] = dates;
		});
		ranges = next;
	}

	const quizIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
	const passportIds = $derived(term === 'S1' ? ['pd1', 'pd2', 'pd3'] : ['pd1', 'pd2']);
	const recordingIds = $derived(term === 'S1' ? ['rd1', 'rd2', 'rd3'] : ['rd1', 'rd2']);
	const QUIZ_DAYS = 3;
	const DUE_DAYS = 3;
	const CHECK_DAYS = 5;

	function batchQuizzes(first: string) {
		batchSpace(quizIds, first, QUIZ_DAYS);
	}

	function batchPassports(first: string) {
		batchSpace(passportIds, first, DUE_DAYS, 21);
	}

	function onCalendarClick(date: string) {
		if (armed === null) return;
		if (['anniv', 'makeup', 'sports', 'spring', 'grad'].includes(armed)) {
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
	const disabledDates = $derived([...new Set([...offSet, ...examSet])]);

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
	const mockIds = $derived(Array.from({ length: mockCount }, (_, i) => `mock${i + 1}`));

	// Read-only summary of every set event.
	const summary = $derived.by(() => {
		const rows: Array<{ label: string; value: string }> = [
			{ label: 'First day of school (start_school)', value: `${startDate} · P1–P2 no_class effect` }
		];
		const s = (label: string, id: string) => {
			const v = singles[id];
			if (v != null) rows.push({ label, value: v });
		};
		s('Anniversary (no_class)', 'anniv');
		s('Anniversary makeup (no_school)', 'makeup');
		if (sportsOn) s('Sports Day (no_class)', 'sports');
		if (!isS1) s('Spring Break (no_school)', 'spring');
		for (const id of mockIds) {
			const d = pairs[id];
			if (d !== undefined && d.length > 0)
				rows.push({ label: `G9 Mock ${id.slice(4)}`, value: d.join(', ') });
		}
		if (!isS1) s('Graduation (no_class G9)', 'grad');
		quizIds.forEach((id, i) => {
			const d = ranges[id];
			if (d !== undefined && d.length > 0)
				rows.push({ label: `CLIL Quiz ${i + 1} (reminder/quiz → CLIL)`, value: fmt(d) });
		});
		passportIds.forEach((id, i) => {
			const d = ranges[id];
			if (d !== undefined && d.length > 0)
				rows.push({ label: `Passport Due ${i + 1} (reminder/passport → Comm)`, value: fmt(d) });
		});
		recordingIds.forEach((id, i) => {
			const d = ranges[id];
			if (d !== undefined && d.length > 0)
				rows.push({ label: `Recording Due ${i + 1} (reminder/recording → Comm)`, value: fmt(d) });
		});
		if (ranges['pcheck'] !== undefined)
			rows.push({
				label: 'Passport Check (reminder/passport_check → Comm)',
				value: fmt(ranges['pcheck'])
			});
		if (ranges['wcheck'] !== undefined)
			rows.push({
				label: 'Workbook Check (reminder/workbook_check → CLIL)',
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
			{schoolYear} context ({startDate} → {endDate}), three mock exam anchors, nothing is saved.
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

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
		<div class="min-w-0 space-y-4">
			{#if tab === 'school'}
				<section data-testid="wizard-step4.school-tab" class="space-y-3">
					<div
						data-testid="wizard-step4.start-school"
						class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900"
					>
						<strong>First day of school</strong> (start_school, auto) — {startDate} · P1–P2 no_class effect
						(display only, pinned to the start date).
					</div>

					<div class="rounded border bg-white">
						<button
							type="button"
							onclick={() => toggle('offdays')}
							data-testid="wizard-step4.group-offdays"
							class="w-full px-3 py-2 text-left text-sm font-semibold text-gray-800"
						>
							{(open['offdays'] ?? false) ? '▾' : '▸'} Off days (imported, read-only) — {offDays.length}
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
											><strong>Anniversary</strong> · no_class · {fmt(
												singles['anniv'] == null ? [] : [singles['anniv'] as string]
											)}</span
										>
										<span class="flex items-center gap-2">
											<label class="text-xs text-gray-600">
												Target
												<select
													data-testid="wizard-step4.anniv-target"
													bind:value={targets['anniv']}
													class="ml-1 rounded border px-1 py-0.5 text-xs"
												>
													{#each GRADES as g (g)}
														<option value={g}>{g === 'all' ? 'All grades' : g}</option>
													{/each}
												</select>
											</label>
											<Button size="sm" variant="outline" onclick={() => arm('anniv')}>
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
											><strong>Makeup day</strong> · no_school · {fmt(
												singles['makeup'] == null ? [] : [singles['makeup'] as string]
											)}</span
										>
										<Button size="sm" variant="outline" onclick={() => arm('makeup')}>
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
											><strong>Sports Day</strong> · no_class · {sportsOn
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
											<label class="text-xs text-gray-600">
												Target
												<select
													data-testid="wizard-step4.sports-target"
													bind:value={targets['sports']}
													class="ml-1 rounded border px-1 py-0.5 text-xs"
												>
													{#each GRADES as g (g)}
														<option value={g}>{g === 'all' ? 'All grades' : g}</option>
													{/each}
												</select>
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
							{(open['schoolTerm'] ?? false) ? '▾' : '▸'} Spring Break · G9 Mocks · Graduation
						</button>
						{#if open['schoolTerm'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								{#if isS1}
									<p
										data-testid="wizard-step4.row-spring-absent"
										class="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500"
									>
										<strong>Spring Break</strong> · no_school — absent in S1 (S2 only).
									</p>
								{:else}
									<div
										data-testid="wizard-step4.row-spring"
										class="rounded border p-2 text-sm {armed === 'spring'
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>Spring Break</strong> · no_school · {fmt(
													singles['spring'] == null ? [] : [singles['spring'] as string]
												)}</span
											>
											<Button size="sm" variant="outline" onclick={() => arm('spring')}>
												{armed === 'spring' ? 'Disarm' : 'Set date'}
											</Button>
										</div>
									</div>
								{/if}
								{#each mockIds as id, i (`${term}-${id}`)}
									<div
										data-testid={`wizard-step4.row-${id}`}
										class="rounded border p-2 text-sm {armed === id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>G9 Mock {i + 1}</strong> · g9_mock · {(pairs[id] ?? []).join(
													', '
												) || 'unset'} (2 consecutive days)</span
											>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : 'Set dates'}
											</Button>
										</div>
									</div>
								{/each}
								{#if isS1}
									<p
										data-testid="wizard-step4.row-grad-absent"
										class="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500"
									>
										<strong>Graduation</strong> · no_class G9 — absent in S1 (S2 only).
									</p>
								{:else}
									<div
										data-testid="wizard-step4.row-grad"
										class="rounded border p-2 text-sm {armed === 'grad'
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>Graduation</strong> · no_class · target locked G9 · {fmt(
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
							{(open['eslQuiz'] ?? false) ? '▾' : '▸'} CLIL Quizzes ×6 (reminder/quiz → CLIL, {QUIZ_DAYS}-school-day
							ranges)
						</button>
						{#if open['eslQuiz'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								<p class="text-xs text-gray-500">
									Batch-fill: arm Quiz 1, then click a calendar date — all 6 auto-space ~2 weeks
									apart across P1–P3, skipping weekends/off/exam days. Each row stays adjustable
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
									Auto-space from Quiz 1
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
												<strong>Quiz {i + 1}</strong> · quiz → CLIL (locked) · {fmt(ranges[id])}
												{#if id === 'q1'}<span class="ml-1 text-xs text-emerald-700"
														>(batch source)</span
													>{/if}
											</span>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : id === 'q1' ? 'Batch-fill…' : 'Set range'}
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
									Batch-fill: arm Passport Due 1, then click a calendar date — the remaining dues
									place ~3 weeks apart in the exam periods, skipping weekends/off/exam days.
									{#if isS1}S2 drops to 2 dues (G9 graduated).{/if}
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
												<strong>Passport Due {i + 1}</strong> · passport → Comm (locked) · {fmt(
													ranges[id]
												)}
												{#if id === 'pd1'}<span class="ml-1 text-xs text-emerald-700"
														>(batch source)</span
													>{/if}
											</span>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : id === 'pd1' ? 'Batch-fill…' : 'Set range'}
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
												><strong>Recording Due {i + 1}</strong> · recording → Comm (locked) · {fmt(
													ranges[id]
												)}</span
											>
											<Button size="sm" variant="outline" onclick={() => arm(id)}>
												{armed === id ? 'Disarm' : 'Set range'}
											</Button>
										</div>
									</div>
								{/each}
								{#if !isS1}
									<p class="text-xs text-gray-500">
										G9 graduated — only 2 passport / 2 recording dues in S2.
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
							{(open['eslCheck'] ?? false) ? '▾' : '▸'} Final-period Checks (5-school-day ranges)
						</button>
						{#if open['eslCheck'] ?? false}
							<div class="space-y-2 px-3 pb-3">
								{#each [{ id: 'pcheck', label: 'Passport Check', kind: 'passport_check → Comm' }, { id: 'wcheck', label: 'Workbook Check', kind: 'workbook_check → CLIL' }] as row (row.id)}
									<div
										data-testid={`wizard-step4.row-${row.id}`}
										class="rounded border p-2 text-sm {armed === row.id
											? 'border-emerald-500 bg-emerald-50'
											: 'border-gray-200'}"
									>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												><strong>{row.label}</strong> · reminder/{row.kind} (locked) · {fmt(
													ranges[row.id]
												)}</span
											>
											<Button size="sm" variant="outline" onclick={() => arm(row.id)}>
												{armed === row.id ? 'Disarm' : 'Set range'}
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
			<h2 class="mb-2 text-sm font-semibold text-gray-800">
				{armed === null
					? 'Arm an event row (click its button), then click a calendar date to set it'
					: armed === 'q1'
						? 'Quiz 1 armed — click a date: Quiz 1 sets, all 6 auto-space (batch-fill)'
						: armed === 'pd1'
							? 'Passport Due 1 armed — click a date: Due 1 sets, the rest auto-place (batch-fill)'
							: `${armed} armed — click a class day to set it`}
			</h2>
			<p class="mb-2 text-xs text-gray-500">
				Exam anchors: {anchors.map((a) => `${a.label} ${a.dates.join(', ')}`).join(' · ')}. Off/exam
				days are unpickable; reminder ranges exclude exam days.
			</p>
			<CalendarPreview
				{weeks}
				interactive
				{highlighted}
				{disabledDates}
				onDateClick={onCalendarClick}
				onDateHover={(date) => (hoverStart = date)}
				testId="wizard-step4.calendar"
			/>
		</div>
	</div>
</div>
