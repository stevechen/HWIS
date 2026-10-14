<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import CalendarPreview from '$lib/components/esl/wizard/CalendarPreview.svelte';
	import ExamRangePicker from '$lib/components/esl/wizard/ExamRangePicker.svelte';
	import WeekPicker from '$lib/components/esl/wizard/WeekPicker.svelte';
	import {
		addDays,
		buildPreviewWeeks,
		collectClassDays,
		defaultEndDate,
		defaultStartDate,
		endPickerMondays,
		isWeekend,
		mockOffDays,
		schoolYearForTerm,
		startPickerMondays,
		suggestSemester,
		type MockOffDay,
		type Term
	} from '$lib/components/esl/wizard/wizard-dates';

	/**
	 * Throwaway Steps 1–3 prototype (ticket #226, spec #215). Local state
	 * only — no Convex calls, mock off days, nothing is saved. The
	 * components above it (WeekPicker, CalendarPreview, ExamRangePicker,
	 * wizard-dates) are real and built to be promoted to the full wizard;
	 * only this page and its mock data are discarded after promotion
	 * (deletion owner: the promotion ticket — see the review note on #226).
	 */

	const today = new Date().toISOString().slice(0, 10);
	const suggestion = suggestSemester(today);

	type Step = 1 | 2 | 3;
	type ExamSlot = 'Exam 1' | 'Exam 2' | 'Final';
	interface SetExam {
		label: ExamSlot;
		dates: string[];
	}

	let step = $state<Step>(1);
	let term = $state<Term>(suggestion.term);
	// Feedback F2: the exact anchor date is the default (a Friday Aug 30
	// stays a Friday); only a weekend anchor rolls to next Monday. Clicking
	// picks that exact date — no snap-to-Monday (deliberate story-10
	// deviation for visual validation).
	// Feedback F8/F9: seed start/end from the same derived school year the
	// pickers render (schoolYearForTerm), NOT suggestion.schoolYear —
	// suggestSemester's Oct–Dec "next fall" year disagrees with the derived
	// pill, which left both pickers with nothing highlighted on load.
	const initialSchoolYear = schoolYearForTerm(suggestion.term, today);
	let startDate = $state(defaultStartDate(suggestion.term, initialSchoolYear));

	const schoolYear = $derived(schoolYearForTerm(term, today));
	const startMondays = $derived(startPickerMondays(term, schoolYear));
	const endMondays = $derived(endPickerMondays(term, schoolYear));

	let endDate = $state(defaultEndDate(suggestion.term, initialSchoolYear));
	let lastExamDay = $state(true);
	let offDays = $state<MockOffDay[]>([]);
	let imported = $state(false);
	let exams = $state<SetExam[]>([]);
	let activeExam = $state<ExamSlot>('Exam 1');
	// Feedback F37: dialog-free — hovering a free day previews the fan-out,
	// clicking SETS it. No pending state exists anywhere on this page.
	let hoverStart = $state<string | null>(null);
	let showSummary = $state(false);

	const offDates = $derived(new Set(offDays.map((day) => day.date)));
	// Feedback F35: the Final TAB always renders so the slot's state is
	// unmistakable (dates, or the reason it is skipped). `slots` below is
	// the REQUIRED set — Final joins it only when the Step-2 box is
	// unchecked — while the tabs iterate ALL_SLOTS.
	const ALL_SLOTS: ExamSlot[] = ['Exam 1', 'Exam 2', 'Final'];
	const finalActive = $derived(!lastExamDay);
	const slots = $derived<ExamSlot[]>(
		finalActive ? ['Exam 1', 'Exam 2', 'Final'] : ['Exam 1', 'Exam 2']
	);
	// Feedback F22: the Final exam renders on the calendar and in the side
	// list exactly like Exam 1/2 whenever its slot is active — tabs, red
	// chips, and RHS rows all iterate `slots`, and the weeks below are
	// built from `visibleExams` so a stale Final never leaks onto the
	// calendar after "last exam day" is re-checked.
	const visibleExams = $derived(exams.filter((exam) => slots.includes(exam.label)));
	const takenDates = $derived(visibleExams.flatMap((exam) => exam.dates));
	const rangeLength = $derived<2 | 3>(activeExam === 'Final' ? 3 : 2);
	// Feedback F37: refuse-by-construction, dialog-free edition. Days
	// confirmed in another exam slot are unpickable in the active tab, and
	// so is any free start whose immediate-set fan-out would CROSS another
	// slot's range — both fold into the disabled-day set, so double-booking
	// is impossible and no conflict note/badges exist. `blockedDates`
	// derives from CONFIRMED ranges only (no pending machinery remains,
	// which also simplifies F23). The real Step 3 ticket (#221) should
	// mirror backend `assertExclusive` (forbid exam-over-exam, not warn)
	// AND adopt this same dialog-free click-to-set model.
	const blockedDates = $derived(
		visibleExams.filter((exam) => exam.label !== activeExam).flatMap((exam) => exam.dates)
	);
	const previewEnd = $derived(takenDates.reduce((max, date) => (date > max ? date : max), endDate));
	// Every class-day start whose N-day fan-out would touch a blocked day
	// renders disabled alongside the blocked days themselves.
	const unpickableDates = $derived.by(() => {
		const out: string[] = [...blockedDates];
		let cursor = startDate;
		for (let guard = 0; cursor <= previewEnd && guard < 400; guard++) {
			if (!isWeekend(cursor) && !offDates.has(cursor) && !out.includes(cursor)) {
				const span = collectClassDays(cursor, rangeLength, offDates);
				if (span.some((date) => blockedDates.includes(date))) out.push(cursor);
			}
			cursor = addDays(cursor, 1);
		}
		return out;
	});
	const hoverHighlight = $derived(
		hoverStart === null ? [] : collectClassDays(hoverStart, rangeLength, offDates)
	);
	const activeExamDates = $derived(exams.find((exam) => exam.label === activeExam)?.dates ?? []);
	// Feedback F37: the Review/advance gate stays — every REQUIRED slot
	// (Exam 1, Exam 2, + Final when active) must hold a range.
	const allRequiredSet = $derived(slots.every((slot) => exams.some((exam) => exam.label === slot)));
	const weeks = $derived(
		buildPreviewWeeks(
			startDate,
			previewEnd,
			offDays,
			visibleExams.map((exam) => ({ label: exam.label, dates: exam.dates }))
		)
	);
	const endBeforeStart = $derived(endDate < startDate);

	function selectTerm(next: Term) {
		if (next === term) return;
		term = next;
		const year = schoolYearForTerm(next, today);
		startDate = defaultStartDate(next, year);
		endDate = defaultEndDate(next, year);
		offDays = [];
		imported = false;
		exams = [];
		activeExam = 'Exam 1';
		hoverStart = null;
	}

	function importMockHolidays() {
		offDays = mockOffDays(term, schoolYear, startDate, endDate);
		imported = true;
	}

	function setExamDate(date: string) {
		// Feedback F37: click SETS the range immediately, replacing any
		// prior range for this slot — no dialog, no pending, no tab advance
		// (the user stays put and watches the red chips + RHS row appear).
		// Defense-in-depth: blocked/colliding days render disabled, so these
		// guards only fire on programmatic clicks. Quietly ignore.
		if (unpickableDates.includes(date)) return;
		const dates = collectClassDays(date, rangeLength, offDates);
		if (dates.length === 0 || dates.some((d) => blockedDates.includes(d))) return;
		exams = [
			...exams.filter((exam) => exam.label !== activeExam),
			{ label: activeExam, dates }
		].sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
	}

	function removeExam(label: ExamSlot) {
		exams = exams.filter((exam) => exam.label !== label);
	}
