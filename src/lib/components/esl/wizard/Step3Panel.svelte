<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import CalendarPreview from './CalendarPreview.svelte';
	import ExamRangePicker from './ExamRangePicker.svelte';
	import type { WizardState } from './wizard-state';
	import {
		EXAM_SLOT_CLASS_DAYS,
		type ExamSlot,
		buildPreviewWeeks,
		collectClassDays,
		collectClassDaysBackward,
		examOrderViolation,
		isWeekend,
		mockOffDays,
		type MockOffDay
	} from './wizard-dates';

	/**
	 * Step 3 of the semester-setup wizard (ticket #221, spec #215 stories
	 * 16–20): click-to-set exam ranges on the semester calendar.
	 *
	 * - Exam 1: 2 class days (required)
	 * - Exam 2: 2 class days (required)
	 * - Final: 3 class days (required unless Step 2's "last exam day" is checked)
	 *
	 * Uses the same dialog-free click-to-set model as the prototype:
	 * hover a free day → preview fan-out; click → confirm dialog → sets range.
	 * Order gate (Exam 1 < Exam 2 < Final) and overflow gate (range must stay
	 * inside [startDate, endDate]) are enforced by disabling violating starts.
	 */

	let {
		state: wizardState,
		update
	}: {
		state: WizardState;
		update: (mutate: (draft: WizardState) => void) => void;
	} = $props();

	const term = $derived(wizardState.step1.term);
	const schoolYear = $derived(wizardState.step1.schoolYear);
	const startDate = $derived(wizardState.step1.startDate);
	const endDate = $derived(wizardState.step2?.endDate);
	const step2OffDays = $derived(wizardState.step2?.offDays ?? []);
	const lastExamDay = $derived(wizardState.step2?.lastExamDay ?? false);
	const exams = $derived(wizardState.step3?.exams ?? []);

	// Use mock off days for now; Step 2 (#220) will wire real gov import
	const offDays: MockOffDay[] =
		step2OffDays.length > 0
			? step2OffDays
			: term && schoolYear && startDate && endDate
				? mockOffDays(term, schoolYear, startDate, endDate)
				: [];
	const offDates = $derived(new Set(offDays.map((day) => day.date)));

	// Active exam slot being configured
	let activeExam = $state<ExamSlot>('Exam 1');
	const rangeLength = $derived(EXAM_SLOT_CLASS_DAYS[activeExam]);

	// Derived: confirmed dates of other exams (for blocking)
	const blockedDates = $derived.by(() =>
		exams.filter((exam) => exam.label !== activeExam).flatMap((exam) => exam.dates)
	);

	// Overflow starts: free class-day starts whose fan-out would end past endDate
	const overflowStarts = $derived.by(() => {
		const out: string[] = [];
		if (!startDate || !endDate) return out;
		let cursor = startDate;
		for (let i = 0; i < 400 && cursor <= endDate; i++) {
			if (!isWeekend(cursor) && !offDates.has(cursor)) {
				const fanned = collectClassDays(cursor, rangeLength, offDates);
				const last = fanned[fanned.length - 1];
				if (last === undefined || last > endDate) out.push(cursor);
			}
			cursor = addDays(cursor, 1);
		}
		return out;
	});

	// Order violations: free starts whose fan-out would break Exam 1 < Exam 2 < Final
	const orderViolations = $derived.by(() => {
		const dates: string[] = [];
		const tooltips: Record<string, string> = {};
		if (!startDate || !endDate || startDate > endDate) return { dates, tooltips };

		const others: { label: ExamSlot; first: string; last: string }[] = exams
			.filter((exam) => exam.label !== activeExam && exam.dates.length > 0)
			.map((exam) => ({
				label: exam.label,
				first: exam.dates[0],
				last: exam.dates[exam.dates.length - 1]
			}));

		if (others.length === 0) return { dates, tooltips };

		let cursor = startDate;
		for (let i = 0; i < 400 && cursor <= endDate; i++) {
			if (!isWeekend(cursor) && !offDates.has(cursor) && !blockedDates.includes(cursor)) {
				const fanned = collectClassDays(cursor, rangeLength, offDates);
				const first = fanned[0];
				const last = fanned[fanned.length - 1];
				if (first !== undefined && last !== undefined) {
					const violation = examOrderViolation(activeExam, first, last, others);
					if (violation !== null) {
						dates.push(cursor);
						tooltips[cursor] = `${cursor} would break the exam order — ${violation}`;
					}
				}
			}
			cursor = addDays(cursor, 1);
		}
		return { dates, tooltips };
	});

	const examDisabledDates = $derived([
		...blockedDates,
		...overflowStarts,
		...orderViolations.dates
	]);

	const examDisabledTooltips = $derived({
		...orderViolations.tooltips,
		...Object.fromEntries(
			overflowStarts.map((date) => [
				date,
				`${date} would extend past the last school day — pick an earlier start`
			])
		)
	});

	// Hover preview
	let hoverStart = $state<string | null>(null);
	const hoverHighlight = $derived(
		hoverStart === null ? [] : collectClassDays(hoverStart, rangeLength, offDates)
	);

	const activeExamDates = $derived(exams.find((exam) => exam.label === activeExam)?.dates ?? []);

	// All required exams set?
	const requiredSlots: ExamSlot[] = lastExamDay
		? ['Exam 1', 'Exam 2']
		: ['Exam 1', 'Exam 2', 'Final'];
	const allRequiredSet = $derived(
		requiredSlots.every((slot) =>
			exams.some((exam) => exam.label === slot && exam.dates.length > 0)
		)
	);

	// Preview weeks for calendar
	const weeks = $derived(
		startDate && endDate
			? buildPreviewWeeks(
					startDate,
					endDate,
					offDays,
					exams.map((exam) => ({ label: exam.label, dates: exam.dates }))
				)
			: []
	);

	// Final auto-default (recomputes until user touches Final)
	let finalTouched = $state(false);

	// Watch for step changes to reset finalTouched when re-entering step 3
	// (In real wizard, this would be handled by the shell's forward flow)
	$effect(() => {
		if (!startDate || !endDate || startDate > endDate) return;
		if (finalTouched) return;
		if (lastExamDay) return; // No Final needed

		const wanted = collectClassDaysBackward(
			endDate,
			EXAM_SLOT_CLASS_DAYS.Final,
			offDates,
			startDate
		);
		if (wanted.length === 0) return;

		const takenByOthers = exams
			.filter((exam) => exam.label !== 'Final')
			.flatMap((exam) => exam.dates);
		if (wanted.some((date) => takenByOthers.includes(date))) return;

		// Order check for auto-default
		if (
			examOrderViolation(
				'Final',
				wanted[0],
				wanted[wanted.length - 1],
				exams
					.filter((exam) => exam.label !== 'Final' && exam.dates.length > 0)
					.map((exam) => ({
						label: exam.label,
						first: exam.dates[0],
						last: exam.dates[exam.dates.length - 1]
					}))
			) !== null
		)
			return;

		const current = exams.find((exam) => exam.label === 'Final');
		if (current !== undefined && current.dates.join(',') === wanted.join(',')) return;

		update((draft) => {
			draft.step3.exams = [
				...draft.step3.exams.filter((exam) => exam.label !== 'Final'),
				{ label: 'Final' as ExamSlot, dates: wanted }
			].sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
		});
	});

	function addDays(date: string, n: number): string {
		const DAY_MS = 86_400_000;
		return new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY_MS)
			.toISOString()
			.slice(0, 10);
	}

	function weekdayLabel(date: string): string {
		const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		return labels[new Date(`${date}T00:00:00Z`).getUTCDay()];
	}

	function formatDateRange(dates: string[]): string {
		if (dates.length === 0) return '';
		const monthNames = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		];
		const formatOne = (date: string) => {
			const month = monthNames[Number(date.slice(5, 7)) - 1];
			const day = Number(date.slice(8, 10));
			return `${month} ${day}`;
		};
		if (dates.length === 1) return `${weekdayLabel(dates[0])} ${formatOne(dates[0])}`;
		return `${weekdayLabel(dates[0])} ${formatOne(dates[0])} – ${weekdayLabel(dates[dates.length - 1])} ${formatOne(dates[dates.length - 1])}`;
	}

	// Confirm dialog state
	let confirmDialog = $state<{ show: boolean; dates: string[] } | null>(null);

	function setExamDate(date: string): void {
		// Guards (also enforced by disabled dates, but defense in depth)
		if (blockedDates.includes(date)) return;
		if (!startDate || !endDate) return;
		if (date < startDate || date > endDate) return;

		const dates = collectClassDays(date, rangeLength, offDates);
		if (dates.length === 0 || dates.some((d) => blockedDates.includes(d))) return;
		if (dates[0] < startDate || dates[dates.length - 1] > endDate) return;

		// Order gate
		if (
			examOrderViolation(
				activeExam,
				dates[0],
				dates[dates.length - 1],
				exams
					.filter((exam) => exam.label !== activeExam && exam.dates.length > 0)
					.map((exam) => ({
						label: exam.label,
						first: exam.dates[0],
						last: exam.dates[exam.dates.length - 1]
					}))
			) !== null
		)
			return;

		// Show confirm dialog
		confirmDialog = { show: true, dates };
	}

	function confirmSetExam(): void {
		if (!confirmDialog) return;
		const { dates } = confirmDialog;
		update((draft) => {
			draft.step3.exams = [
				...draft.step3.exams.filter((exam) => exam.label !== activeExam),
				{ label: activeExam, dates }
			].sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
		});
		if (activeExam === 'Final') finalTouched = true;
		confirmDialog = null;
	}

	function cancelConfirm(): void {
		confirmDialog = null;
	}

	function removeExam(label: ExamSlot): void {
		if (label === 'Final') finalTouched = true;
		update((draft) => {
			draft.step3.exams = draft.step3.exams.filter((exam) => exam.label !== label);
		});
	}

	function confirmStep(): void {
		update((draft) => {
			draft.currentStep = 4;
		});
	}
