import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import ChecklistPanel from '$lib/components/esl/ChecklistPanel.svelte';
import type { ChecklistStatus } from '$lib/components/esl/ChecklistPanel.types';

function emptyStatus(overrides: Partial<ChecklistStatus> = {}): ChecklistStatus {
	return {
		window: { start: '2025-08-31', end: '2025-10-31' },
		off: { expected: ['2025-10-06'], present: [], missing: ['2025-10-06'], ok: false },
		quiz: { expected: 6, present: 0 },
		units: { expected: 6, present: 0 },
		passport: { expected: 3, present: 0 },
		recording: { expected: 3, present: 0 },
		g9mock: { expectedStarts: 2, expectedRows: 4, presentRows: 0 },
		...overrides
	};
}

function panelProps(overrides: Record<string, unknown> = {}) {
	return {
		status: emptyStatus(),
		loading: false,
		busyGroup: null,
		error: null,
		oncreate: vi.fn(),
		...overrides
	};
}

describe('ChecklistPanel advisory groups (#213)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows a loading state while the status query runs', async () => {
		await render(ChecklistPanel, panelProps({ status: null, loading: true }));
		await expect.element(page.getByTestId('checklist-panel.loading')).toBeInTheDocument();
	});

	it('renders four advisory groups with warning marks when missing', async () => {
		await render(ChecklistPanel, panelProps());
		for (const group of ['off', 'unit-quiz', 'passport-recording', 'g9mock']) {
			const row = page.getByTestId(`checklist-panel.group-${group}`);
			await expect.element(row).toBeInTheDocument();
			await expect.element(row).toMatchTextContent(/⚠/);
		}
	});

	it('marks a complete group with a check and no create button', async () => {
		await render(
			ChecklistPanel,
			panelProps({
				status: emptyStatus({
					off: { expected: ['2025-10-06'], present: ['2025-10-06'], missing: [], ok: true }
				})
			})
		);
		const row = page.getByTestId('checklist-panel.group-off');
		await expect.element(row).toMatchTextContent(/✓/);
		await expect.element(page.getByTestId('checklist-panel.create-off')).not.toBeInTheDocument();
	});

	it('creates missing off-days with one click', async () => {
		const oncreate = vi.fn();
		await render(
			ChecklistPanel,
			panelProps({
				status: emptyStatus({
					off: { expected: ['2025-10-06'], present: [], missing: ['2025-10-06'], ok: false }
				}),
				oncreate
			})
		);
		(page.getByTestId('checklist-panel.create-off').element() as HTMLButtonElement).click();
		expect(oncreate).toHaveBeenCalledOnce();
		expect(oncreate).toHaveBeenCalledWith('off');
	});

	it('keeps task items manual-only with no checklist entry', async () => {
		await render(ChecklistPanel, panelProps());
		const note = page.getByTestId('checklist-panel.task-note');
		await expect.element(note).toBeInTheDocument();
		await expect.element(note).toMatchTextContent(/manual/i);
	});
});
