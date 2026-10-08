import { browser } from '$app/environment';
import type { ViewerSession } from './viewer-core';

/** Departments the top-bar switcher toggles between. */
export type Department = 'international' | 'esl';

export const DEPARTMENT_STORAGE_KEY = 'hwis:last-department';

export const ESL_HOME = '/esl';
export const INTERNATIONAL_HOME = '/evaluations';
export const ADMIN_HOME = '/admin';

type DepartmentStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Maps a pathname to the department context it belongs to, or null when the
 * path carries no department meaning (/, /login, /admin, /leaderboard, ...).
 * Only department-bearing visits are persisted, so landing on /admin never
 * clobbers the stored last-visited department.
 */
export function resolveDepartmentFromPath(pathname: string): Department | null {
	if (pathname === '/esl' || pathname.startsWith('/esl/')) return 'esl';
	if (pathname === '/evaluations' || pathname.startsWith('/evaluations/')) return 'international';
	return null;
}

/** Validates a raw stored value; anything unexpected is treated as absent. */
export function parseStoredDepartment(raw: string | null | undefined): Department | null {
	return raw === 'esl' || raw === 'international' ? raw : null;
}

function activeStorage(override?: DepartmentStorage | null): DepartmentStorage | null {
	if (override !== undefined) return override;
	return browser ? localStorage : null;
}

/**
 * Reads the last-visited department. Accepts an injectable storage so unit
 * tests never depend on the browser flag; production callers pass nothing.
 */
export function readLastDepartment(storage?: DepartmentStorage | null): Department | null {
	const active = activeStorage(storage);
	if (!active) return null;
	try {
		return parseStoredDepartment(active.getItem(DEPARTMENT_STORAGE_KEY));
	} catch {
		return null;
	}
}

/** Persists the last-visited department. Never throws (private mode, SSR). */
export function storeLastDepartment(
	department: Department,
	storage?: DepartmentStorage | null
): void {
	const active = activeStorage(storage);
	if (!active) return;
	try {
		active.setItem(DEPARTMENT_STORAGE_KEY, department);
	} catch {
		// Storage unavailable — the in-session URL context still works.
	}
}

/**
 * The `[ HWIS | ESL ]` pill is strictly a hybrid/super affordance: single-
 * department staff never need to switch. Super users derive `isHybridStaff`
 * as true (universal access), so they are included without a special case.
 */
export function showDepartmentSwitcher(session: ViewerSession): boolean {
	return session.status === 'active' && session.isHybridStaff;
}

/** True when the session may enter `/esl/*`: active ESL staff (or Super). */
export function canAccessEsl(session: ViewerSession): boolean {
	return session.status === 'active' && session.isEslStaff;
}

/**
 * Role-aware root redirect target, or null when no redirect applies
 * (loading / signed out / pending approval — the root page's terminal
 * screens own those states).
 *
 * - Students keep their personal evaluations page (unchanged behavior).
 * - ESL-only staff land in the ESL department shell.
 * - Hybrid staff and Super return to their last-visited department,
 *   defaulting to the International home. Admins keep the existing `/admin`
 *   landing as their International default.
 * - Everyone else (International-only staff) lands on `/evaluations`.
 */
export function computeRootRedirect(
	session: ViewerSession,
	lastVisited: Department | null
): string | null {
	if (session.status !== 'active' || !session.viewer) return null;
	if (session.isStudent) {
		return session.viewer.studentId ? `/evaluations/student/${session.viewer.studentId}` : null;
	}
	if (session.isEslStaff && !session.isInternationalStaff) return ESL_HOME;
	if (session.isHybridStaff) {
		if (lastVisited === 'esl') return ESL_HOME;
		return session.isAdmin ? ADMIN_HOME : INTERNATIONAL_HOME;
	}
	if (session.isAdmin) return ADMIN_HOME;
	return INTERNATIONAL_HOME;
}