</script>

<div data-testid="wizard.step-3-panel" class="space-y-4">
	<!-- Exam tabs -->
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm font-medium text-gray-700">Setting:</span>
		{#each ['Exam 1', 'Exam 2', 'Final'] as slot (slot)}
			{@const isRequired = slot !== 'Final' || !lastExamDay}
			{@const done = exams.some((exam) => exam.label === slot && exam.dates.length > 0)}
			<Button
				size="sm"
				variant={activeExam === slot ? 'default' : 'outline'}
				onclick={() => {
					activeExam = slot as 'Exam 1' | 'Exam 2' | 'Final';
					hoverStart = null;
				}}
				disabled={slot === 'Final' && lastExamDay}
				data-testid={`wizard.step-3-tab-${slot.toLowerCase().replace(' ', '-')}`}
			>
				{slot}{isRequired && done ? ' ✓' : ''}{slot === 'Final' && lastExamDay ? ' (skipped)' : ''}
			</Button>
		{/each}
	</div>

	<!-- ExamRangePicker status card -->
	<ExamRangePicker
		examLabel={activeExam}
		{rangeLength}
		currentDates={activeExamDates}
		onClear={() => removeExam(activeExam)}
		testId="wizard.step-3-picker"
	/>

	<!-- Calendar + Exam list side by side -->
	<div class="grid gap-4 lg:grid-cols-[1fr_280px]">
		<div>
			<h2 class="mb-2 text-sm font-semibold text-gray-800">
				Click a class day to set the {activeExam} range ({rangeLength} class days) — reselect anytime
				to move it
			</h2>
			<CalendarPreview
				{weeks}
				interactive
				highlighted={hoverHighlight}
				disabledDates={examDisabledDates}
				disabledTooltips={examDisabledTooltips}
				onDateClick={setExamDate}
				onDateHover={(date) => (hoverStart = date)}
				testId="wizard.step-3-calendar"
			/>
		</div>

		<aside class="space-y-2">
			<h2 class="text-sm font-semibold text-gray-800">Exam dates</h2>
			{#if exams.length === 0}
				<p data-testid="wizard.step-3-exams-empty" class="text-sm text-gray-500">
					No exams set yet.
				</p>
			{:else}
				<ul data-testid="wizard.step-3-exam-list" class="space-y-2">
					{#each ['Exam 1', 'Exam 2', 'Final'] as slot (slot)}
						{@const confirmed = exams.find((exam) => exam.label === slot)}
						<li>
							{#if confirmed !== undefined}
								<div
									data-testid={`wizard.step-3-exam-${slot.toLowerCase().replace(' ', '-')}`}
									class="rounded border border-red-200 bg-red-50 p-2 text-sm"
								>
									<div class="flex items-center justify-between gap-2">
										<strong class="text-red-900">{confirmed.label}</strong>
										<button
											type="button"
											onclick={() => removeExam(confirmed.label)}
											data-testid={`wizard.step-3-exam-${slot.toLowerCase().replace(' ', '-')}-remove`}
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
									data-testid={`wizard.step-3-exam-${slot.toLowerCase().replace(' ', '-')}-empty`}
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

	<!-- Confirm dialog for exam range -->
	{#if confirmDialog}
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Confirm ${activeExam} range`}
			data-testid="wizard.step-3-confirm-dialog"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<div class="w-full max-w-md space-y-3 rounded-lg bg-white p-4 shadow-xl">
				<h3
					class="text-base font-semibold text-emerald-900"
					data-testid="wizard.step-3-confirm-dialog.title"
				>
					Confirm {activeExam} range
				</h3>
				<p class="text-sm text-gray-700" data-testid="wizard.step-3-confirm-dialog.message">
					Set {activeExam}: {formatDateRange(confirmDialog.dates)}
				</p>
				<div class="flex justify-end gap-2">
					<Button
						size="sm"
						variant="outline"
						onclick={cancelConfirm}
						data-testid="wizard.step-3-confirm-dialog.cancel"
					>
						Cancel
					</Button>
					<Button
						size="sm"
						onclick={confirmSetExam}
						data-testid="wizard.step-3-confirm-dialog.confirm"
					>
						Set {activeExam}
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Navigation -->
	<div class="flex justify-end gap-2">
		<Button
			variant="outline"
			onclick={() =>
				update((draft) => {
					draft.currentStep = 2;
				})}
			data-testid="wizard.step-3-back"
		>
			Back
		</Button>
		<Button
			disabled={!allRequiredSet}
			onclick={confirmStep}
			data-testid="wizard.step-3-confirm"
			title={allRequiredSet ? undefined : 'Set all required exam ranges first'}
		>
			Confirm — continue to Step 4
		</Button>
	</div>
</div>
