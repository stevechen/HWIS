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
	events: { type: string; date: string; title: string }[],
	derivedEnd: string | null
): { date: string; label: string } | null {
	if (derivedEnd === null) return null;
	const source = events.find((event) => event.type === 'exam' && event.date === derivedEnd);
	return { date: derivedEnd, label: source?.title ?? 'exam' };
}

/** The sibling term an exam date is judged against for the S1/S2 cross check. */
export type SiblingSemester = {
	year: string;
	term: 'S1' | 'S2';
	startDate: string;
	derivedEnd?: string | null;
} | null;

/**
 * Friendly URL slug for a semester (ticket #230 follow-up). `year` is
 * already `YYYY-YYYY` and unique per term on the backend (`by_year_term`),
 * so `${year}-${term}` — e.g. `2026-2027-S1` — is unique, stable, and
 * readable. The detail route resolves this slug (falling back to the raw
 * Convex id for old bookmarks, e2e links, and the wizard save handoff).
 */
export function semesterSlug(semester: { year: string; term: 'S1' | 'S2' }): string {
	return `${semester.year}-${semester.term}`;
}

/**
 * Parse a detail-route slug back into year + term. Returns null for
 * anything else (notably raw Convex ids, which the route passes through
 * to the id lookup).
 */
export function parseSemesterSlug(slug: string): { year: string; term: 'S1' | 'S2' } | null {
	const match = /^(\d{4}-\d{4})-(S1|S2)$/.exec(slug);
	if (!match) return null;
	return { year: match[1]!, term: match[2] as 'S1' | 'S2' };
}

/**
 * The Gregorian calendar years whose official CSVs a semester's window
 * spans — the setup page offers one upload per year (ticket #208). S1
 * starts in the fall and ends the next spring, so it always spans two
 * (fall 2026 → 2026+2027); S2 sits inside one spring.
 */
export function semesterUploadYears(term: 'S1' | 'S2', startDate: string): string[] {
	const year = startDate.slice(0, 4);
	if (term === 'S2') return [year];
	return [year, String(Number(year) + 1)];
}

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
