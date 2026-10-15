import { describe, it, expect } from 'vitest';
import {
	clearWizardState,
	createInitialWizardState,
	isStepComplete,
	isStepUnlocked,
	nextWizardStep,
	previousWizardStep,
	readWizardState,
	serializeWizardState,
	WIZARD_STATE_VERSION,
	WIZARD_STEPS,
	WIZARD_STORAGE_KEY,
	writeWizardState,
	type WizardStorage
} from '$lib/components/esl/wizard/wizard-state';
import { EXAM_SLOT_ORDER } from '$lib/components/esl/wizard/wizard-dates';

/** The three storage calls the wizard makes — no browser globals needed. */
class MemoryStorage implements WizardStorage {
	private map = new Map<string, string>();

	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}

	removeItem(key: string): void {
		this.map.delete(key);
	}
}

// Oct 2026: `suggestSemester` says "next fall" (2027-2028) while the school
// year derived for that term is the current one (2026-2027) — the F8/F9 split
// the prototype had to fix. Aug 30 2026 is a Sunday, so the start rolls to
// Monday Aug 31; Jan 20 2027 is a Wednesday, so the end stays put.
const OCTOBER_SEED = '2026-10-15';
const OCTOBER_FRESH = {
	currentStep: 1,
	step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
	step2: { endDate: '2027-01-20', offDays: [], holidaysImported: false, lastExamDay: false },
	step3: { exams: [] },
	step4: {},
	step5: {}
};

