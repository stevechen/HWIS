/**
 * Wizard gate adapter (Candidate 1 deepening, ADR-0029-pattern).
 * Module: gate logic at seam — separate from state shape and storage adapter.
 */
import { EXAM_SLOT_ORDER, type ExamSlot } from '../wizard/wizard-dates';
import type { WizardState, WizardStepNumber } from '../wizard/wizard-state';

function isSetRow(dates: readonly string[] | null): boolean {
	return dates !== null && dates.length > 0;
}

export function isStepComplete(state: WizardState, step: WizardStepNumber): boolean {
	switch (step) {
		case 1:
			return (
				state.step1.term !== null &&
				state.step1.schoolYear !== null &&
				state.step1.startDate !== null &&
				(state.step1.term !== 'S1' || state.step1.eslRoomLimit !== null)
			);
		case 2: {
			const { endDate } = state.step2;
			const { startDate } = state.step1;
			return endDate !== null && startDate !== null && endDate >= startDate;
		}
		case 3:
			return EXAM_SLOT_ORDER.every((slot: ExamSlot) =>
				state.step3.exams.some(
					(exam: { label: ExamSlot; dates: string[] }) =>
						exam.label === slot && exam.dates.length > 0
				)
			);
		case 4: {
			const s4 = state.step4;
			const s2 = state.step1.term === 'S2';
			if (s4.sportsOn && s4.singles.sports === null) return false;
			const mocks: ReadonlyArray<readonly string[] | null> = s2
				? [s4.pairs.mock1, s4.pairs.mock2, s4.pairs.mock3]
				: [s4.pairs.mock1, s4.pairs.mock2];
			if (mocks.some((m) => !isSetRow(m))) return false;
			if (s2) {
				if (s4.singles.grad === null) return false;
				if (s4.singles.anniv === null || s4.singles.makeup === null) return false;
			}
			return true;
		}
		case 5:
			return isStepComplete(state, 4);
		default:
			return false;
	}
}

export function isStepUnlocked(state: WizardState, step: WizardStepNumber): boolean {
	if (state.currentStep >= step) return true;
	return isStepComplete(state, step);
}
