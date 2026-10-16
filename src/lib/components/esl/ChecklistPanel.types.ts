export type ChecklistGroup = 'off' | 'quiz' | 'units' | 'passport' | 'recording' | 'g9mock';

export type ChecklistStatus = {
	window: { start: string; end: string };
	off: { expected: string[]; present: string[]; missing: string[]; ok: boolean };
	quiz: { expected: number; present: number };
	units: { expected: number; present: number };
	passport: { expected: number; present: number };
	recording: { expected: number; present: number };
	g9mock: { expectedStarts: number; expectedRows: number; presentRows: number };
};
