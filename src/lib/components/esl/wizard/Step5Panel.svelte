<script lang="ts">
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isNoteHiddenForEventType } from '$convex/shared/esl';
	import type { ReconcileSummary } from '$convex/esl/wizards';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import { e2eTagFromUrl } from '$lib/e2e-tag';
	import ChecklistPanel from '../ChecklistPanel.svelte';
	import type { ChecklistGroup } from '../ChecklistPanel.types';
	import CalendarPreview from './CalendarPreview.svelte';
	import { buildPreviewWeeks, type MockOffDay, type PreviewWeek } from './wizard-dates';
	import { buildPreviewRows, buildSavePayload, type PreviewRow } from './wizard-save';
	import {
		buildPreviewSections,
		formatPreviewDateRange,
		formatSectionRange,
		formatShortDate
	} from './wizard-blocks';
	import {
		clearWizardState,
		type WizardEventEdit,
		type WizardMode,
		type WizardState
	} from './wizard-state';

	let {
		state: wizardState,
		update,
		mode = 'create',
		markSaved = () => {}
	}: {
		state: WizardState;
		update: (mutate: (draft: WizardState) => void) => void;
		/** Edit (#255): dry-run reconcile, change summary, removal confirm. */
		mode?: WizardMode;
		/** Edit (#255): disarm the shell's unsaved guard once the save lands. */
		markSaved?: () => void;
	} = $props();

	const client = useConvexClient();

	// ---- Advisory checklist (ticket #256, moved off the retired detail
	// page): status of the four expected-default groups plus one-click
	// draft creation. Edit mode only — a semester that does not exist yet
	// has nothing to check. `semesterId` is the loader's real id.
	const today = new Date().toISOString().slice(0, 10);
	const checklistQuery = useQuery(api.esl.checklist.status, () => {
		const semesterId = loadedSemesterId();
		return semesterId === null ? 'skip' : { semesterId, today };
	});
	let checklistBusy = $state<ChecklistGroup | null>(null);
	let checklistError = $state<string | null>(null);
	let checklistNotice = $state('');

	/**
	 * One-click draft creation. The Convex status query is reactive, so the
	 * panel refreshes itself once the rows land; the wizard state stays
	 * untouched on purpose — these are drafts the reconcile save preserves
	 * (#253), not events the admin configured in Steps 2–5.
	 */
	function createChecklistDrafts(group: ChecklistGroup) {
		const semesterId = loadedSemesterId();
		if (semesterId === null) {
			checklistError = 'No loaded semester — reopen the semester from the list.';
			return;
		}
		checklistBusy = group;
		checklistError = null;
		checklistNotice = '';
		client
			.mutation(api.esl.checklist.createMissing, { semesterId, today, group })
			.then((result) => {
				const skipped = result.skipped.length > 0 ? ` Skipped: ${result.skipped.join('; ')}` : '';
				checklistNotice =
					result.created.length > 0
						? `Created ${result.created.length} draft row${result.created.length === 1 ? '' : 's'}.${skipped}`
						: `Checklist already complete — nothing missing for that group.${skipped}`;
			})
			.catch((cause: unknown) => {
				checklistError = humanConvexErrorMessage(cause);
			})
			.finally(() => {
				checklistBusy = null;
			});
	}

	// Derived data from previous steps
	const startDate = $derived(wizardState.step1.startDate);
	const endDate = $derived(wizardState.step2?.endDate);
	const offDays: MockOffDay[] = $derived(wizardState.step2?.offDays ?? []);
	const exams = $derived(wizardState.step3?.exams ?? []);

	// Preview rows (Steps 1-5, edits applied) share one builder with the
	// save payload, so preview and saved events can never disagree.
	const unifiedEvents = $derived(buildPreviewRows(wizardState));

	// Block axis: one section per ESL block (each closes on its exam), plus a
	// tail for anything after the Final. Missing exam anchors fall back to a
	// flat date sort (see wizard-blocks).
	const previewSections = $derived(
		buildPreviewSections(unifiedEvents, exams, startDate ?? null, endDate ?? null)
	);

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

	// ---- Block connectors (best effort, Step 5 only) -------------------
	// Four lines: one across the top, then one per block. Each block line
	// leaves the calendar at the bottom of the week that closes the block
	// (the Exam 1 / Exam 2 / Final week) and lands at the bottom of that
	// block's last event row. The two columns have different row heights, so
	// the lines slant — that slant is the grouping. Below `lg` the columns
	// stack, so the overlay is cleared.
	let panelEl = $state<HTMLElement>();
	let listEl = $state<HTMLElement>();
	let calendarEl = $state<HTMLElement>();
	let listPad = $state(0);
	let connectors = $state<{ key: string; d: string }[]>([]);
	const axisKey = $derived(
		previewSections.sections.map((section) => `${section.key}:${section.events.length}`).join('|')
	);

	type Rect = { top: number; bottom: number };

	/** Every rendered calendar day cell, in viewport coordinates. */
	function calendarRects(): Record<string, Rect> {
		const rects: Record<string, Rect> = {};
		if (panelEl === undefined) return rects;
		for (const cell of panelEl.querySelectorAll<HTMLElement>('[data-date]')) {
			const date = cell.dataset.date;
			if (date === undefined) continue;
			const rect = cell.getBoundingClientRect();
			if (rect.height <= 0) continue;
			rects[date] = { top: rect.top, bottom: rect.bottom };
		}
		return rects;
	}

	function spanForRange(rects: Record<string, Rect>, start: string, end: string): Rect | null {
		let top = Number.POSITIVE_INFINITY;
		let bottom = Number.NEGATIVE_INFINITY;
		for (const [date, rect] of Object.entries(rects)) {
			if (date < start || date > end) continue;
			if (rect.top < top) top = rect.top;
			if (rect.bottom > bottom) bottom = rect.bottom;
		}
		return top === Number.POSITIVE_INFINITY ? null : { top, bottom };
	}

	function calendarGrid(): HTMLElement | null {
		if (panelEl === undefined) return null;
		return panelEl.querySelector<HTMLElement>('[data-testid="wizard.step-5-calendar.month-col"]');
	}

	function clearAlignment() {
		if (listPad !== 0) listPad = 0;
		if (connectors.length > 0) connectors = [];
	}

	/** Nudge the list down (never up) so "above Block 1" sits level with the
	 * calendar's top edge — that makes connector 1 horizontal. */
	function measureAlignment() {
		if (!previewSections.aligned || panelEl === undefined || listEl === undefined) {
			clearAlignment();
			return;
		}
		if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) {
			clearAlignment();
			return;
		}
		const grid = calendarGrid();
		const firstSection = listEl.querySelector<HTMLElement>('[data-block-section]');
		if (grid === null || firstSection === null) {
			clearAlignment();
			return;
		}
		const pad = Math.max(
			0,
			Math.round(
				grid.getBoundingClientRect().top - firstSection.getBoundingClientRect().top + listPad
			)
		);
		if (pad !== listPad) listPad = pad;
		requestAnimationFrame(() => requestAnimationFrame(measureConnectors));
	}

	function measureConnectors() {
		if (!previewSections.aligned || panelEl === undefined || listEl === undefined) {
			connectors = [];
			return;
		}
		if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) {
			connectors = [];
			return;
		}
		const grid = calendarGrid();
		if (grid === null) {
			connectors = [];
			return;
		}
		const panelRect = panelEl.getBoundingClientRect();
		const gridRect = grid.getBoundingClientRect();
		const listRect = listEl.getBoundingClientRect();
		const x1 = Math.round(gridRect.right - panelRect.left);
		const x2 = Math.round(listRect.left - panelRect.left);
		if (x2 - x1 < 8) {
			connectors = [];
			return;
		}
		const rects = calendarRects();
		const next: { key: string; d: string }[] = [];

		// Top line starts on the corner under 'Fri': the bottom of the
		// Friday column header (right edge of the calendar, first week top).
		const firstCellTop = Object.values(rects).reduce(
			(min, r) => (r.top < min ? r.top : min),
			Number.POSITIVE_INFINITY
		);
		const topStartY =
			firstCellTop === Number.POSITIVE_INFINITY
				? Math.round(gridRect.top - panelRect.top)
				: Math.round(firstCellTop - panelRect.top);

		// 1. Calendar top → above the Block 1 header.
		const firstSection = listEl.querySelector<HTMLElement>('[data-block-section]');
		const listTop = Math.round(
			(firstSection?.getBoundingClientRect().top ?? listRect.top) - panelRect.top
		);
		const midX1 = Math.round((x1 + x2) / 2);
		next.push({
			key: 'top',
			d: `M ${x1} ${topStartY} C ${midX1} ${topStartY}, ${midX1} ${listTop}, ${x2} ${listTop}`
		});

		// 2–4. One line per block: closing week bottom → last event row bottom.
		for (const section of previewSections.sections) {
			if (section.kind !== 'block') continue;
			if (section.start === null || section.end === null || section.events.length === 0) continue;
			const span = spanForRange(rects, section.start, section.end);
			if (span === null) continue;
			const sectionEl = listEl.querySelector<HTMLElement>(`[data-block-section="${section.key}"]`);
			if (sectionEl === null) continue;
			const rows = sectionEl.querySelectorAll<HTMLElement>('[data-event-row]');
			const lastRow: Element = rows.length > 0 ? rows[rows.length - 1]! : sectionEl;
			const calBottom = section.key === 'block-3' ? gridRect.bottom : span.bottom;
			const y1 = Math.round(calBottom - panelRect.top);
			const y2 = Math.round(lastRow.getBoundingClientRect().bottom - panelRect.top);
			const midX = Math.round((x1 + x2) / 2);
			next.push({
				key: section.key,
				d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
			});
		}

		if (JSON.stringify(next) !== JSON.stringify(connectors)) connectors = next;
	}

	function connectorTone(key: string): string {
		switch (key) {
			case 'block-1':
				return 'text-emerald-500';
			case 'block-2':
				return 'text-sky-500';
			case 'block-3':
				return 'text-amber-500';
			default:
				return 'text-gray-400';
		}
	}

	$effect(() => {
		// Re-measure after paint whenever the block axis changes.
		if (axisKey.length === 0 && previewSections.sections.length === 0) return;
		const frame = requestAnimationFrame(() => measureAlignment());
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const remeasure = () => measureAlignment();
		window.addEventListener('resize', remeasure);
		const observer = new ResizeObserver(remeasure);
		if (calendarEl !== undefined) observer.observe(calendarEl);
		return () => {
			window.removeEventListener('resize', remeasure);
			observer.disconnect();
		};
	});

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
		const popoverWidth = 300;
		const popoverHeight = 280;
		const vw = typeof window !== 'undefined' ? window.innerWidth : clientX + popoverWidth;
		const vh = typeof window !== 'undefined' ? window.innerHeight : clientY + popoverHeight;
		const x = Math.max(8, Math.min(clientX, vw - popoverWidth - 8));
		const y = Math.max(8, Math.min(clientY, vh - popoverHeight - 8));
		editPopover = { event, x, y };
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

	// ---- Edit mode (ticket #255): "Save changes" = dry-run reconcile →
	// change summary → confirm when rows are removed → real save. A save
	// that would drop a protected row (exam/graduation) throws on the
	// backend even in dry-run; that refusal surfaces in the error region.
	let editStatus: 'idle' | 'checking' | 'review' | 'saving' | 'success' | 'error' = $state('idle');
	let editSummary = $state<ReconcileSummary | null>(null);
	let editError = $state<string | null>(null);

	/** The summary's removal warning (the confirm) — always the backend's
	 * own list, so nothing we cannot remove is ever offered here. */
	const removing = $derived(editSummary === null ? null : editSummary.removed);

	type EditActionPayload = ReturnType<typeof buildSavePayload> & {
		semesterId: Id<'esl_semesters'>;
	};

	function editPayload(semesterId: Id<'esl_semesters'>): EditActionPayload {
		// `buildSavePayload` carries the Step 1 year/term verbatim, so the
		// immutable fields always match the loaded semester.
		const payload = buildSavePayload(wizardState, e2eTagFromUrl());
		return { ...payload, semesterId };
	}

	/**
	 * `WizardState.semesterId` is a plain string (it survives sessionStorage),
	 * but in edit mode it is always the loader's echo of the real `_id`, so
	 * branding it here is sound — the null check above proves presence.
	 */
	function loadedSemesterId(): Id<'esl_semesters'> | null {
		const id = wizardState.semesterId;
		return id === null ? null : (id as Id<'esl_semesters'>);
	}

	async function startSave() {
		const semesterId = loadedSemesterId();
		if (semesterId === null) {
			editStatus = 'error';
			editError = 'No loaded semester to update — reopen the semester from the list.';
			return;
		}
		editStatus = 'checking';
		editError = null;
		try {
			editSummary = await client.action(api.esl.wizards.updateSemester, {
				...editPayload(semesterId),
				dryRun: true
			});
			editStatus = 'review';
		} catch (err) {
			editStatus = 'error';
			editError = err instanceof Error ? err.message : 'Failed to check the save.';
		}
	}

	async function applySave() {
		const semesterId = loadedSemesterId();
		if (semesterId === null) {
			editStatus = 'error';
			editError = 'No loaded semester to update — reopen the semester from the list.';
			return;
		}
		editStatus = 'saving';
		editError = null;
		try {
			await client.action(api.esl.wizards.updateSemester, {
				...editPayload(semesterId),
				dryRun: false
			});
			// Disarm the unsaved guard before redirecting — the state still
			// differs from the loaded snapshot, so an armed guard would veto it.
			markSaved();
			// Success clears the session wizard state (create path semantics);
			// the browser then walks back to the semesters list.
			const storage = typeof window !== 'undefined' ? window.sessionStorage : null;
			clearWizardState(storage);
			editStatus = 'success';
			await goto('/esl/admin/semesters');
		} catch (err) {
			editStatus = 'error';
			editError = err instanceof Error ? err.message : 'Failed to save semester';
		}
	}

	function keepEditing() {
		editSummary = null;
		editStatus = 'idle';
		editError = null;
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
		data-event-row
		class="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded border px-2 py-1 text-xs leading-snug transition-colors hover:bg-gray-50 {getEventColor(
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
		aria-label={`Edit ${event.title} on ${formatShortDate(event.date)}`}
		title={event.note ?? undefined}
	>
		<span class="min-w-0 font-medium break-words">{event.title}</span>
		{#if event.examGroup && event.examGroup !== event.title}
			<span class="rounded bg-white/70 px-1 py-0.5 text-[10px] font-medium">{event.examGroup}</span>
		{/if}
		<!-- target badges intentionally omitted (spec: keep the list compact) -->
		{#if event.customId}
			<span class="rounded bg-white/70 px-1 py-0.5 text-[10px] font-medium">Custom</span>
		{/if}
		<span class="ml-auto shrink-0 text-[11px] tabular-nums opacity-75">
			{formatPreviewDateRange(event.date, event.endDate)}
		</span>
		{#if event.customId}
			<button
				type="button"
				class="shrink-0 text-[11px] text-red-600 hover:underline"
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
{/snippet}

<div bind:this={panelEl} data-testid="wizard.step-5-panel" class="relative space-y-4">
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
			{#if mode === 'edit'}
				<Button
					disabled={editStatus === 'checking' || editStatus === 'saving' || editStatus === 'review'}
					onclick={startSave}
					data-testid="wizard.step-5-save"
					aria-busy={editStatus === 'checking' || editStatus === 'saving'}
				>
					{editStatus === 'checking' || editStatus === 'saving' ? 'Saving…' : 'Save changes'}
				</Button>
			{:else}
				<Button
					disabled={saveStatus === 'saving' || unifiedEvents.length === 0}
					onclick={saveSemester}
					data-testid="wizard.step-5-save"
					aria-busy={saveStatus === 'saving'}
				>
					{saveStatus === 'saving' ? 'Saving…' : 'Save semester'}
				</Button>
			{/if}
		</div>
	</div>

	<!-- Save status messages (create path; edit path has its own below) -->
	{#if mode === 'create' && saveStatus === 'success'}
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
	{/if}

	<!-- Edit save flow: summary → (confirm if removals) → real save -->
	{#if mode === 'edit' && editSummary !== null && (editStatus === 'review' || editStatus === 'saving')}
		<div
			data-testid="wizard.step-5-edit-summary"
			aria-label="Save summary"
			class="space-y-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
		>
			<h3 class="font-semibold">Save summary</h3>
			<p data-testid="wizard.step-5-summary-text">
				This save would add
				<span data-testid="wizard.step-5-summary-added">{editSummary.added}</span>
				row{editSummary.added === 1 ? '' : 's'}, change
				<span data-testid="wizard.step-5-summary-changed">{editSummary.changed}</span>
				row{editSummary.changed === 1 ? '' : 's'}, and remove
				<span data-testid="wizard.step-5-summary-removed">{editSummary.removed}</span>
				row{editSummary.removed === 1 ? '' : 's'}.
			</p>
			{#if editSummary.startDateChanged}
				<p>Start of school moves — classes shift with it.</p>
			{/if}
			{#if removing !== null && removing > 0}
				<div
					data-testid="wizard.step-5-confirm"
					role="alert"
					class="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900"
				>
					<p class="font-medium">
						{removing} event row{removing === 1 ? '' : 's'} will be removed from the saved semester:
					</p>
					<ul class="list-disc pl-5">
						{#each editSummary.removedEvents as row (row.eventId)}
							<li>{row.title} on {row.date}</li>
						{/each}
					</ul>
				</div>
			{/if}
			<div class="flex items-center gap-2">
				<Button
					data-testid="wizard.step-5-apply"
					onclick={applySave}
					disabled={editStatus === 'saving'}
				>
					{removing !== null && removing > 0 ? 'Confirm & save' : 'Apply changes'}
				</Button>
				<Button variant="outline" onclick={keepEditing} disabled={editStatus === 'saving'}>
					Keep editing
				</Button>
			</div>
		</div>
	{/if}

	{#if mode === 'edit' && editStatus === 'success'}
		<div
			data-testid="wizard.step-5-save-success"
			class="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
			role="alert"
		>
			Semester updated.
		</div>
	{/if}

	{#if (mode === 'create' && saveStatus === 'error') || (mode === 'edit' && editStatus === 'error')}
		<div
			class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
			role="alert"
		>
			{mode === 'create' ? saveError : (editError ?? 'Failed to save semester')}
		</div>
	{/if}

	{#if mode === 'edit' && wizardState.semesterId !== null}
		{#key wizardState.semesterId}
			<div data-testid="wizard.step-5-checklist" class="space-y-2">
				<ChecklistPanel
					status={checklistQuery.data ?? null}
					loading={checklistQuery.isLoading}
					busyGroup={checklistBusy}
					error={checklistError}
					oncreate={createChecklistDrafts}
				/>
				{#if checklistNotice}
					<p
						data-testid="wizard.step-5-checklist-notice"
						class="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
						role="status"
					>
						{checklistNotice}
					</p>
				{/if}
			</div>
		{/key}
	{/if}

	<!-- Calendar preview + Event list side by side. The calendar keeps its
		intrinsic width so the gutter (the grid gap) stays narrow enough to
		draw block connectors between the two columns. -->
	<div class="grid gap-x-10 gap-y-6 lg:grid-cols-[auto_minmax(0,1fr)]">
		<!-- Calendar Preview -->
		<div class="min-w-0" bind:this={calendarEl}>
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
		<aside
			bind:this={listEl}
			data-testid="wizard.step-5-event-list"
			class="min-w-0 space-y-3 lg:max-w-[260px]"
		>
			<h3 class="text-sm font-semibold text-gray-800">All events ({unifiedEvents.length})</h3>

			{#if unifiedEvents.length === 0}
				<p class="text-sm text-gray-500">No events configured yet.</p>
			{:else}
				<!-- Ordered by block, then date (wizard-blocks). No inner scroll:
					the page grows so blocks stay on one unbroken vertical axis. -->
				<div class="space-y-3" style:padding-top={listPad > 0 ? `${listPad}px` : undefined}>
					{#each previewSections.sections as section (section.key)}
						<section data-block-section={section.key} class="space-y-1">
							{#if section.label}
								<h4
									class="flex flex-wrap items-baseline gap-x-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase"
								>
									<span>{section.label}</span>
									{#if section.start !== null}
										<span class="font-normal tracking-normal text-gray-400 normal-case"
											>· {formatSectionRange(section)} · {section.events.length}
											{section.events.length === 1 ? 'event' : 'events'}</span
										>
									{/if}
								</h4>
							{/if}
							{#if section.events.length === 0}
								<p class="px-1 text-xs text-gray-400">No events</p>
							{:else}
								{#each section.events as event (event.key)}
									{@render eventListItem(event)}
								{/each}
							{/if}
						</section>
					{/each}
				</div>
			{/if}
		</aside>
	</div>

	<!-- Block connectors: link each block's calendar span to its event group
		in the gutter, the way Kaleidoscope joins diff hunks. Decoration only. -->
	<svg
		class="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
		aria-hidden="true"
	>
		{#each connectors as connector (connector.key)}
			<path
				d={connector.d}
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linejoin="round"
				class={connectorTone(connector.key)}
			/>
		{/each}
	</svg>

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
