import type { EslEventType } from '$convex/shared/esl';

export type SemesterStatus = 'upcoming' | 'current' | 'closed';

/**
 * The status chip for a semester, derived from dates only.
 *
 * `today` rides in as a `YYYY-MM-DD` string so every comparison stays lexical
 * (the codebase never reads the wall clock inside queries, and the chip keeps
 * the same rule on the client). An exam-less semester has no derivable end, so
 * past its start it reads `current` — the views clamp its window to
 * start→today (the finals-TBD state).
 */
export function semesterStatus(
	semester: { startDate: string; derivedEnd: string | null },
	today: string
): SemesterStatus {
	if (today < semester.startDate) return 'upcoming';
	if (semester.derivedEnd === null) return 'current';
	return today <= semester.derivedEnd ? 'current' : 'closed';
}

/**
 * The exam row a derived end came from, so the detail screen can say
 * "ends 1/20, from Final exam" instead of showing a bare computed date.
 * Null while no exams exist (finals TBD). A non-matching end cannot happen
 * through the backend (the end *is* the max exam date), but if it ever does
 * the date still shows with a generic label rather than vanishing.
 */
export function derivedEndSource(
	events: { type: string; date: string; label: string }[],
	derivedEnd: string | null
): { date: string; label: string } | null {
	if (derivedEnd === null) return null;
	const source = events.find((event) => event.type === 'exam' && event.date === derivedEnd);
	return { date: derivedEnd, label: source?.label ?? 'exam' };
}

/** The sibling term an exam date is judged against for the S1/S2 cross check. */
export type SiblingSemester = {
	year: string;
	term: 'S1' | 'S2';
	startDate: string;
	derivedEnd?: string | null;
} | null;

/**
 * An advisory warning when an exam date crosses the S1/S2 boundary — shown,
 * never a refusal (the backend stays silent on crosses; only off/exam-day
 * collisions refuse). Non-exam types never warn: only exams anchor the
 * derived end, so only their moves can shift a term boundary.
 */
export function boundaryCrossWarning(args: {
	term: 'S1' | 'S2';
	type: EslEventType;
	date: string;
	sibling: SiblingSemester;
}): string | null {
	if (args.type !== 'exam' || args.sibling === null) return null;
	if (args.term === 'S1' && args.sibling.term === 'S2' && args.date >= args.sibling.startDate) {
		return (
			`This exam lands on ${args.date}, on or after S2's start (${args.sibling.startDate}). ` +
			`The S1 end derives from exams, so S1 will stretch into S2's term — move it back if that is not intended.`
		);
	}
	if (args.term === 'S2' && args.sibling.term === 'S1') {
		if (args.date < args.sibling.startDate) {
			return (
				`This exam lands on ${args.date}, before S1 even starts (${args.sibling.startDate}). ` +
				`Check the year — an S2 exam belongs after S1.`
			);
		}
		const s1End = args.sibling.derivedEnd ?? null;
		if (s1End !== null && args.date <= s1End) {
			return (
				`This exam lands on ${args.date}, inside S1's exam window (ends ${s1End}). ` +
				`S1's end derives from its exams, so the terms overlap — move one of them if that is not intended.`
			);
		}
	}
	return null;
}
