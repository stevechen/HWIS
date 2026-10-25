/**
 * Wizard adapter split (Candidate 1, ADR-0029-pattern).
 *
 * Module: adapter at the storage/gate seam. Keeps gate logic and
 * persistence adapter separate from state shape in wizard-state.
 */
export interface WizardStorageAdapter {
	read: () => unknown;
	write: (payload: unknown) => void;
	clear: () => void;
}
