import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isStudentEmail, extractStudentIdFromEmail } from '../auth';

/**
 * Resolves a student record from a Google email. Returns null when the email
 * is not a student-domain email, when its prefix does not parse to a student
 * ID, or when no matching record exists. This is the single source of truth
 * for the email -> student matching used by the viewer and the anonymous
 * evaluation query.
 */
export function resolveStudentFromEmail(
	email: string | undefined,
	ctx: QueryCtx
): Promise<Doc<'students'> | null> {
	if (!email || !isStudentEmail(email)) {
		return Promise.resolve(null);
	}
	const studentId = extractStudentIdFromEmail(email);
	if (!studentId) {
		return Promise.resolve(null);
	}
	return ctx.db
		.query('students')
		.withIndex('by_studentId', (q) => q.eq('studentId', studentId))
		.first();
}

/** Returns true when the given email belongs to a student-domain mailbox. */
export function isStudentEmailAddress(email?: string | null): boolean {
	return Boolean(email && isStudentEmail(email));
}
