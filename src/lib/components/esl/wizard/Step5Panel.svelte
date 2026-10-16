<script lang="ts">
	import { goto } from '$app/navigation';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isNoteHiddenForEventType } from '$convex/shared/esl';
	import { Button } from '$lib/components/ui/button';
	import { e2eTagFromUrl } from '$lib/e2e-tag';
	import CalendarPreview from './CalendarPreview.svelte';
	import { buildPreviewWeeks, type MockOffDay, type PreviewWeek } from './wizard-dates';
	import { buildPreviewRows, buildSavePayload, type PreviewRow } from './wizard-save';
	import { clearWizardState, type WizardEventEdit, type WizardState } from './wizard-state';

	let {
		state: wizardState,
		update
	}: {
		state: WizardState;
		update: (mutate: (draft: WizardState) => void) => void;
	} = $props();

	const client = useConvexClient();

	// Derived data from previous steps
	const startDate = $derived(wizardState.step1.startDate);
	const endDate = $derived(wizardState.step2?.endDate);
	const offDays: MockOffDay[] = $derived(wizardState.step2?.offDays ?? []);
	const exams = $derived(wizardState.step3?.exams ?? []);

	// Preview rows (Steps 1-5, edits applied) share one builder with the
	// save payload, so preview and saved events can never disagree.
	const unifiedEvents = $derived(buildPreviewRows(wizardState));

	// Calendar preview weeks
	const weeks: PreviewWeek[] = $derived(
		startDate && endDate
			? buildPreviewWeeks(
					startDate,
					endDate,
					offDays,
					exams.map((exam) => ({ label: exam.label, dates: exam.dates }))
				)
			: []
	);

	// UI state
	let showCustomModal = $state(false);
	let customType = $state<'meeting' | 'banner'>('meeting');
	let customDate = $state('');
	let customEndDate = $state('');
	let customTarget = $state<'all' | 'CLIL' | 'Comm' | 'G9' | 'H1'>('all');
	let customSubType = $state<'partial' | 'no_class' | 'task'>('task');
	let customNote = $state('');
	let customBannerText = $state('');
	let editPopover: { event: PreviewRow | null; x: number; y: number } = $state({
		event: null,
		x: 0,
		y: 0
	});
	let editDate = $state('');
	let editEndDate = $state('');
	let editNote = $state('');
	let saveStatus: 'idle' | 'saving' | 'success' | 'error' = $state('idle');
	let saveError = $state<string | null>(null);

	// Custom event ID counter
	let customIdCounter = $state(0);

	function openCustomModal(type: 'meeting' | 'banner' = 'meeting') {
		customType = type;
		customDate = '';
		customEndDate = '';
		customTarget = 'all';
		customSubType = 'task';
		customNote = '';
		customBannerText = '';
		showCustomModal = true;
	}

	function closeCustomModal() {
		showCustomModal = false;
	}

	function addCustomEvent() {
		if (customType === 'meeting') {
			if (!customDate || customNote.trim() === '') return;
			const id = `custom-${++customIdCounter}`;
			update((draft) => {
				draft.step5.customEvents.push({
					id,
					type: 'meeting',
					date: customDate,
					target: customTarget,
					subType: customSubType,
					note: customNote || undefined
				});
			});
		} else {
			if (!customDate || !customEndDate || !customBannerText) return;
			const id = `custom-${++customIdCounter}`;
			update((draft) => {
				draft.step5.customEvents.push({
					id,
					type: 'banner',
					target: customTarget,
					startDate: customDate,
					endDate: customEndDate,
					bannerText: customBannerText
				});
			});
		}
		closeCustomModal();
	}

	/** Calendar → edit (ticket #223): open the first row covering the date. */
	function openCalendarEdit(date: string, event?: MouseEvent) {
		const row = unifiedEvents.find(
			(candidate) => candidate.date <= date && date <= (candidate.endDate ?? candidate.date)
		);
		if (row === undefined) return;
		openEditPopover(row, event?.clientX ?? 0, event?.clientY ?? 0);
	}

	function openEditPopover(event: PreviewRow, clientX: number, clientY: number) {
		if (!event.editable) return;
		editPopover = { event, x: clientX, y: clientY };
		editDate = event.date;
		editEndDate = event.endDate ?? '';
		editNote = event.note ?? '';
	}

	function closeEditPopover() {
		editPopover = { event: null, x: 0, y: 0 };
	}

	function saveEdit() {
		const key = editPopover.event?.key;
		if (key === undefined) return;
		update((draft) => {
			const existingIndex = draft.step5.eventEdits.findIndex((e) => e.eventKey === key);
			const edit: WizardEventEdit = {
				eventKey: key,
				date: editDate || undefined,
				endDate: editEndDate || undefined,
				note: editNote || undefined
			};
			if (existingIndex >= 0) {
				draft.step5.eventEdits[existingIndex] = edit;
			} else {
				draft.step5.eventEdits.push(edit);
			}
		});
		closeEditPopover();
	}

	function removeCustomEvent(customId: string) {
		update((draft) => {
			draft.step5.customEvents = draft.step5.customEvents.filter((c) => c.id !== customId);
			draft.step5.eventEdits = draft.step5.eventEdits.filter(
				(e) => !e.eventKey.startsWith(`custom:${customId}`)
			);
		});
	}

	let savedSemesterId = $state<string | null>(null);
	// Friendly slug for the post-save link (`2026-2027-S1`), from the same
	// Step 1 year + term the save payload carries.
	const savedSlug = $derived(
		wizardState.step1.schoolYear !== null && wizardState.step1.term !== null
			? `${wizardState.step1.schoolYear}-${wizardState.step1.term}`
			: null
	);

	async function saveSemester() {
		saveStatus = 'saving';
		saveError = null;
		savedSemesterId = null;

		try {
			const payload = buildSavePayload(wizardState, e2eTagFromUrl());
			const result = await client.action(api.esl.wizards.saveSemester, payload);

			// Clear wizard state on success; the notice below links onward.
			const storage = typeof window !== 'undefined' ? window.sessionStorage : null;
			clearWizardState(storage);

			savedSemesterId = result.semesterId;
			saveStatus = 'success';
		} catch (err) {
			saveStatus = 'error';
			saveError = err instanceof Error ? err.message : 'Failed to save semester';
		}
	}

	function cancelWizard() {
		const storage = typeof window !== 'undefined' ? window.sessionStorage : null;
		clearWizardState(storage);
		goto('/esl/admin/semesters');
	}

	// Format date for display
	function formatDate(date: string): string {
		const d = new Date(`${date}T00:00:00Z`);
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function formatDateRange(start: string, end: string): string {
		if (start === end) return formatDate(start);
		return `${formatDate(start)} – ${formatDate(end)}`;
	}

	// Event type colors for list
	function getEventColor(event: PreviewRow): string {
		switch (event.type) {
			case 'start_school':
				return 'bg-emerald-100 text-emerald-900 border-emerald-200';
			case 'no_school':
				return 'bg-stone-100 text-stone-900 border-stone-200';
			case 'no_class':
				return 'bg-amber-100 text-amber-900 border-amber-200';
			case 'partial':
				return 'bg-sky-100 text-sky-900 border-sky-200';
			case 'exam':
				return 'bg-red-100 text-red-900 border-red-200';
			case 'reminder':
				if (event.isBanner) return 'bg-purple-100 text-purple-900 border-purple-200';
				if (event.reminderKind === 'quiz') return 'bg-indigo-100 text-indigo-900 border-indigo-200';
				if (event.reminderKind === 'passport' || event.reminderKind === 'recording')
					return 'bg-cyan-100 text-cyan-900 border-cyan-200';
				if (event.reminderKind === 'task') return 'bg-violet-100 text-violet-900 border-violet-200';
				return 'bg-blue-100 text-blue-900 border-blue-200';
			case 'g9_mock':
				return 'bg-orange-100 text-orange-900 border-orange-200';
			default:
				return 'bg-gray-100 text-gray-900 border-gray-200';
		}
	}

	// Target badge
	function getTargetBadge(event: PreviewRow): string {
		if (event.target === 'all') return '';
		return event.target;
	}
</script>

{#snippet eventListItem(event: PreviewRow)}
	<div
		class="cursor-pointer rounded border p-2 text-sm transition-colors hover:bg-gray-50 {getEventColor(
			event
		)}"
		onclick={(e) => openEditPopover(event, e.clientX, e.clientY)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const rect = e.currentTarget.getBoundingClientRect();
				openEditPopover(event, rect.left, rect.bottom);
			}
		}}
		tabindex="0"
		role="button"
		aria-label={`Edit ${event.title} on ${formatDate(event.date)}`}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="truncate font-medium">{event.title}</span>
					{#if event.examGroup}
						<span class="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium"
							>{event.examGroup}</span
						>
					{/if}
					{#if getTargetBadge(event)}
						<span class="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium"
							>{getTargetBadge(event)}</span
						>
					{/if}
					{#if event.customId}
						<span class="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium">Custom</span>
					{/if}
				</div>
				<div class="mt-0.5 text-xs opacity-80">
					{event.endDate && event.endDate !== event.date
						? formatDateRange(event.date, event.endDate)
						: formatDate(event.date)}
					{#if event.note}
						<span class="ml-2">— {event.note}</span>
					{/if}
				</div>
			</div>
			{#if event.customId}
				<button
					type="button"
					class="ml-2 text-xs text-red-600 hover:underline"
					onclick={(e) => {
						e.stopPropagation();
						removeCustomEvent(event.customId!);
					}}
					aria-label={`Remove custom event ${event.title}`}
				>
					Remove
				</button>
			{/if}
		</div>
	</div>
{/snippet}

<div data-testid="wizard.step-5-panel" class="space-y-4">
	<!-- Header with actions -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold text-gray-800">Preview & save</h2>
			<p class="text-sm text-gray-500">
				Review all events, make inline edits, add custom events, then save.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				onclick={() => openCustomModal()}
				data-testid="wizard.step-5-add-custom"
			>
				Add custom event
			</Button>
			<Button variant="outline" onclick={cancelWizard} data-testid="wizard.step-5-cancel">
				Cancel
			</Button>
			<Button
				disabled={saveStatus === 'saving' || unifiedEvents.length === 0}
				onclick={saveSemester}
				data-testid="wizard.step-5-save"
				aria-busy={saveStatus === 'saving'}
			>
				{saveStatus === 'saving' ? 'Saving…' : 'Save semester'}
			</Button>
		</div>
	</div>

	<!-- Save status messages -->
	{#if saveStatus === 'success'}
		<div
			data-testid="wizard.step-5-save-success"
			class="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
			role="alert"
		>
			Semester saved successfully.
			{#if savedSemesterId !== null && savedSlug !== null}
				<a
					href={`/esl/admin/semesters/${savedSlug}`}
					data-testid="wizard.step-5-semester-link"
					class="ml-1 font-medium underline"
				>
					Open the semester
				</a>
			{/if}
		</div>
	{:else if saveStatus === 'error'}
		<div
			class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
			role="alert"
		>
			{saveError}
		</div>
	{/if}

	<!-- Calendar preview + Event list side by side -->
	<div class="grid gap-6 lg:grid-cols-[1fr_380px]">
		<!-- Calendar Preview -->
		<div class="min-w-0">
			<h3 class="mb-2 text-sm font-semibold text-gray-800">Calendar preview</h3>
			<CalendarPreview
				{weeks}
				interactive
				clickableChips
				onDateClick={openCalendarEdit}
				testId="wizard.step-5-calendar"
			/>
		</div>

		<!-- Event List -->
		<aside data-testid="wizard.step-5-event-list" class="max-h-[600px] space-y-3 overflow-y-auto">
			<h3 class="text-sm font-semibold text-gray-800">All events ({unifiedEvents.length})</h3>

			{#if unifiedEvents.length === 0}
				<p class="text-sm text-gray-500">No events configured yet.</p>
			{:else}
				<!-- Grouped by source for clarity -->
				{#each [{ source: 'step1', label: 'Semester' }, { source: 'step2', label: 'Holidays' }, { source: 'step3', label: 'Exams' }, { source: 'step4', label: 'School/ESL events' }, { source: 'step5', label: 'Custom events' }] as group (group.source)}
					{#if unifiedEvents.some((e) => e.source === group.source)}
						<div class="space-y-1">
							<h4 class="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase">
								{group.label}
							</h4>
							{#each unifiedEvents.filter((e) => e.source === group.source) as event (event.key)}
								{@render eventListItem(event)}
							{/each}
						</div>
					{/if}
				{/each}
			{/if}
		</aside>
	</div>

	<!-- Custom Event Modal -->
	{#if showCustomModal}
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Add custom event"
			data-testid="wizard.step-5-custom-modal"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<div class="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
				<h3 class="text-lg font-semibold text-emerald-900">Add custom event</h3>

				<!-- Type selector -->
				<div class="flex gap-2">
					<button
						type="button"
						class="flex-1 rounded border px-3 py-2 text-sm font-medium transition-colors {customType ===
						'meeting'
							? 'border-emerald-700 bg-emerald-700 text-white'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
						onclick={() => (customType = 'meeting')}
					>
						Meeting-specific
					</button>
					<button
						type="button"
						class="flex-1 rounded border px-3 py-2 text-sm font-medium transition-colors {customType ===
						'banner'
							? 'border-emerald-700 bg-emerald-700 text-white'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
						onclick={() => (customType = 'banner')}
					>
						Banner
					</button>
				</div>

				<!-- Meeting-specific fields -->
				{#if customType === 'meeting'}
					<div class="space-y-3">
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Date</label>
							<input
								type="date"
								bind:value={customDate}
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
							/>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Target</label>
							<select
								bind:value={customTarget}
								data-testid="wizard.step-5-custom-target-meeting"
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
							>
								<option value="all">All grades</option>
								<option value="CLIL">CLIL</option>
								<option value="Comm">Communication</option>
								<option value="G9">Grade 9</option>
								<option value="H1">Grade 10</option>
							</select>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Type</label>
							<select
								bind:value={customSubType}
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
							>
								<option value="partial">Partial day (no class for some periods)</option>
								<option value="no_class">No class (all day)</option>
								<option value="task">Task / Reminder</option>
							</select>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Note</label>
							<textarea
								bind:value={customNote}
								rows={3}
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
								placeholder="Required detail text"
							/>
						</div>
					</div>
				{:else}
					<!-- Banner fields: text doubles as the note (spec #215 story 28) -->
					<div class="space-y-3">
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Target</label>
							<select
								bind:value={customTarget}
								data-testid="wizard.step-5-custom-target-banner"
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
							>
								<option value="all">All grades</option>
								<option value="CLIL">CLIL</option>
								<option value="Comm">Communication</option>
								<option value="G9">Grade 9</option>
								<option value="H1">Grade 10</option>
							</select>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Start date</label>
							<input
								type="date"
								bind:value={customDate}
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
							/>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">End date</label>
							<input
								type="date"
								bind:value={customEndDate}
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
							/>
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">Banner text</label>
							<input
								type="text"
								bind:value={customBannerText}
								data-testid="wizard.step-5-custom-text"
								class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
								placeholder="Text to show on the week banner"
							/>
						</div>
					</div>
				{/if}

				<!-- Modal actions -->
				<div class="flex justify-end gap-2 pt-2">
					<Button variant="outline" onclick={closeCustomModal}>Cancel</Button>
					<Button
						disabled={customType === 'meeting'
							? !customDate || customNote.trim() === ''
							: !customDate || !customEndDate || !customBannerText}
						onclick={addCustomEvent}
						data-testid="wizard.step-5-custom-add"
					>
						Add event
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Inline Edit Popover -->
	{#if editPopover.event}
		<div
			data-testid="wizard.step-5-edit-popover"
			class="fixed z-50 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
			style="left: {editPopover.x}px; top: {editPopover.y}px;"
			role="dialog"
			aria-label="Edit event"
		>
			<div class="min-w-[280px] space-y-3">
				<div class="flex items-center justify-between">
					<h4 class="font-medium text-gray-900">{editPopover.event.title}</h4>
					<button
						type="button"
						class="text-gray-400 hover:text-gray-600"
						onclick={closeEditPopover}
						aria-label="Close"
					>
						✕
					</button>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-gray-600">Date</label>
					<input
						type="date"
						bind:value={editDate}
						class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
					/>
				</div>
				{#if editPopover.event.endDate || editPopover.event.type === 'reminder'}
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-600"
							>End date (for ranged events)</label
						>
						<input
							type="date"
							bind:value={editEndDate}
							class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
						/>
					</div>
				{/if}
				{#if editPopover.event !== null && !isNoteHiddenForEventType(editPopover.event.type, editPopover.event.reminderKind)}
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-600">Note</label>
						<textarea
							bind:value={editNote}
							rows={2}
							class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
							placeholder="Optional detail"
						/>
					</div>
				{/if}
				<div class="flex justify-end gap-2 pt-1">
					<Button variant="outline" size="sm" onclick={closeEditPopover}>Cancel</Button>
					<Button size="sm" onclick={saveEdit}>Save changes</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
