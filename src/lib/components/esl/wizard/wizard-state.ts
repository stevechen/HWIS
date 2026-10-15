/**
 * Wizard shell state and its sessionStorage round-trip (ticket #218, spec #215).
 *
 * The wizard is one page with client-side step navigation: everything the
 * admin picks lives in a single `WizardState` object that is mirrored into
 * `sessionStorage` on every change, so an accidental refresh resumes the
 * setup instead of losing it (spec story 30: Cancel still writes nothing).
 *
 * Pure module — no Convex, no components, no wall-clock reads (callers pass
 * `today`). The step UIs (#219–#223) own their step's *content*; this module
 * owns the shape, the forward gates and the storage seam. Only `WizardState`
 * itself is reactive; every write goes through the shell's `update()`, so
 * one place decides when the session copy is refreshed.
 */

import {
	defaultEndDate,
	defaultStartDate,
	EXAM_SLOT_ORDER,
	schoolYearForTerm,
	suggestSemester,
	type ExamSlot,
	type Term
} from './wizard-dates';

export type WizardStepNumber = 1 | 2 | 3 | 4 | 5;

/**
 * Versioned key so a shape change starts a fresh wizard instead of feeding
 * an old payload into a new parser.
 */
export const WIZARD_STORAGE_KEY = 'hwis:esl-wizard';
export const WIZARD_STATE_VERSION = 1;

/** The three storage calls the wizard needs — `window.sessionStorage` fits. */
export type WizardStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What a step panel gets handed when it renders. */
export interface WizardStepApi {
	state: WizardState;
	step: WizardStepNumber;
	/**
	 * Apply a change to the wizard state and persist it. Steps never
	 * mutate `state` directly — going through here is what keeps the
	 * sessionStorage copy and the screen in step.
	 */
	update: (mutate: (draft: WizardState) => void) => void;
}

export interface WizardOffDay {
	date: string;
	name: string;
}

export interface WizardExamRange {
	label: ExamSlot;
	dates: string[];
}

/** Step 1 — term, school year and the first day of school. */
export interface WizardStep1State {
	term: Term | null;
	schoolYear: string | null;
	startDate: string | null;
}

/** Step 2 — term boundary plus the imported holiday off days. */
export interface WizardStep2State {
	endDate: string | null;
	offDays: WizardOffDay[];
	holidaysImported: boolean;
	/** "This is also the last exam day" checkbox — default true (Final hidden). */
	lastExamDay: boolean;
}

/** Step 3 — the three exam ranges (Exam 1/2 = 2 class days, Final = 3). */
export interface WizardStep3State {
	exams: WizardExamRange[];
}

/** Step 4 — School and ESL event rows (ticket #222). */
export interface WizardStep4State {
	/** Single-date school events (date or null). */
	singles: {
		anniv: string | null;
		makeup: string | null;
		sports: string | null;
		grad: string | null;
	};
	/** Two-consecutive-class-day school events (G9 Mocks). */
	pairs: {
		mock1: string[] | null;
		mock2: string[] | null;
		mock3: string[] | null;
	};
	/** Ranged ESL reminder events (arrays of class-day dates). */
	ranges: {
		q1: string[] | null;
		q2: string[] | null;
		q3: string[] | null;
		q4: string[] | null;
		q5: string[] | null;
		q6: string[] | null;
		pd1: string[] | null;
		pd2: string[] | null;
		pd3: string[] | null;
		rd1: string[] | null;
		rd2: string[] | null;
		rd3: string[] | null;
		pcheck: string[] | null;
		wcheck: string[] | null;
	};
	/** Sports Day on/off (default true). */
	sportsOn: boolean;
}

/**
 * Step 5 — preview & save state.
 * Stores custom events created by the admin and inline edits to any event.
 */
