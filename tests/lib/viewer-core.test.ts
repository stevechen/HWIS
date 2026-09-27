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

const eslOnlyTeacher: Viewer = {
	_id: 'user_4' as Id<'users'>,
	name: 'ESL Teacher',
	email: 'four@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'active',
	departmentRoles: { esl: 'teacher' },
	profileExists: true
};

const hybridTeacher: Viewer = {
	_id: 'user_5' as Id<'users'>,
	name: 'Hybrid Teacher',
	email: 'five@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'active',
	departmentRoles: { international: 'teacher', esl: 'admin' },
	profileExists: true
};

const activeSuper: Viewer = {
	_id: 'user_6' as Id<'users'>,
	name: 'Super Admin',
	email: 'super@hwhs.tc.edu.tw',
	role: 'super',
	status: 'active',
	profileExists: true
};

describe('settleViewer department derivation', () => {
	it('treats legacy staff rows as International-only (role fallback)', () => {
		const teacher = settleViewer(settledAuth(), profileFor(activeTeacher));
		expect(teacher.isInternationalStaff).toBe(true);
		expect(teacher.isEslStaff).toBe(false);
		expect(teacher.isHybridStaff).toBe(false);

		const admin = settleViewer(settledAuth(), profileFor(activeAdmin));
		expect(admin.isInternationalStaff).toBe(true);
		expect(admin.isEslStaff).toBe(false);
		expect(admin.isHybridStaff).toBe(false);
	});

	it('marks an ESL-only teacher as ESL without International access', () => {
		const session = settleViewer(settledAuth(), profileFor(eslOnlyTeacher));
		expect(session.status).toBe('active');
		expect(session.isEslStaff).toBe(true);
		expect(session.isInternationalStaff).toBe(false);
		expect(session.isHybridStaff).toBe(false);
	});

	it('marks a hybrid teacher as spanning both departments', () => {
		const session = settleViewer(settledAuth(), profileFor(hybridTeacher));
		expect(session.isInternationalStaff).toBe(true);
		expect(session.isEslStaff).toBe(true);
		expect(session.isHybridStaff).toBe(true);
	});

	it('gives Super universal access to both departments', () => {
		const session = settleViewer(settledAuth(), profileFor(activeSuper));
		expect(session.isInternationalStaff).toBe(true);
		expect(session.isEslStaff).toBe(true);
		expect(session.isHybridStaff).toBe(true);
	});

	it('marks students, pending users, and anonymous viewers with no department', () => {
		const student = settleViewer(settledAuth(), profileFor(enrolledStudent));
		expect(student.isInternationalStaff).toBe(false);
		expect(student.isEslStaff).toBe(false);

		const pending = settleViewer(settledAuth(), profileFor(pendingUser));
		expect(pending.isInternationalStaff).toBe(true);
		expect(pending.isEslStaff).toBe(false);

		const signedOut = settleViewer({ isLoading: false, isAuthenticated: false }, profileFor(null));
		expect(signedOut.isInternationalStaff).toBe(false);
		expect(signedOut.isEslStaff).toBe(false);
		expect(signedOut.isHybridStaff).toBe(false);

		const noProfile = settleViewer(settledAuth(), profileFor(newUser));
		expect(noProfile.isInternationalStaff).toBe(false);
		expect(noProfile.isEslStaff).toBe(false);
		expect(noProfile.isHybridStaff).toBe(false);
	});
});
