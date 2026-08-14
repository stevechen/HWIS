import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, createStudentWithClass, seedUser } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import { noEvaluationCapabilities } from './shared/authorization';

describe('users.profile (merged viewer + capabilities)', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('unauthenticated', () => {
		it('returns null user with anonymous actor and no capabilities', async () => {
			const t = convexTest(schema, modules);
			mockAuthUser(null);

			const result = await t.query(api.users.profile, {});

			expect(result.user).toBeNull();
			expect(result.actor).toEqual({ kind: 'anonymous' });
			expect(result.capabilities).toEqual(noEvaluationCapabilities);
		});
	});

	describe('student viewer', () => {
		it('synthesizes student user + student actor + viewOwnEvaluation capabilities', async () => {
			const t = convexTest(schema, modules);
			const { studentId } = await createStudentWithClass(t, {
				englishName: 'Test Student',
				chineseName: '測試',
				studentId: '888001',
				grade: 10,
				classNum: '1',
				status: 'Enrolled'
			});

			mockAuthUser({ authId: 'student-1', email: 's888001@std.hwhs.tc.edu.tw' });

			const result = await t.query(api.users.profile, {});

			expect(result.user?.role).toBe('student');
			expect(result.user?.status).toBe('active');
			expect(result.user?.profileExists).toBe(true);
			expect(result.user?.studentId).toBe('888001');
			expect(result.user?.enrollmentStatus).toBe('Enrolled');
			expect(result.user?.studentRecordId).toBe(studentId);
			expect(result.user?.englishName).toBe('Test Student');

			expect(result.actor).toEqual({
				kind: 'student',
				studentId,
				enrollmentStatus: 'Enrolled'
			});
			expect(result.capabilities).toEqual({
				viewAnyEvaluation: false,
				viewOwnEvaluation: true,
				editOwnEvaluation: false,
				editAnyEvaluation: false
			});
		});

		it('synthesizes anonymous actor when student is Not Enrolled', async () => {
			const t = convexTest(schema, modules);
			await createStudentWithClass(t, {
				englishName: 'Departed Student',
				chineseName: '離校',
				studentId: '888002',
				grade: 10,
				classNum: '1',
				status: 'Not Enrolled'
			});

			mockAuthUser({ authId: 'student-2', email: 's888002@std.hwhs.tc.edu.tw' });

			const result = await t.query(api.users.profile, {});

			expect(result.user?.role).toBe('student');
			expect(result.user?.status).toBe('active');
			expect(result.user?.enrollmentStatus).toBe('Not Enrolled');

			expect(result.actor).toEqual({ kind: 'anonymous' });
			expect(result.capabilities).toEqual(noEvaluationCapabilities);
		});

		it('synthesizes anonymous actor when student email matches no record', async () => {
			const t = convexTest(schema, modules);
			mockAuthUser({ authId: 'student-3', email: 's999999@std.hwhs.tc.edu.tw' });

			const result = await t.query(api.users.profile, {});

			expect(result.user?.role).toBe('student');
			expect(result.user?.status).toBe('active');
			expect(result.user?.profileExists).toBe(true);
			expect(result.user?.studentId).toBeUndefined();
			expect(result.user?.enrollmentStatus).toBeUndefined();

			expect(result.actor).toEqual({ kind: 'anonymous' });
			expect(result.capabilities).toEqual(noEvaluationCapabilities);
		});
	});

	describe('staff viewer', () => {
		it('resolves teacher profile + staff actor + viewOwnEvaluation capabilities', async () => {
			const t = convexTest(schema, modules);
			await seedUser(t, {
				authId: 'teacher-1',
				role: 'teacher',
				status: 'active',
				name: 'Sam Teacher'
			});

			mockAuthUser({ authId: 'teacher-1' });

			const result = await t.query(api.users.profile, {});

			expect(result.user?.role).toBe('teacher');
			expect(result.user?.status).toBe('active');
			expect(result.user?.profileExists).toBe(true);
			expect(result.user?.authId).toBe('teacher-1');

			expect(result.actor).toEqual({
				kind: 'staff',
				subject: expect.objectContaining({ role: 'teacher', status: 'active' })
			});
			expect(result.capabilities).toEqual({
				viewAnyEvaluation: false,
				viewOwnEvaluation: true,
				editOwnEvaluation: true,
				editAnyEvaluation: false
			});
		});

		it('resolves admin profile + staff actor + viewAnyEvaluation capabilities', async () => {
			const t = convexTest(schema, modules);
			await seedUser(t, {
				authId: 'admin-1',
				role: 'admin',
				status: 'active',
				name: 'Admin User'
			});

			mockAuthUser({ authId: 'admin-1' });

			const result = await t.query(api.users.profile, {});

			expect(result.user?.role).toBe('admin');
			expect(result.user?.status).toBe('active');

			expect(result.actor.kind).toBe('staff');
			expect(result.capabilities.viewAnyEvaluation).toBe(true);
			expect(result.capabilities.viewOwnEvaluation).toBe(true);
			expect(result.capabilities.editOwnEvaluation).toBe(true);
			expect(result.capabilities.editAnyEvaluation).toBe(false);
		});

		it('returns no capabilities for a pending teacher', async () => {
			const t = convexTest(schema, modules);
			await seedUser(t, {
				authId: 'pending-teacher-1',
				role: 'teacher',
				status: 'pending',
				name: 'Pending Teacher'
			});

			mockAuthUser({ authId: 'pending-teacher-1' });

			const result = await t.query(api.users.profile, {});

			expect(result.user?.role).toBe('teacher');
			expect(result.user?.status).toBe('pending');

			expect(result.actor.kind).toBe('staff');
			expect(result.capabilities).toEqual(noEvaluationCapabilities);
		});

		it('returns profileExists=false when no DB profile exists', async () => {
			const t = convexTest(schema, modules);
			mockAuthUser({ authId: 'no-profile-user', name: 'Ghost' });

			const result = await t.query(api.users.profile, {});

			expect(result.user?.profileExists).toBe(false);
			expect(result.user?.role).toBeUndefined();
			expect(result.user?.status).toBeUndefined();

			expect(result.actor).toEqual({ kind: 'anonymous' });
			expect(result.capabilities).toEqual(noEvaluationCapabilities);
		});
	});

	describe('super admin', () => {
		it('resolves super admin + staff actor + editAnyEvaluation capabilities', async () => {
			const t = convexTest(schema, modules);
			mockAuthUser({
				authId: 'super@hwis.test',
				email: 'super@hwis.test',
				role: 'super',
				name: 'Super Admin'
			});

			const result = await t.query(api.users.profile, {});

			expect(result.user?.role).toBe('super');
			expect(result.user?.status).toBe('active');
			expect(result.user?.profileExists).toBe(true);

			expect(result.actor.kind).toBe('staff');
			expect(result.capabilities).toEqual({
				viewAnyEvaluation: true,
				viewOwnEvaluation: true,
				editOwnEvaluation: true,
				editAnyEvaluation: true
			});
		});
	});
});