export interface WizardCustomEvent {
	id: string; // client-generated temp ID (e.g., "custom-1")
	type: 'meeting' | 'banner';
	// Meeting-specific fields
	date?: string;
	target?: 'all' | 'CLIL' | 'Comm' | 'G7' | 'G8' | 'G9' | 'H1';
	subType?: 'partial' | 'no_class' | 'task';
	note?: string;
	// Banner-specific fields
	startDate?: string;
	endDate?: string;
	bannerText?: string;
}

export interface WizardEventEdit {
	eventKey: string; // e.g., "step1:startDate", "step2:offDays:0", "step3:exams:Exam 1:0", "step4:school:anniv", "custom:custom-1"
	date?: string;
	note?: string;
	endDate?: string; // for banner range
}

export interface WizardStep5State {
	customEvents: WizardCustomEvent[];
	eventEdits: WizardEventEdit[];
}

export interface WizardState {
	/** The step on screen — persisted so a refresh lands where the admin left off. */
	currentStep: WizardStepNumber;
	/** Optional semester ID when editing an existing semester (set after Step 5 save). */
	semesterId: string | null;
	step1: WizardStep1State;
	step2: WizardStep2State;
	step3: WizardStep3State;
	step4: WizardStep4State;
	step5: WizardStep5State;
}

export interface WizardStepDefinition {
	number: WizardStepNumber;
	label: string;
}

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
	{ number: 1, label: 'Semester & start' },
	{ number: 2, label: 'End & holidays' },
	{ number: 3, label: 'Exams' },
	{ number: 4, label: 'Events' },
	{ number: 5, label: 'Preview & save' }
];

/**
 * A fresh wizard, seeded the way Step 1 opens: the suggested term with the
 * school year *derived* for that term (F8/F9 — in Oct–Dec `suggestSemester`
 * names next fall while `schoolYearForTerm` still describes this one, and
 * the pickers render off the derived year), plus the default start and end
 * dates so the calendar has something to show before any click.
 */
export function createInitialWizardState(today: string): WizardState {
	const suggestion = suggestSemester(today);
	const schoolYear = schoolYearForTerm(suggestion.term, today);
	return {
		currentStep: 1,
		semesterId: null,
		step1: {
			term: suggestion.term,
			schoolYear,
			startDate: defaultStartDate(suggestion.term, schoolYear)
		},
		step2: {
			endDate: defaultEndDate(suggestion.term, schoolYear),
			offDays: [],
			holidaysImported: false,
			lastExamDay: true
		},
		step3: { exams: [] },
		step4: {
			singles: { anniv: null, makeup: null, sports: null, grad: null },
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
			sportsOn: true
		},
		step5: {
			customEvents: [],
			eventEdits: []
		}
	};
}

/** A Step 4 row counts as set when it holds at least one date. */
function isSetRow(dates: readonly string[] | null): boolean {
	return dates !== null && dates.length > 0;
}

/**
 * Whether a step holds everything the next one needs (spec: strict forward
 * flow — Step N depends only on Steps 1..N-1). Step 5 has no content yet;
 * #223 replaces that case with its own rule.
 */
