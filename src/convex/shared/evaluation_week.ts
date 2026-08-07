// Evaluation week policy.
//
// The single calendar rule that drives edit/delete authorization (Convex
// mutations) and the copy shown in the UI (lock date). Convex is the
// authoritative enforcer (ADR-0002); the Svelte client imports these same pure
// functions so it never reconstructs the week math itself.
//
// A week runs Monday 00:00 through Sunday 23:59:59.999 in TAIWAN time
// (Asia/Taipei, fixed UTC+8, no DST). The boundary is computed from the
// absolute timestamp regardless of the host process timezone, so the Convex
// server, the teacher's browser, and the admin's weekly reports all agree on
// the same week and lock cutoff. An evaluation created in week W locks for
// edit/delete at Monday 00:00 of week W+1 (ADR-0001).

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Asia/Taipei is a fixed UTC+8 with no DST, so shifting by this constant and
// reading the shifted instant's UTC calendar is exactly Taiwan wall-clock time.
const TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000;

// Monday 00:00 (Taiwan time) of the week containing `timestamp`, shifted by
// `dayOffset` days (0 = this week's Monday, 7 = next week's Monday, ...).
function taiwanMonday(timestamp: number, dayOffset: number): number {
	const t = new Date(timestamp + TAIWAN_OFFSET_MS);
	const day = t.getUTCDay();
	const diff = t.getUTCDate() - day + (day === 0 ? -6 : 1) + dayOffset;
	const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), diff));
	return monday.getTime() - TAIWAN_OFFSET_MS;
}

// Monday 00:00 (Taiwan time) of the week containing `timestamp`.
export function weekStartOf(timestamp: number): number {
	return taiwanMonday(timestamp, 0);
}

// Sunday 23:59:59.999 (Taiwan time) of the week containing `timestamp`.
export function weekEndOf(timestamp: number): number {
	return taiwanMonday(timestamp, 6) + (24 * 60 * 60 * 1000 - 1);
}

// Monday 00:00 (Taiwan time) of the week AFTER the week containing `timestamp`.
export function lockCutoffFor(timestamp: number): number {
	return taiwanMonday(timestamp, 7);
}

// An evaluation created at `timestamp` is still editable/deletable at `now`
// if and only if `now` is before the lock cutoff.
export function isEditable(timestamp: number, now: number = Date.now()): boolean {
	return now < lockCutoffFor(timestamp);
}
