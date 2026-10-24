import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.fn();
const beforeNavigateMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args),
	beforeNavigate: (...args: unknown[]) => beforeNavigateMock(...args)
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

import WizardShellHarness from './wizard-shell.harness.svelte';
import type { WizardState } from '$lib/components/esl/wizard/wizard-state';
import type { InferredReport } from '$lib/components/esl/wizard/wizard-load';

const STORAGE_KEY = 'hwis:esl-wizard';

function stored(): string | null {
	return sessionStorage.getItem(STORAGE_KEY);
}

describe('wizard shell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	it('renders the stepper, the current step panel and the Back / Next footer', async () => {
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('wizard.root')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.title')).toMatchTextContent('Semester setup');
		await expect.element(page.getByTestId('wizard.steps')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.progress')).toMatchTextContent('Step 1 of 5');
		await expect.element(page.getByTestId('wizard.step-1')).toBeInTheDocument();
		// Step 1 is S1 this season — it is incomplete until the room limit is chosen.
		await page.getByTestId('harness.set-room-limit').click();
		await expect.element(page.getByRole('button', { name: 'Back' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('highlights the current step only', async () => {
		await render(WizardShellHarness);

		await expect
			.element(page.getByTestId('wizard.step-1-tab'))
			.toHaveAttribute('aria-current', 'step');
		for (const step of [2, 3, 4, 5]) {
			await expect
				.element(page.getByTestId(`wizard.step-${step}-tab`))
				.not.toHaveAttribute('aria-current', 'step');
		}

		await page.getByTestId('harness.set-room-limit').click();
		await page.getByRole('button', { name: 'Next' }).click();

		await expect
			.element(page.getByTestId('wizard.step-1-tab'))
			.not.toHaveAttribute('aria-current', 'step');
		await expect
			.element(page.getByTestId('wizard.step-2-tab'))
			.toHaveAttribute('aria-current', 'step');
	});

	it('locks the steps that are not complete yet', async () => {
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('wizard.step-2-tab')).toBeEnabled();
		await expect.element(page.getByTestId('wizard.step-3-tab')).toBeDisabled();
		await expect.element(page.getByTestId('wizard.step-4-tab')).toBeDisabled();
		await expect.element(page.getByTestId('wizard.step-5-tab')).toBeDisabled();

		// A locked tab stays put even when clicked.
		await page.getByTestId('wizard.step-4-tab').click({ force: true });

		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('1');
	});

	it('persists every step change to sessionStorage', async () => {
		await render(WizardShellHarness);

		expect(stored()).toBeNull();

		await page.getByTestId('harness.set-room-limit').click();
		await page.getByRole('button', { name: 'Next' }).click();

		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});

		await page.getByRole('button', { name: 'Next' }).click();

		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":3');
		});

		await page.getByRole('button', { name: 'Back' }).click();

		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
	});

	it('keeps a manual edit when the admin walks back and forward again', async () => {
		await render(WizardShellHarness);

		await page.getByTestId('harness.set-start').click();

		await expect.element(page.getByTestId('harness.start-date')).toMatchTextContent('2026-09-07');

		await page.getByTestId('harness.set-room-limit').click();
		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('2');

		await page.getByRole('button', { name: 'Back' }).click();

		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('1');
		await expect.element(page.getByTestId('harness.start-date')).toMatchTextContent('2026-09-07');
	});

	it('writes an update straight through to sessionStorage without moving steps', async () => {
		await render(WizardShellHarness);

		await page.getByTestId('harness.set-start').click();

		await vi.waitFor(() => {
			expect(stored()).toContain('2026-09-07');
		});
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('1');
	});

	it('blocks Next while the current step is incomplete and lets a reached step stay clickable', async () => {
		await render(WizardShellHarness);

		await page.getByTestId('harness.set-room-limit').click();
		await page.getByTestId('harness.clear-end').click();
		await page.getByRole('button', { name: 'Next' }).click();

		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('2');
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeDisabled();

		// Step 1 still counts as complete, so its tab stays reachable.
		await page.getByTestId('wizard.step-1-tab').click();

		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('1');
	});

	it('resumes the stored step on a fresh mount and says so', async () => {
		const first = await render(WizardShellHarness);
		await page.getByTestId('harness.set-room-limit').click();
		await page.getByRole('button', { name: 'Next' }).click();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
		await page.getByTestId('harness.set-start').click();
		await vi.waitFor(() => {
			expect(stored()).toContain('2026-09-07');
		});
		await first.unmount();

		// A refresh is a fresh mount reading the same sessionStorage.
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('2');
		await expect.element(page.getByTestId('harness.start-date')).toMatchTextContent('2026-09-07');
		await expect.element(page.getByTestId('wizard.resumed')).toBeInTheDocument();
	});

	it('does not claim a resume when nothing was stored', async () => {
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('wizard.resumed')).not.toBeInTheDocument();
	});

	it('dismisses the resume notice', async () => {
		const first = await render(WizardShellHarness);
		await page.getByTestId('harness.set-room-limit').click();
		await page.getByRole('button', { name: 'Next' }).click();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});
		await first.unmount();

		await render(WizardShellHarness);
		await page.getByTestId('wizard.resumed-dismiss').click();

		await expect.element(page.getByTestId('wizard.resumed')).not.toBeInTheDocument();
	});

	it('labels reached step tabs as "Back to step N" in create mode', async () => {
		await render(WizardShellHarness);

		await expect
			.element(page.getByTestId('wizard.step-2-tab'))
			.toHaveAttribute('title', 'Back to step 2');
		await expect
			.element(page.getByTestId('wizard.step-3-tab'))
			.toHaveAttribute('title', 'Complete step 3 first');
	});

	it('Cancels by dropping the stored state and leaving for the semester list', async () => {
		await render(WizardShellHarness);
		await page.getByTestId('harness.set-room-limit').click();
		await page.getByRole('button', { name: 'Next' }).click();
		await vi.waitFor(() => {
			expect(stored()).toContain('"currentStep":2');
		});

		await page.getByRole('button', { name: 'Cancel' }).click();

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/esl/admin/semesters');
		});
		expect(stored()).toBeNull();
	});
});

