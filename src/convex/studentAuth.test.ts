import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

describe('Student Authentication Helpers', () => {
	describe('extractStudentIdFromEmail', () => {
		it('should extract studentId from valid student email', async () => {
			const { extractStudentIdFromEmail } = await import('./auth');

			expect(extractStudentIdFromEmail('s123@std.hwhs.tc.edu.tw')).toBe('123');
			expect(extractStudentIdFromEmail('s1@std.hwhs.tc.edu.tw')).toBe('1');
			expect(extractStudentIdFromEmail('s999999@std.hwhs.tc.edu.tw')).toBe('999999');
		});

		it('should return null for invalid email formats', async () => {
			const { extractStudentIdFromEmail } = await import('./auth');

			expect(extractStudentIdFromEmail('student@std.hwhs.tc.edu.tw')).toBeNull();
			expect(extractStudentIdFromEmail('s@std.hwhs.tc.edu.tw')).toBeNull();
			expect(extractStudentIdFromEmail('abc@std.hwhs.tc.edu.tw')).toBeNull();
			expect(extractStudentIdFromEmail('s123@hwhs.tc.edu.tw')).toBeNull();
			expect(extractStudentIdFromEmail('teacher@hwhs.tc.edu.tw')).toBeNull();
		});
	});

	describe('isStudentEmail', () => {
		it('should identify student domain emails', async () => {
			const { isStudentEmail } = await import('./auth');

			expect(isStudentEmail('s123@std.hwhs.tc.edu.tw')).toBe(true);
			expect(isStudentEmail('s1@std.hwhs.tc.edu.tw')).toBe(true);
		});

		it('should reject non-student domains', async () => {
			const { isStudentEmail } = await import('./auth');

			expect(isStudentEmail('teacher@hwhs.tc.edu.tw')).toBe(false);
			expect(isStudentEmail('student@gmail.com')).toBe(false);
		});
	});
});

describe('Student User Setup', () => {
	it('should create student user when student record exists', async () => {
		const t = convexTest(schema, modules);

		// Create a student record first
		await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: '1234567',
			grade: 10,
			status: 'Enrolled'
		});

		// Setup student user
		const result = await t.mutation(api.users.setupStudentUser, {
			authId: 'test-student-auth-id',
			email: 's1234567@std.hwhs.tc.edu.tw',
			name: 'Test Student'
		});

		expect(result.success).toBe(true);
		expect(result.enrollmentStatus).toBe('Enrolled');
		expect(result.studentRecordId).toBeDefined();
	});

	it('should reject setup when student record does not exist', async () => {
		const t = convexTest(schema, modules);

		const result = await t.mutation(api.users.setupStudentUser, {
			authId: 'test-student-auth-id',
			email: 's9999999@std.hwhs.tc.edu.tw',
			name: 'Non Existent Student'
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('STUDENT_NOT_FOUND');
	});

	it('should reject non-student emails', async () => {
		const t = convexTest(schema, modules);

		const result = await t.mutation(api.users.setupStudentUser, {
			authId: 'test-teacher-auth-id',
			email: 'teacher@hwhs.tc.edu.tw',
			name: 'Teacher'
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('Not a student email');
	});
});

describe('User List - Student Filtering', () => {
	it('should not include students in user list', async () => {
		const t = convexTest(schema, modules);

		// Create users directly in database
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'admin-auth',
				role: 'admin',
				status: 'active',
				name: 'Admin'
			});
			await ctx.db.insert('users', {
				authId: 'teacher-auth',
				role: 'teacher',
				status: 'active',
				name: 'Teacher'
			});
			await ctx.db.insert('users', {
				authId: 'student-auth',
				role: 'student',
				status: 'active',
				name: 'Student'
			});
		});

		// Use super token to get all users
		const users = await t.query(api.users.list, {
			testToken: 'super-unit-test-token'
		});

		const roles = users.map((u: { role?: string }) => u.role);
		expect(roles).toContain('admin');
		expect(roles).toContain('teacher');
		expect(roles).not.toContain('student');
	});
});

describe('Student Record Lookup', () => {
	it('should find student by studentId', async () => {
		const t = convexTest(schema, modules);

		// Create a student
		await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: '7654321',
			grade: 10,
			status: 'Enrolled'
		});

		// Lookup student by studentId
		const student = await t.query(api.students.getByStudentId, {
			studentId: '7654321'
		});

		expect(student).toBeDefined();
		expect(student?.studentId).toBe('7654321');
		expect(student?.englishName).toBe('Test Student');
	});

	it('should return null for non-existent studentId', async () => {
		const t = convexTest(schema, modules);

		const student = await t.query(api.students.getByStudentId, {
			studentId: '9999999'
		});

		expect(student).toBeNull();
	});
});