export function isStepComplete(state: WizardState, step: WizardStepNumber): boolean {
	switch (step) {
		case 1:
			return (
				state.step1.term !== null &&
				state.step1.schoolYear !== null &&
				state.step1.startDate !== null
			);
		case 2: {
			const { endDate } = state.step2;
			const { startDate } = state.step1;
			return endDate !== null && startDate !== null && endDate >= startDate;
		}
		case 3:
			return EXAM_SLOT_ORDER.every((slot) =>
				state.step3.exams.some((exam) => exam.label === slot && exam.dates.length > 0)
			);
		case 4: {
			// Every required Step 4 row is set: Sports Day (unless off),
			// G9 mocks (2 S1 / 3 S2), Graduation + Anniversary pair (S2),
			// all 6 quizzes, passport/recording dues (3 S1 / 2 S2 each),
			// and both end-of-term checks.
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
			const quizzes: ReadonlyArray<readonly string[] | null> = [
				s4.ranges.q1,
				s4.ranges.q2,
				s4.ranges.q3,
				s4.ranges.q4,
				s4.ranges.q5,
				s4.ranges.q6
			];
			if (quizzes.some((q) => !isSetRow(q))) return false;
			const dues: ReadonlyArray<readonly string[] | null> = s2
				? [s4.ranges.pd1, s4.ranges.pd2, s4.ranges.rd1, s4.ranges.rd2]
				: [
						s4.ranges.pd1,
						s4.ranges.pd2,
						s4.ranges.pd3,
						s4.ranges.rd1,
						s4.ranges.rd2,
						s4.ranges.rd3
					];
			if (dues.some((d) => !isSetRow(d))) return false;
			if (!isSetRow(s4.ranges.pcheck)) return false;
			if (!isSetRow(s4.ranges.wcheck)) return false;
			return true;
		}
		case 5:
			// The preview is ready once everything it previews is (Step 4 complete).
			// Step 5 itself has no additional required fields — the Save button
			// is enabled once there is at least one event to save.
			return isStepComplete(state, 4);
	}
}

/**
 * Whether the stepper tab for `step` may be clicked (ticket #218: "clickable
 * only for completed steps"). A step opens when it is complete — which for
 * the seeded defaults is already true for steps 1 and 2 — and a step the
 * admin has already reached stays open, so going back is never a trap even
 * when a prerequisite has since been cleared. Forward movement that needs
 * work (an exam-less step 3, an empty step 4) is what the Next button is
 * for, and it enforces the strict forward flow on the current step.
 */
export function isStepUnlocked(state: WizardState, step: WizardStepNumber): boolean {
	if (state.currentStep >= step) return true;
	return isStepComplete(state, step);
}

export function nextWizardStep(step: WizardStepNumber): WizardStepNumber | null {
	return step < 5 ? ((step + 1) as WizardStepNumber) : null;
}

export function previousWizardStep(step: WizardStepNumber): WizardStepNumber | null {
	return step > 1 ? ((step - 1) as WizardStepNumber) : null;
}

interface WizardEnvelope {
	version: number;
	state: WizardState;
}

/** The exact payload a state serializes to — the storage comparison unit. */
export function serializeWizardState(state: WizardState): string {
	const envelope: WizardEnvelope = { version: WIZARD_STATE_VERSION, state };
	return JSON.stringify(envelope);
}

export function writeWizardState(storage: WizardStorage | null, state: WizardState): void {
	if (storage === null) return;
	try {
		storage.setItem(WIZARD_STORAGE_KEY, serializeWizardState(state));
	} catch {
		// Private browsing or a full quota: the wizard keeps working in memory.
	}
}

export function clearWizardState(storage: WizardStorage | null): void {
	if (storage === null) return;
	try {
		storage.removeItem(WIZARD_STORAGE_KEY);
	} catch {
		// Nothing to discard if the store refuses the call.
	}
}

/**
 * Read the stored wizard. Never throws and never returns a half-parsed
 * state: an unusable payload (absent, unparseable, foreign version, wrong
 * shapes) yields the seeded state with `resumed: false`, and each field that
 * is missing or junk falls back to its seeded default while the rest of the
 * payload survives.
 */
export function readWizardState(
	storage: WizardStorage | null,
	today: string
): { state: WizardState; resumed: boolean } {
	const seeded = createInitialWizardState(today);
	if (storage === null) return { state: seeded, resumed: false };

	let raw: string | null = null;
	try {
		raw = storage.getItem(WIZARD_STORAGE_KEY);
	} catch {
		return { state: seeded, resumed: false };
	}
	if (raw === null || raw === '') return { state: seeded, resumed: false };

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { state: seeded, resumed: false };
	}
	if (!isRecord(parsed) || parsed.version !== WIZARD_STATE_VERSION) {
		return { state: seeded, resumed: false };
	}

	const restored = parseWizardState(parsed.state, seeded);
	if (restored === null) return { state: seeded, resumed: false };
	return { state: restored, resumed: true };
}