describe('wizardState', () => {
	describe('seeded defaults', () => {
		it('opens on step 1 with the suggested term and its derived window', () => {
			expect(createInitialWizardState(OCTOBER_SEED)).toEqual(OCTOBER_FRESH);
		});

		it('seeds an S2 spring window when today falls in the spring half', () => {
			const state = createInitialWizardState('2026-03-10');
			expect(state.step1).toEqual({ term: 'S2', schoolYear: '2025-2026', startDate: '2026-02-11' });
			expect(state.step2.endDate).toBe('2026-06-30');
		});
	});

	describe('step gates', () => {
		it('counts the seeded step 1 and step 2 as complete and later steps as not', () => {
			const state = createInitialWizardState(OCTOBER_SEED);
			expect(isStepComplete(state, 1)).toBe(true);
			expect(isStepComplete(state, 2)).toBe(true);
			expect(isStepComplete(state, 3)).toBe(false);
			// Step 4 has no content yet, so the preview it feeds is not ready either.
			expect(isStepComplete(state, 4)).toBe(false);
			expect(isStepComplete(state, 5)).toBe(false);
		});

		it('refuses step 2 while the end date is not after the start date', () => {
			const state = createInitialWizardState(OCTOBER_SEED);
			state.step2.endDate = '2026-08-01';
			expect(isStepComplete(state, 2)).toBe(false);
		});

		it('requires every exam slot before step 3 counts as complete', () => {
			const state = createInitialWizardState(OCTOBER_SEED);
			state.step3.exams = [
				{ label: 'Exam 1', dates: ['2026-10-05', '2026-10-06'] },
				{ label: 'Exam 2', dates: ['2026-11-02', '2026-11-03'] }
			];
			expect(isStepComplete(state, 3)).toBe(false);

			state.step3.exams.push({ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] });
			expect(isStepComplete(state, 3)).toBe(true);
		});

		it('opens a step when it is complete, and always lets a reached step be revisited', () => {
			const state = createInitialWizardState(OCTOBER_SEED);
			// Steps 1 and 2 arrive seeded, so they read as complete from the start.
			expect(isStepUnlocked(state, 1)).toBe(true);
			expect(isStepUnlocked(state, 2)).toBe(true);
			expect(isStepUnlocked(state, 3)).toBe(false);

			state.currentStep = 3;
			expect(isStepUnlocked(state, 2)).toBe(true);
			state.step2.endDate = null;
			// Reaching a step keeps it open even once it is no longer complete.
			expect(isStepUnlocked(state, 2)).toBe(true);
			expect(isStepUnlocked(state, 4)).toBe(false);

			state.step3.exams = EXAM_SLOT_ORDER.map((label) => ({ label, dates: ['2026-10-05'] }));
			expect(isStepUnlocked(state, 3)).toBe(true);
		});

		it('steps one at a time and stops at both ends', () => {
			expect(nextWizardStep(1)).toBe(2);
			expect(nextWizardStep(5)).toBeNull();
			expect(previousWizardStep(2)).toBe(1);
			expect(previousWizardStep(1)).toBeNull();
		});

		it('names the five steps in order', () => {
			expect(WIZARD_STEPS.map((definition) => definition.number)).toEqual([1, 2, 3, 4, 5]);
			expect(WIZARD_STEPS.map((definition) => definition.label)).toEqual([
				'Semester & start',
				'End & holidays',
				'Exams',
				'Events',
				'Preview & save'
			]);
		});
	});

	describe('sessionStorage persistence', () => {
		it('round-trips a half-finished wizard', () => {
			const storage = new MemoryStorage();
			const state = createInitialWizardState(OCTOBER_SEED);
			state.currentStep = 3;
			state.step2.offDays = [{ date: '2026-10-10', name: 'National Day' }];
			state.step2.holidaysImported = true;
			state.step3.exams = [{ label: 'Exam 1', dates: ['2026-10-05', '2026-10-06'] }];

			writeWizardState(storage, state);

			const restored = readWizardState(storage, OCTOBER_SEED);
			expect(restored.resumed).toBe(true);
			expect(restored.state).toEqual(state);
			expect(storage.getItem(WIZARD_STORAGE_KEY)).toBe(serializeWizardState(state));
			expect(serializeWizardState(state)).toContain(`"version":${WIZARD_STATE_VERSION}`);
		});

		it('starts a fresh wizard when nothing usable is stored', () => {
			expect(readWizardState(new MemoryStorage(), OCTOBER_SEED)).toEqual({
				state: OCTOBER_FRESH,
				resumed: false
			});
			expect(readWizardState(null, OCTOBER_SEED)).toEqual({ state: OCTOBER_FRESH, resumed: false });

			const broken = new MemoryStorage();
			broken.setItem(WIZARD_STORAGE_KEY, 'not json');
			expect(readWizardState(broken, OCTOBER_SEED)).toEqual({
				state: OCTOBER_FRESH,
				resumed: false
			});
		});

		it('ignores a payload written by a different shape version', () => {
			const storage = new MemoryStorage();
			storage.setItem(
				WIZARD_STORAGE_KEY,
				JSON.stringify({ version: WIZARD_STATE_VERSION + 1, state: { currentStep: 4 } })
			);

			expect(readWizardState(storage, OCTOBER_SEED)).toEqual({
				state: OCTOBER_FRESH,
				resumed: false
			});
		});

		it('fills gaps from the seeded defaults instead of failing', () => {
			const storage = new MemoryStorage();
			storage.setItem(
				WIZARD_STORAGE_KEY,
				JSON.stringify({ version: WIZARD_STATE_VERSION, state: { step1: { term: 'S2' } } })
			);

			const restored = readWizardState(storage, OCTOBER_SEED);
			expect(restored.resumed).toBe(true);
			expect(restored.state.step1.term).toBe('S2');
			expect(restored.state.step1.startDate).toBe(OCTOBER_FRESH.step1.startDate);
			expect(restored.state.step2).toEqual(OCTOBER_FRESH.step2);
			expect(restored.state.currentStep).toBe(1);
		});

		it('drops junk entries and keeps the valid ones', () => {
			const storage = new MemoryStorage();
			storage.setItem(
				WIZARD_STORAGE_KEY,
				JSON.stringify({
					version: WIZARD_STATE_VERSION,
					state: {
						currentStep: 9,
						step1: { term: 'S3', schoolYear: 'nope', startDate: '10/05' },
						step2: {
							endDate: '2027-01-20',
							offDays: [{ date: '2026-10-10' }, 'junk'],
							holidaysImported: 'yes'
						},
						step3: {
							exams: [
								{ label: 'Midterm', dates: [] },
								{ label: 'Final', dates: ['2027-01-18', 'not-a-date'] }
							]
						}
					}
				})
			);

			const { state } = readWizardState(storage, OCTOBER_SEED);
			expect(state.currentStep).toBe(1);
			expect(state.step1.term).toBe('S1');
			expect(state.step1.startDate).toBe(OCTOBER_FRESH.step1.startDate);
			expect(state.step2.offDays).toEqual([]);
			expect(state.step2.holidaysImported).toBe(false);
			expect(state.step3.exams).toEqual([{ label: 'Final', dates: ['2027-01-18'] }]);
		});

		it('survives a storage that throws', () => {
			const state = createInitialWizardState(OCTOBER_SEED);
			const hostile: WizardStorage = {
				getItem: () => null,
				setItem: () => {
					throw new Error('quota exceeded');
				},
				removeItem: () => {}
			};

			expect(() => writeWizardState(hostile, state)).not.toThrow();
			expect(() => clearWizardState(hostile)).not.toThrow();
			expect(
				readWizardState(
					{
						getItem: () => {
							throw new Error('blocked');
						},
						setItem: () => {},
						removeItem: () => {}
					},
					OCTOBER_SEED
				).resumed
			).toBe(false);
		});

		it('clears the stored payload so Cancel discards everything', () => {
			const storage = new MemoryStorage();
			writeWizardState(storage, createInitialWizardState(OCTOBER_SEED));

			clearWizardState(storage);

			expect(storage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
		});
	});
});
