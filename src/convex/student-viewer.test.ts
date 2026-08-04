import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, createStudentWithClass, seedUser } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

describe('users.viewer (email-derived student)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('synthesizes a student viewer for an Enrolled record matched by email', async () => {
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

		const viewer = await t.query(api.users.viewer, {});

		expect(viewer?.role).toBe('student');
		expect(viewer?.status).toBe('active');
		expect(viewer?.profileExists).toBe(true);
		expect(viewer?.studentId).toBe('888001');
		expect(viewer?.enrollmentStatus).toBe('Enrolled');
		expect(viewer?.studentRecordId).toBe(studentId);
		expect(viewer?.englishName).toBe('Test Student');
	});

	it('synthesizes a student viewer with Not Enrolled enrollment status', async () => {
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

		const viewer = await t.query(api.users.viewer, {});

		expect(viewer?.role).toBe('student');
		expect(viewer?.status).toBe('active');
		expect(viewer?.enrollmentStatus).toBe('Not Enrolled');
	});

	it('synthesizes a student viewer with no record info when the email matches nothing', async () => {
		const t = convexTest(schema, modules);

		mockAuthUser({ authId: 'student-3', email: 's999999@std.hwhs.tc.edu.tw' });

		const viewer = await t.query(api.users.viewer, {});

		expect(viewer?.role).toBe('student');
		expect(viewer?.status).toBe('active');
		expect(viewer?.studentId).toBeUndefined();
		expect(viewer?.enrollmentStatus).toBeUndefined();
		expect(viewer?.studentRecordId).toBeUndefined();
	});

	it('returns null when unauthenticated', async () => {
		const t = convexTest(schema, modules);

		mockAuthUser(null);

		const viewer = await t.query(api.users.viewer, {});

		expect(viewer).toBeNull();
	});

	it('leaves staff profile viewers unchanged', async () => {
		const t = convexTest(schema, modules);
		await seedUser(t, {
			authId: 'teacher-1',
			role: 'teacher',
			status: 'active',
			name: 'Sam Teacher'
		});

		mockAuthUser({ authId: 'teacher-1' });

		const viewer = await t.query(api.users.viewer, {});

		expect(viewer?.role).toBe('teacher');
		expect(viewer?.status).toBe('active');
		expect(viewer?.profileExists).toBe(true);
		expect(viewer?.studentId).toBeUndefined();
	});
});
