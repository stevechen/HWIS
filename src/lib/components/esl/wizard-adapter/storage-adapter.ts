/**
 * Wizard storage adapter (Candidate 1 deepening, ADR-0029-pattern).
 * Module: storage adapter at the persistence seam — injectable for tests.
 */

export interface WizardStorageAdapter {
	get: () => string | null;
	set: (value: string) => void;
	remove: () => void;
}

export const WIZARD_STORAGE_KEY = 'hwis:esl-wizard';
export const WIZARD_STATE_VERSION = 2;

export function serializeWizardState(state: unknown): string {
	return JSON.stringify({ version: WIZARD_STATE_VERSION, state });
}

export function parseWizardStorage(raw: string): unknown | null {
	try {
		const parsed = JSON.parse(raw);
		if (parsed?.version === WIZARD_STATE_VERSION) return parsed.state;
	} catch {
		/* ignore */
	}
	return null;
}