/**
 * Edit mode (ticket #255): the shell mounts from the loaded state instead
 * of sessionStorage, every step is freely navigable regardless of
 * completeness, nothing is written to sessionStorage, and an unsaved diff
 * arms the beforeunload + in-app nav guards.
 */
describe('wizard shell (edit mode)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	/** A loaded semester whose steps 2–5 are incomplete, so a create-mode
	 * shell would keep them locked — edit mode must not. */
	function editState(): WizardState {
		return {
			currentStep: 5,
			semesterId: 'sem_s1',
			step1: {
				term: 'S1',
				schoolYear: '2026-2027',
				startDate: '2026-08-31',
				eslRoomLimit: 'E',
				eslCustomRooms: []
			},
			step2: {
				endDate: null,
				offDays: [{ date: '2026-09-25', name: 'Mid-Autumn Festival' }],
				holidaysImported: false
			},
			step3: { exams: [] },
			step4: {
				singles: { anniv: null, makeup: null, sports: null, grad: null, bbq: null },
				pairs: { mock1: null, mock2: null, mock3: null },
				ranges: {
					q1: null,
					q2: null,
					q3: null,
					q4: null,
					q5: null,
					q6: null,
					pd1: null,
					pd2: null,
					pd3: null,
					rd1: null,
					rd2: null,
					rd3: null,
					pcheck: null,
					wcheck: null
				},
				sportsOn: false,
				extras: []
			},
			step5: { customEvents: [], eventEdits: [] }
		};
	}

	interface EditOptions {
		mode: 'edit';
		initialState: WizardState;
	}

	it('mounts from the loaded state, labels itself, and ignores sessionStorage', async () => {
		sessionStorage.setItem(STORAGE_KEY, '{"v":2,"resumed":"create noise"}');
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		const mounted = await render(WizardShellHarness, props);

		await expect.element(page.getByTestId('wizard.title')).toMatchTextContent('Edit semester');
		await expect.element(page.getByTestId('wizard.edit-mode')).toBeInTheDocument();
		// Landing step is the loaded state's summary (the loader pins it to 5).
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('5');
		await expect.element(page.getByTestId('harness.semester-id')).toMatchTextContent('sem_s1');
		// No resume notice, and the stored create draft stays untouched.
		await expect.element(page.getByTestId('wizard.resumed')).not.toBeInTheDocument();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBe('{"v":2,"resumed":"create noise"}');
		await mounted.unmount();
	});

	it('leaves every step freely navigable even when earlier steps are incomplete', async () => {
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		await render(WizardShellHarness, props);

		// Step 2 lacks an end date, which would lock steps 3–5 in create mode.
		for (const tab of [1, 2, 3, 4, 5]) {
			await expect.element(page.getByTestId(`wizard.step-${tab}-tab`)).toBeEnabled();
		}

		await page.getByTestId('wizard.step-3-tab').click();
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('3');

		await page.getByTestId('wizard.step-1-tab').click();
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('1');
	});

	it('never writes wizard state to sessionStorage in edit mode', async () => {
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		await render(WizardShellHarness, props);

		await page.getByTestId('wizard.step-1-tab').click();
		// Even a real state change stays off sessionStorage.
		await page.getByTestId('harness.set-start').click();

		await expect.element(page.getByTestId('harness.start-date')).toMatchTextContent('2026-09-07');
		expect(stored()).toBeNull();
	});

	it('arms the unsaved guards once the state differs from the loaded one', async () => {
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		await render(WizardShellHarness, props);

		// Clean state: the veto is registered but never cancels; beforeunload
		// stays unarmed.
		expect(beforeNavigateMock).toHaveBeenCalledTimes(1);
		let beforeUnload = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(beforeUnload);
		expect(beforeUnload.defaultPrevented).toBe(false);

		// Dirty state: both guards arm.
		await page.getByTestId('harness.set-start').click();
		await expect.element(page.getByTestId('harness.start-date')).toMatchTextContent('2026-09-07');

		const navCallback = beforeNavigateMock.mock.calls[0]?.[0] as (navigation: {
			cancel: () => void;
		}) => void;
		const navigation = { cancel: vi.fn() };
		navCallback(navigation);
		expect(navigation.cancel).toHaveBeenCalledTimes(1);

		beforeUnload = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(beforeUnload);
		expect(beforeUnload.defaultPrevented).toBe(true);
	});

	it('registers the in-app veto once and re-checks the live dirty flag', async () => {
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		await render(WizardShellHarness, props);

		// Registered at mount, before any edit; the callback is a clean no-op.
		expect(beforeNavigateMock).toHaveBeenCalledTimes(1);
		const navCallback = beforeNavigateMock.mock.calls[0]?.[0] as (navigation: {
			cancel: () => void;
		}) => void;
		const cleanNavigation = { cancel: vi.fn() };
		navCallback(cleanNavigation);
		expect(cleanNavigation.cancel).not.toHaveBeenCalled();

		// Dirty → clean → dirty cycles never accumulate registrations.
		await page.getByTestId('harness.set-start').click();
		await expect.element(page.getByTestId('harness.start-date')).toMatchTextContent('2026-09-07');
		expect(beforeNavigateMock).toHaveBeenCalledTimes(1);
		const dirtyNavigation = { cancel: vi.fn() };
		navCallback(dirtyNavigation);
		expect(dirtyNavigation.cancel).toHaveBeenCalledTimes(1);
	});

	it('disarms the unsaved guards once a save has landed, so the success redirect is not vetoed', async () => {
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		await render(WizardShellHarness, props);

		await page.getByTestId('harness.set-start').click();
		await expect.element(page.getByTestId('harness.start-date')).toMatchTextContent('2026-09-07');
		const navCallback = beforeNavigateMock.mock.calls[0]?.[0] as (navigation: {
			cancel: () => void;
		}) => void;

		// The step panel reports the save; navigation now goes through.
		await page.getByTestId('harness.mark-saved').click();
		const navigation = { cancel: vi.fn() };
		navCallback(navigation);
		expect(navigation.cancel).not.toHaveBeenCalled();

		const beforeUnload = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(beforeUnload);
		expect(beforeUnload.defaultPrevented).toBe(false);
	});

	it('does not arm the unsaved guards when navigating between steps without editing', async () => {
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		await render(WizardShellHarness, props);

		await page.getByTestId('wizard.step-1-tab').click();
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('1');

		const navCallback = beforeNavigateMock.mock.calls[0]?.[0] as (navigation: {
			cancel: () => void;
		}) => void;
		const cleanNavigation = { cancel: vi.fn() };
		navCallback(cleanNavigation);
		expect(cleanNavigation.cancel).not.toHaveBeenCalled();

		const beforeUnload = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(beforeUnload);
		expect(beforeUnload.defaultPrevented).toBe(false);
	});

	it('advances with Next even when the current step is incomplete', async () => {
		const props: EditOptions = { mode: 'edit', initialState: editState() };
		await render(WizardShellHarness, props);

		// Step 3 (exams) is incomplete, yet edit mode never gates Next.
		await page.getByTestId('wizard.step-3-tab').click();
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('3');
		const next = page.getByRole('button', { name: 'Next' });
		await expect.element(next).toBeEnabled();
		await next.click();
		await expect.element(page.getByTestId('harness.step')).toMatchTextContent('4');

		// Reached edit-mode steps keep the "jump" wording, not create's "back".
		await expect
			.element(page.getByTestId('wizard.step-3-tab'))
			.toHaveAttribute('title', 'Jump to step 3');
	});

	it('shows the inferred entries that surface on the current step, inline', async () => {
		const props: EditOptions & { inferred?: InferredReport } = {
			mode: 'edit',
			initialState: editState(),
			inferred: {
				entries: [
					{
						kind: 'reminder-ordinal',
						eventKey: 'step4:ranges:q1',
						detail: 'Window ordinals are not stored — numbered by first-date order on reload.'
					},
					{
						kind: 'custom-event',
						eventKey: 'custom:custom-1',
						detail: 'Best-effort reverse mapping from a reminder row.'
					},
					{
						kind: 'unmatched-event',
						detail: 'reminder row "Stray" on 2026-10-01 fits no wizard slot.'
					}
				]
			}
		};
		await render(WizardShellHarness, props);

		const region = page.getByTestId('wizard.inferred');
		// Step 5 surfaces custom + unmatched, not the step-4 ordinal tag.
		await expect
			.element(region)
			.toMatchTextContent('Best-effort reverse mapping from a reminder row.');
		await expect
			.element(region)
			.toMatchTextContent('reminder row "Stray" on 2026-10-01 fits no wizard slot.');
		await expect.element(region).not.toMatchTextContent('Window ordinals are not stored');

		// Step 4 surfaces the ordinal tag plus the always-visible unmatched row.
		await page.getByTestId('wizard.step-4-tab').click();
		await expect
			.element(page.getByTestId('wizard.inferred'))
			.toMatchTextContent('Window ordinals are not stored');
		await expect.element(page.getByTestId('wizard.inferred')).toMatchTextContent('"Stray"');
		await expect
			.element(page.getByTestId('wizard.inferred'))
			.not.toMatchTextContent('Best-effort reverse mapping');
	});

	it('shows no inferred region in create mode', async () => {
		await render(WizardShellHarness);

		await expect.element(page.getByTestId('wizard.inferred')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.title')).toMatchTextContent('Semester setup');
	});
});
