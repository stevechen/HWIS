import { describe, it, expect } from 'vitest';
import { getEvaluationCapabilities, type AuthorizationActor } from '$convex/shared/authorization';
import type { Id } from '$convex/_generated/dataModel';
import { settleViewer, type AuthInput, type ProfileInput, type Viewer } from '$lib/viewer-core';

const activeTeacher: Viewer = {
	_id: 'user_1' as Id<'users'>,
	name: 'Teacher One',
	email: 'one@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'active',
	profileExists: true
};

const activeAdmin: Viewer = {
	_id: 'user_2' as Id<'users'>,
	name: 'Admin One',
	email: 'two@hwhs.tc.edu.tw',
	role: 'admin',
	status: 'active',
	profileExists: true
};

const pendingUser: Viewer = {
	_id: 'user_3' as Id<'users'>,
	name: 'Pending User',
	email: 'three@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'pending',
	profileExists: true
};

const newUser: Viewer = {
	name: 'New Teacher',
	email: 'new@hwhs.tc.edu.tw',
	profileExists: false
};

const enrolledStudent: Viewer = {
	_id: 'student_1' as Id<'users'>,
	name: 'Student One',
	email: 's888001@std.hwhs.tc.edu.tw',
	role: 'student',
	status: 'active',
	profileExists: true,
	studentId: '888001',
	enrollmentStatus: 'Enrolled'
};

const unenrolledStudent: Viewer = {
	_id: 'student_2' as Id<'users'>,
	name: 'Student Two',
	email: 's888002@std.hwhs.tc.edu.tw',
	role: 'student',
	status: 'active',
	profileExists: true,
	studentId: '888002',
	enrollmentStatus: 'Not Enrolled'
};

function buildActor(user: Viewer | null): AuthorizationActor {
	if (!user) return { kind: 'anonymous' };
	if (user.role === 'student') {
		return user.enrollmentStatus === 'Enrolled'
			? {
					kind: 'student',
					studentId: (user.studentId ?? 'student_1') as Id<'students'>,
					enrollmentStatus: 'Enrolled'
				}
			: { kind: 'anonymous' };
	}
	if (user.role && user.status) {
		return {
			kind: 'staff',
			subject: { role: user.role, status: user.status }
		};
	}
	return { kind: 'anonymous' };
}

function settledAuth(): AuthInput {
	return { isLoading: false, isAuthenticated: true };
}

function profileFor(user: Viewer | null, overrides: { isLoading?: boolean } = {}): ProfileInput {
	const actor = buildActor(user);
	return {
		isLoading: overrides.isLoading ?? false,
		data: {
			user,
			actor,
			capabilities: getEvaluationCapabilities(actor)
		}
	};
}

describe('settleViewer', () => {
	it('is loading while auth has not settled, even if the profile already resolved', () => {
		const session = settleViewer(
			{ isLoading: true, isAuthenticated: false },
			profileFor(activeTeacher)
		);
		expect(session.status).toBe('loading');
	});

	it('is loading while the profile query is loading', () => {
		const session = settleViewer(settledAuth(), profileFor(activeTeacher, { isLoading: true }));
		expect(session.status).toBe('loading');
	});

	it('stays loading when authenticated but the profile is still anonymous (JWT microtask race)', () => {
		const session = settleViewer(settledAuth(), profileFor(null));
		expect(session.status).toBe('loading');
	});

	it('is signedOut when auth settled and not authenticated', () => {
		const session = settleViewer({ isLoading: false, isAuthenticated: false }, profileFor(null));
		expect(session.status).toBe('signedOut');
		expect(session.viewer).toBeNull();
		expect(session.isApproved).toBe(false);
		expect(session.needsProfileCreation).toBe(false);
	});

	it('is pending for an active role-less new user awaiting approval', () => {
		const session = settleViewer(settledAuth(), profileFor(newUser));
		expect(session.status).toBe('pending');
		expect(session.isApproved).toBe(false);
	});

	it('is pending for a teacher with status pending', () => {
		const session = settleViewer(settledAuth(), profileFor(pendingUser));
		expect(session.status).toBe('pending');
	});

	it('is pending for a not-enrolled student (real query returns an anonymous actor)', () => {
		const session = settleViewer(settledAuth(), profileFor(unenrolledStudent));
		expect(session.status).toBe('pending');
		expect(session.isStudent).toBe(false);
		expect(session.isEnrolled).toBe(true);
		expect(session.isApproved).toBe(false);
	});

	it('is active for an active teacher', () => {
		const session = settleViewer(settledAuth(), profileFor(activeTeacher));
		expect(session.status).toBe('active');
		expect(session.isTeacher).toBe(true);
		expect(session.isAdmin).toBe(false);
		expect(session.isApproved).toBe(true);
	});

	it('is active for an active admin with admin capabilities', () => {
		const session = settleViewer(settledAuth(), profileFor(activeAdmin));
		expect(session.status).toBe('active');
		expect(session.isAdmin).toBe(true);
		expect(session.isTeacher).toBe(false);
		expect(session.isApproved).toBe(true);
	});

	it('is active for an enrolled student', () => {
		const session = settleViewer(settledAuth(), profileFor(enrolledStudent));
		expect(session.status).toBe('active');
		expect(session.isStudent).toBe(true);
		expect(session.isEnrolled).toBe(true);
		expect(session.isApproved).toBe(true);
	});

	it('needsProfileCreation only for a settled authenticated user whose profile row is missing', () => {
		expect(settleViewer(settledAuth(), profileFor(newUser)).needsProfileCreation).toBe(true);
		expect(settleViewer(settledAuth(), profileFor(activeTeacher)).needsProfileCreation).toBe(false);
	});

	it('never needsProfileCreation while loading, signed out, or during the JWT race', () => {
		expect(
			settleViewer({ isLoading: true, isAuthenticated: false }, profileFor(newUser))
				.needsProfileCreation
		).toBe(false);
		expect(
			settleViewer({ isLoading: false, isAuthenticated: false }, profileFor(newUser))
				.needsProfileCreation
		).toBe(false);
		expect(settleViewer(settledAuth(), profileFor(null)).needsProfileCreation).toBe(false);
	});

	it('exposes the viewer identity with a stable shape', () => {
		const session = settleViewer(settledAuth(), profileFor(activeTeacher));
		expect(session.viewer?._id).toBe('user_1');
		expect(session.viewer?.role).toBe('teacher');
		expect(session.viewer?.status).toBe('active');
	});
});