</script>

<div data-testid="wizard-prototype.root" class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<div>
		<h1 data-testid="wizard-prototype.title" class="text-2xl font-bold text-emerald-900">
			Semester setup — prototype (Steps 1–3)
		</h1>
		<p class="mt-2 text-sm text-gray-600">
			Throwaway UX prototype: local state only, mock holidays, nothing is saved. Step {step} of 3.
		</p>
	</div>

	<ol data-testid="wizard-prototype.steps" class="flex gap-2 text-sm">
		{#each [{ n: 1, label: 'Semester & start' }, { n: 2, label: 'End & holidays' }, { n: 3, label: 'Exams' }] as item (item.n)}
			<li
				data-testid={`wizard-prototype.step-${item.n}-tab`}
				aria-current={step === item.n ? 'step' : undefined}
				class="rounded-full px-3 py-1 font-medium {step === item.n
					? 'bg-emerald-700 text-white'
					: step > item.n
						? 'bg-emerald-100 text-emerald-900'
						: 'bg-gray-100 text-gray-500'}"
			>
				{item.n}. {item.label}
			</li>
		{/each}
	</ol>

	{#if step === 1}
		<section data-testid="wizard-prototype.step-1" class="space-y-4 rounded-lg border bg-white p-4">
			<div
				data-testid="wizard-prototype.suggestion"
				class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
			>
				Suggested: <strong>{suggestion.term} {suggestion.schoolYear}</strong> — {suggestion.reason}
				(today is {today}).
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-gray-700">Term:</span>
				{#each ['S1', 'S2'] as option (option)}
					<Button
						size="sm"
						variant={term === option ? 'default' : 'outline'}
						onclick={() => selectTerm(option as Term)}
						data-testid={`wizard-prototype.term-${option}`}
					>
						{option}
					</Button>
				{/each}
				<span data-testid="wizard-prototype.school-year" class="text-sm text-gray-600">
					{schoolYear}
				</span>
			</div>
			<div>
				<h2 class="mb-2 text-sm font-semibold text-gray-800">
					Pick the start date — the exact day you click becomes the start
				</h2>
				<WeekPicker
					mondays={startMondays}
					selectedDate={startDate}
					snapToMonday={false}
					onPick={(date) => (startDate = date)}
					testId="wizard-prototype.start-picker"
				/>
			</div>
			<p data-testid="wizard-prototype.start-summary" class="text-sm text-gray-700">
				Start date: <strong>{startDate}</strong>
			</p>
			<div class="flex justify-end">
				<Button onclick={() => (step = 2)} data-testid="wizard-prototype.step-1-confirm">
					Confirm — continue to Step 2
				</Button>
			</div>
		</section>
	{/if}

	{#if step === 2}
		<section data-testid="wizard-prototype.step-2" class="space-y-4 rounded-lg border bg-white p-4">
			<!-- Feedback F32: the controls column is flexible (1fr, always
				beyond the old 420px so WeekPicker rows rarely wrap at
				1280px) and the calendar pane shrink-wraps its fixed-width
				grid (auto) — no wide blank gutter on the right. -->
			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
				<div class="space-y-4">
					<div>
						<h2 class="mb-2 text-sm font-semibold text-gray-800">
							{term}
							{schoolYear} · starts {startDate} — pick the end date
						</h2>
						<WeekPicker
							mondays={endMondays}
							selectedDate={endDate}
							snapToMonday={false}
							showWeekNumbers={false}
							onPick={(date) => (endDate = date)}
							testId="wizard-prototype.end-picker"
						/>
					</div>
					{#if endBeforeStart}
						<p
							data-testid="wizard-prototype.end-error"
							class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
						>
							The end date ({endDate}) is before the start ({startDate}) — pick a later date.
						</p>
					{:else}
						<p data-testid="wizard-prototype.end-summary" class="text-sm text-gray-700">
							End date: <strong>{endDate}</strong>
						</p>
					{/if}
					<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
						<input
							type="checkbox"
							bind:checked={lastExamDay}
							data-testid="wizard-prototype.last-exam-day"
							class="size-4 accent-emerald-700"
						/>
						This is also the last exam day (skip separate Final setup)
					</label>
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
						<Button
							size="sm"
							variant="ghost"
							onclick={importMockHolidays}
							data-testid="wizard-prototype.mock-import"
							class="text-gray-600 underline decoration-dotted underline-offset-2"
						>
							{imported ? 'Re-import holidays' : 'Import holidays'}
						</Button>
						<span
							>Optional — mock only, stands in for the gov calendar feed. Skipping is fine: Confirm
							below works without importing.</span
						>
					</div>
					{#if imported}
						<p
							data-testid="wizard-prototype.mock-import-status"
							class="text-xs font-medium text-gray-700"
						>
							{offDays.length} off days imported from the government calendar
						</p>
						<ul
							data-testid="wizard-prototype.mock-offdays"
							class="space-y-0.5 text-xs text-gray-500"
						>
							{#each offDays as day (day.date)}
								<li data-testid={`wizard-prototype.mock-offday-${day.date}`}>
									{day.date} — 🎉 {day.name}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				<div class="min-w-0">
					<h2 class="mb-2 text-sm font-semibold text-gray-800">Semester preview (read-only)</h2>
					<CalendarPreview {weeks} testId="wizard-prototype.preview" />
				</div>
			</div>
			<div class="flex justify-between">
				<Button
					variant="outline"
					onclick={() => (step = 1)}
					data-testid="wizard-prototype.step-2-back"
				>
					Back
				</Button>
				<Button
					disabled={endBeforeStart}
					onclick={() => (step = 3)}
					data-testid="wizard-prototype.step-2-confirm"
				>
					Confirm — continue to Step 3
				</Button>
			</div>
		</section>
	{/if}

	{#if step === 3}
		<section data-testid="wizard-prototype.step-3" class="space-y-4 rounded-lg border bg-white p-4">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-sm font-medium text-gray-700">Setting:</span>
				{#each ALL_SLOTS as slot (slot)}
					{@const done = exams.some((exam) => exam.label === slot)}
					{@const inactive = slot === 'Final' && !finalActive}
					<Button
						size="sm"
						variant={activeExam === slot && !inactive ? 'default' : 'outline'}
						onclick={() => {
							activeExam = slot;
							hoverStart = null;
						}}
						aria-disabled={inactive}
						title={inactive ? 'Final skipped — the term ends on Exam 2' : undefined}
						class={inactive ? 'cursor-not-allowed opacity-50' : undefined}
						data-testid={`wizard-prototype.exam-tab-${slot.replace(' ', '-')}`}
					>
						{slot}{done ? ' ✓' : ''}
					</Button>
				{/each}
			</div>
			{#if lastExamDay}
				<p data-testid="wizard-prototype.final-skipped" class="text-xs text-gray-500">
					Final skipped — the term ends on Exam 2. Uncheck “last exam day” in Step 2 to set a
					separate Final.
				</p>
			{/if}
			{#if activeExam === 'Final' && !finalActive}
				<div
					data-testid="wizard-prototype.final-inactive-panel"
					class="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600"
				>
					<p>
						<strong>Final skipped — the term ends on Exam 2.</strong>
					</p>
					<p>
						To set a separate Final, uncheck “This is also the last exam day” in Step 2, then come
						back here.
					</p>
					<Button
						size="sm"
						variant="outline"
						onclick={() => (step = 2)}
						data-testid="wizard-prototype.final-inactive-back"
					>
						Back to Step 2
					</Button>
				</div>
			{:else}
				<ExamRangePicker
					examLabel={activeExam}
					{rangeLength}
					currentDates={activeExamDates}
					onClear={() => removeExam(activeExam)}
					testId="wizard-prototype.exam-picker"
				/>
			{/if}
			{#if activeExam !== 'Final' || finalActive}
				<div class="grid gap-4 lg:grid-cols-[1fr_260px]">
					<div>
						<h2 class="mb-2 text-sm font-semibold text-gray-800">
							Click a class day to set the {activeExam} range ({rangeLength} class days) — reselect anytime
							to move it
						</h2>
						<CalendarPreview
							{weeks}
							interactive
							highlighted={hoverHighlight}
							disabledDates={unpickableDates}
							onDateClick={setExamDate}
							onDateHover={(date) => (hoverStart = date)}
							testId="wizard-prototype.exam-calendar"
						/>
					</div>
					<aside class="space-y-2">
						<h2 class="text-sm font-semibold text-gray-800">Exam dates</h2>
						{#if visibleExams.length === 0}
							<p data-testid="wizard-prototype.exams-empty" class="text-sm text-gray-500">
								No exams set yet.
							</p>
						{:else}
							<ul data-testid="wizard-prototype.exams-list" class="space-y-2">
								{#each slots as slot (slot)}
									{@const confirmed = exams.find((exam) => exam.label === slot)}
									<li>
										{#if confirmed !== undefined}
											<div
												data-testid={`wizard-prototype.exam-${slot.replace(' ', '-')}`}
												class="rounded border border-red-200 bg-red-50 p-2 text-sm"
											>
												<div class="flex items-center justify-between gap-2">
													<strong class="text-red-900">{confirmed.label}</strong>
													<button
														type="button"
														onclick={() => removeExam(confirmed.label)}
														data-testid={`wizard-prototype.exam-${slot.replace(' ', '-')}-remove`}
														class="text-xs font-medium text-red-700 hover:underline"
													>
														Remove
													</button>
												</div>
												<div class="text-red-800">
													{confirmed.dates.join(', ')}
												</div>
											</div>
										{:else}
											<div
												data-testid={`wizard-prototype.exam-${slot.replace(' ', '-')}-empty`}
												class="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500"
											>
												<strong>{slot}</strong> — not set yet.
											</div>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</aside>
				</div>
			{/if}
			<div class="flex justify-end gap-2">
				<Button
					variant="outline"
					onclick={() => (step = 2)}
					data-testid="wizard-prototype.step-3-back"
				>
					Back
				</Button>
				<span title={allRequiredSet ? undefined : 'Set every required exam range first'}>
					<Button
						disabled={!allRequiredSet}
						onclick={() => (showSummary = true)}
						data-testid="wizard-prototype.finish"
					>
						Review prototype setup…
					</Button>
				</span>
			</div>
		</section>
	{/if}

	{#if showSummary}
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Prototype setup summary"
			data-testid="wizard-prototype.summary-dialog"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<div class="w-full max-w-md space-y-3 rounded-lg bg-white p-4 shadow-xl">
				<h2 class="text-base font-semibold text-emerald-900">
					Prototype setup — nothing was saved
				</h2>
				<ul class="space-y-1 text-sm text-gray-700">
					<li><strong>{term} {schoolYear}</strong> · {startDate} → {endDate}</li>
					<li>
						{offDays.length} mock off days{lastExamDay
							? ' · Final skipped (term ends on Exam 2)'
							: ' · Final set separately'}
					</li>
					{#each visibleExams as exam (exam.label)}
						<li>{exam.label}: {exam.dates.join(', ')}</li>
					{/each}
				</ul>
				<div class="flex justify-end">
					<Button
						size="sm"
						onclick={() => (showSummary = false)}
						data-testid="wizard-prototype.summary-close"
					>
						Back to prototype
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
