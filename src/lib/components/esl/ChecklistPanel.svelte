<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	/**
	 * Advisory checklist panel (ticket #213): four expected-default groups
	 * with ✓/⚠ plus one-click create. Presentational only — the detail page
	 * feeds it the `esl/checklist.status` result and calls
	 * `esl/checklist.createMissing` in `oncreate`. Advisory means advisory:
	 * nothing here blocks saving, and task items stay manual-only
	 * (free-text title, no checklist entry).
	 */
	import type { ChecklistGroup, ChecklistStatus } from './ChecklistPanel.types';
	export type { ChecklistGroup, ChecklistStatus };

	let {
		status,
		loading,
		busyGroup,
		error,
		oncreate
	}: {
		status: ChecklistStatus | null;
		loading: boolean;
		busyGroup: ChecklistGroup | null;
		error: string | null;
		oncreate: (group: ChecklistGroup) => void;
	} = $props();

	const unitQuizOk = $derived(status !== null && status.quiz.present >= status.quiz.expected);
	const passportRecordingOk = $derived(
		status !== null &&
			status.passport.present >= status.passport.expected &&
			status.recording.present >= status.recording.expected
	);
	const g9mockOk = $derived(
		status !== null && status.g9mock.presentRows >= status.g9mock.expectedRows
	);
	function busy(group: ChecklistGroup): boolean {
		return busyGroup === group;
	}
</script>

<section data-testid="checklist-panel" class="space-y-3 rounded-lg border bg-white p-4">
	<div class="flex flex-wrap items-center gap-2">
		<h2 class="text-base font-semibold text-emerald-900">Expected defaults</h2>
		<span
			class="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
		>
			Advisory only
		</span>
	</div>
	{#if status !== null}
		<p class="text-xs text-gray-500">
			Checking {status.window.start} → {status.window.end}. Missing rows are suggestions — create
			them here or add rows by hand below.
		</p>
	{/if}

	{#if loading}
		<p data-testid="checklist-panel.loading" class="text-muted-foreground py-4 text-center text-sm">
			Checking expected defaults…
		</p>
	{:else if status !== null}
		<ul class="space-y-2">
			<li
				data-testid="checklist-panel.group-off"
				class="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
			>
				<span aria-hidden="true">{status.off.ok ? '✓' : '⚠'}</span>
				<span class="font-medium">Official off-days</span>
				<span class="text-gray-600">
					{status.off.present.length}/{status.off.expected.length} in {status.window.start} →
					{status.window.end}
				</span>
				{#if !status.off.ok}
					<span class="text-amber-800">missing {status.off.missing.length}</span>
					<Button
						size="sm"
						variant="outline"
						disabled={busy('off')}
						onclick={() => oncreate('off')}
						data-testid="checklist-panel.create-off"
					>
						{busy('off') ? 'Creating…' : `Create missing ${status.off.missing.length}`}
					</Button>
				{/if}
			</li>
			<li
				data-testid="checklist-panel.group-unit-quiz"
				class="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
			>
				<span aria-hidden="true">{unitQuizOk ? '✓' : '⚠'}</span>
				<span class="font-medium">Unit tests + quizzes</span>
				<span class="text-gray-600">
					quizzes {status.quiz.present}/{status.quiz.expected}
				</span>
				{#if status.quiz.present < status.quiz.expected}
					<Button
						size="sm"
						variant="outline"
						disabled={busy('quiz')}
						onclick={() => oncreate('quiz')}
						data-testid="checklist-panel.create-quiz"
					>
						{busy('quiz') ? 'Creating…' : 'Create quiz drafts'}
					</Button>
				{/if}
			</li>
			<li
				data-testid="checklist-panel.group-passport-recording"
				class="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
			>
				<span aria-hidden="true">{passportRecordingOk ? '✓' : '⚠'}</span>
				<span class="font-medium">Passport + recording dues</span>
				<span class="text-gray-600">
					passport {status.passport.present}/{status.passport.expected} · recording {status
						.recording.present}/{status.recording.expected}
				</span>
				{#if status.passport.present < status.passport.expected}
					<Button
						size="sm"
						variant="outline"
						disabled={busy('passport')}
						onclick={() => oncreate('passport')}
						data-testid="checklist-panel.create-passport"
					>
						{busy('passport') ? 'Creating…' : 'Create passport dues'}
					</Button>
				{/if}
				{#if status.recording.present < status.recording.expected}
					<Button
						size="sm"
						variant="outline"
						disabled={busy('recording')}
						onclick={() => oncreate('recording')}
						data-testid="checklist-panel.create-recording"
					>
						{busy('recording') ? 'Creating…' : 'Create recording dues'}
					</Button>
				{/if}
			</li>
			<li
				data-testid="checklist-panel.group-g9mock"
				class="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
			>
				<span aria-hidden="true">{g9mockOk ? '✓' : '⚠'}</span>
				<span class="font-medium">G9 mocks</span>
				<span class="text-gray-600">
					{status.g9mock.presentRows}/{status.g9mock.expectedRows} rows ({status.g9mock
						.expectedStarts}
					two-day starts)
				</span>
				{#if !g9mockOk}
					<Button
						size="sm"
						variant="outline"
						disabled={busy('g9mock')}
						onclick={() => oncreate('g9mock')}
						data-testid="checklist-panel.create-g9mock"
					>
						{busy('g9mock') ? 'Creating…' : 'Create mock drafts'}
					</Button>
				{/if}
			</li>
		</ul>
	{/if}

	{#if error}
		<p
			data-testid="checklist-panel.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			{error}
		</p>
	{/if}

	<p data-testid="checklist-panel.task-note" class="text-xs text-gray-500">
		Tasks stay manual — give each its own title below. They never appear in this checklist and
		nothing here blocks saving.
	</p>
</section>