function parseWizardState(raw: unknown, seeded: WizardState): WizardState | null {
	if (!isRecord(raw)) return null;
	return {
		currentStep: parseStepNumber(raw.currentStep) ?? seeded.currentStep,
		semesterId: typeof raw.semesterId === 'string' ? raw.semesterId : seeded.semesterId,
		step1: parseStep1(raw.step1, seeded.step1),
		step2: parseStep2(raw.step2, seeded.step2),
		step3: parseStep3(raw.step3, seeded.step3),
		step4: parseStep4(raw.step4, seeded.step4),
		step5: parseStep5(raw.step5, seeded.step5)
	};
}

function parseStepNumber(value: unknown): WizardStepNumber | null {
	return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function parseStep1(raw: unknown, seeded: WizardStep1State): WizardStep1State {
	if (!isRecord(raw)) return seeded;
	return {
		term: raw.term === 'S1' || raw.term === 'S2' ? raw.term : seeded.term,
		schoolYear: isSchoolYear(raw.schoolYear) ? raw.schoolYear : seeded.schoolYear,
		startDate: parseDate(raw.startDate) ?? seeded.startDate
	};
}

function parseStep2(raw: unknown, seeded: WizardStep2State): WizardStep2State {
	if (!isRecord(raw)) return seeded;
	const offDays = Array.isArray(raw.offDays)
		? raw.offDays.flatMap((day): WizardOffDay[] => {
				if (!isRecord(day)) return [];
				const date = parseDate(day.date);
				if (date === null || typeof day.name !== 'string') return [];
				return [{ date, name: day.name }];
			})
		: seeded.offDays;
	return {
		endDate: parseDate(raw.endDate) ?? seeded.endDate,
		offDays,
		holidaysImported:
			typeof raw.holidaysImported === 'boolean' ? raw.holidaysImported : seeded.holidaysImported,
		lastExamDay: typeof raw.lastExamDay === 'boolean' ? raw.lastExamDay : seeded.lastExamDay
	};
}

function parseStep3(raw: unknown, seeded: WizardStep3State): WizardStep3State {
	if (!isRecord(raw) || !Array.isArray(raw.exams)) return seeded;
	const exams = raw.exams.flatMap((exam): WizardExamRange[] => {
		if (
			!isRecord(exam) ||
			(exam.label !== 'Exam 1' && exam.label !== 'Exam 2' && exam.label !== 'Final')
		) {
			return [];
		}
		const dates = Array.isArray(exam.dates)
			? exam.dates.flatMap((date): string[] => {
					const parsedDate = parseDate(date);
					return parsedDate === null ? [] : [parsedDate];
				})
			: [];
		if (dates.length === 0) return [];
		return [{ label: exam.label, dates }];
	});
	return { exams };
}

function parseStep5(raw: unknown, seeded: WizardStep5State): WizardStep5State {
	if (!isRecord(raw)) return seeded;
	const customEvents = Array.isArray(raw.customEvents)
		? raw.customEvents.flatMap((event): WizardCustomEvent[] => {
				if (!isRecord(event)) return [];
				if (event.type !== 'meeting' && event.type !== 'banner') return [];
				const id = typeof event.id === 'string' ? event.id : `custom-${Date.now()}`;
				if (event.type === 'meeting') {
					return [
						{
							id,
							type: 'meeting',
							date: parseDate(event.date) ?? undefined,
							target:
								typeof event.target === 'string' &&
								['all', 'CLIL', 'Comm', 'G7', 'G8', 'G9', 'H1'].includes(event.target)
									? (event.target as 'all' | 'CLIL' | 'Comm' | 'G7' | 'G8' | 'G9' | 'H1')
									: undefined,
							subType:
								typeof event.subType === 'string' &&
								['partial', 'no_class', 'task'].includes(event.subType)
									? (event.subType as 'partial' | 'no_class' | 'task')
									: undefined,
							note: typeof event.note === 'string' ? event.note : undefined
						}
					];
				} else {
					return [
						{
							id,
							type: 'banner',
							startDate: parseDate(event.startDate) ?? undefined,
							endDate: parseDate(event.endDate) ?? undefined,
							bannerText: typeof event.bannerText === 'string' ? event.bannerText : undefined,
							note: typeof event.note === 'string' ? event.note : undefined
						}
					];
				}
			})
		: seeded.customEvents;
	const eventEdits = Array.isArray(raw.eventEdits)
		? raw.eventEdits.flatMap((edit): WizardEventEdit[] => {
				if (!isRecord(edit)) return [];
				const eventKey = typeof edit.eventKey === 'string' ? edit.eventKey : '';
				if (!eventKey) return [];
				return [
					{
						eventKey,
						date: parseDate(edit.date) ?? undefined,
						note: typeof edit.note === 'string' ? edit.note : undefined,
						endDate: parseDate(edit.endDate) ?? undefined
					}
				];
			})
		: seeded.eventEdits;
	return { customEvents, eventEdits };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isSchoolYear(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{4}$/.test(value);
}

function parseDate(value: unknown): string | null {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseStep4(raw: unknown, seeded: WizardStep4State): WizardStep4State {
	if (!isRecord(raw)) return seeded;
	const singles = isRecord(raw.singles)
		? {
				anniv: parseDate(raw.singles.anniv) ?? seeded.singles.anniv,
				makeup: parseDate(raw.singles.makeup) ?? seeded.singles.makeup,
				sports: parseDate(raw.singles.sports) ?? seeded.singles.sports,
				grad: parseDate(raw.singles.grad) ?? seeded.singles.grad
			}
		: seeded.singles;
	const pairs = isRecord(raw.pairs)
		? {
				mock1: parseDateArray(raw.pairs.mock1) ?? seeded.pairs.mock1,
				mock2: parseDateArray(raw.pairs.mock2) ?? seeded.pairs.mock2,
				mock3: parseDateArray(raw.pairs.mock3) ?? seeded.pairs.mock3
			}
		: seeded.pairs;
	const ranges = isRecord(raw.ranges)
		? {
				q1: parseDateArray(raw.ranges.q1) ?? seeded.ranges.q1,
				q2: parseDateArray(raw.ranges.q2) ?? seeded.ranges.q2,
				q3: parseDateArray(raw.ranges.q3) ?? seeded.ranges.q3,
				q4: parseDateArray(raw.ranges.q4) ?? seeded.ranges.q4,
				q5: parseDateArray(raw.ranges.q5) ?? seeded.ranges.q5,
				q6: parseDateArray(raw.ranges.q6) ?? seeded.ranges.q6,
				pd1: parseDateArray(raw.ranges.pd1) ?? seeded.ranges.pd1,
				pd2: parseDateArray(raw.ranges.pd2) ?? seeded.ranges.pd2,
				pd3: parseDateArray(raw.ranges.pd3) ?? seeded.ranges.pd3,
				rd1: parseDateArray(raw.ranges.rd1) ?? seeded.ranges.rd1,
				rd2: parseDateArray(raw.ranges.rd2) ?? seeded.ranges.rd2,
				rd3: parseDateArray(raw.ranges.rd3) ?? seeded.ranges.rd3,
				pcheck: parseDateArray(raw.ranges.pcheck) ?? seeded.ranges.pcheck,
				wcheck: parseDateArray(raw.ranges.wcheck) ?? seeded.ranges.wcheck
			}
		: seeded.ranges;
	const sportsOn = typeof raw.sportsOn === 'boolean' ? raw.sportsOn : seeded.sportsOn;
	return { singles, pairs, ranges, sportsOn };
}

function parseDateArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const dates = value.flatMap((d): string[] => {
		const parsed = parseDate(d);
		return parsed === null ? [] : [parsed];
	});
	return dates.length > 0 ? dates : null;
}
