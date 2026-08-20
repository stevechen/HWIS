import { describe, it, expect } from 'vitest';
import { buildViewerSession, makeViewerSession } from './route-mocks';

describe('buildViewerSession', () => {
	it('derives an active admin session', () => {
		const session = buildViewerSession({ role: 'admin', status: 'active' });
		expect(session.status).toBe('active');
		expect(session.isAdmin).toBe(true);
		expect(session.isTeacher).toBe(false);
		expect(session.viewer?.role).toBe('admin');
		expect(session.capabilities.viewAnyEvaluation).toBe(true);
		expect(session.capabilities.editAnyEvaluation).toBe(false);
	});

	it('derives an active super session with editAnyEvaluation', () => {
		const session = buildViewerSession({ role: 'super', status: 'active' });
		expect(session.status).toBe('active');
		expect(session.isAdmin).toBe(true);
		expect(session.capabilities.editAnyEvaluation).toBe(true);
	});

	it('derives an active teacher session', () => {
		const session = buildViewerSession({ role: 'teacher', status: 'active' });
		expect(session.status).toBe('active');
		expect(session.isTeacher).toBe(true);
		expect(session.isAdmin).toBe(false);
		expect(session.capabilities.viewOwnEvaluation).toBe(true);
		expect(session.capabilities.viewAnyEvaluation).toBe(false);
	});

	it('derives a pending session for a pending teacher', () => {
		const session = buildViewerSession({ role: 'teacher', status: 'pending' });
		expect(session.status).toBe('pending');
		expect(session.isTeacher).toBe(false);
		expect(session.isAdmin).toBe(false);
		expect(session.isApproved).toBe(false);
	});

	it('derives an active session for an enrolled student', () => {
		const session = buildViewerSession({
			role: 'student',
			status: 'active',
			enrollmentStatus: 'Enrolled'
		});
		expect(session.status).toBe('active');
		expect(session.isStudent).toBe(true);
		expect(session.isEnrolled).toBe(true);
		expect(session.isApproved).toBe(true);
		expect(session.capabilities.viewOwnEvaluation).toBe(true);
	});

	it('mirrors the real backend for a not-enrolled student (anonymous actor, pending)', () => {
		const session = buildViewerSession({
			role: 'student',
			status: 'active',
			enrollmentStatus: 'Not Enrolled'
		});
		expect(session.status).toBe('pending');
		expect(session.isStudent).toBe(false);
		expect(session.isEnrolled).toBe(true);
		expect(session.isApproved).toBe(false);
	});

	it('derives needsProfileCreation for a new user (profileExists false)', () => {
		const session = buildViewerSession({
			role: undefined,
			status: undefined,
			profileExists: false
		});
		expect(session.status).toBe('pending');
		expect(session.needsProfileCreation).toBe(true);
		expect(session.isApproved).toBe(false);
	});

	it('is signedOut when auth says not authenticated', () => {
		const session = buildViewerSession({ auth: { isAuthenticated: false } });
		expect(session.status).toBe('signedOut');
		expect(session.viewer).toBeNull();
		expect(session.needsProfileCreation).toBe(false);
	});

	it('is loading when auth is still loading', () => {
		const session = buildViewerSession({ auth: { isLoading: true } });
		expect(session.status).toBe('loading');
	});
});

describe('makeViewerSession', () => {
	it('patches derived fields via overrides', () => {
		const session = makeViewerSession(
			{ role: 'student', status: 'active', enrollmentStatus: 'Not Enrolled' },
			{ isStudent: true, isEnrolled: false, status: 'pending' }
		);
		expect(session.isStudent).toBe(true);
		expect(session.isEnrolled).toBe(false);
		expect(session.status).toBe('pending');
	});

	it('keeps derived fields when no overrides are given', () => {
		const session = makeViewerSession({ role: 'admin', status: 'active' });
		expect(session.status).toBe('active');
		expect(session.isAdmin).toBe(true);
	});
});
