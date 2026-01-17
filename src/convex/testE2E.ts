import { mutation } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

export const e2eResetAll = mutation({
	args: {},
	handler: async (ctx) => {
		const allStudents = await ctx.db.query('students').collect();
		for (const s of allStudents) {
			await ctx.db.delete(s._id);
		}

		const allCategories = await ctx.db.query('point_categories').collect();
		for (const c of allCategories) {
			await ctx.db.delete(c._id);
		}

		const allEvaluations = await ctx.db.query('evaluations').collect();
		for (const e of allEvaluations) {
			await ctx.db.delete(e._id);
		}

		const allAuditLogs = await ctx.db.query('audit_logs').collect();
		for (const a of allAuditLogs) {
			await ctx.db.delete(a._id);
		}

		return { message: 'All test data cleaned' };
	}
});

export const e2eSeedAll = mutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		// Create test admin user for Convex auth
		const adminUserId = await ctx.db.insert('users', {
			authId: 'test_admin',
			name: 'Test Admin',
			role: 'admin',
			status: 'active'
		});

		// Create test users
		const teacher1Id = await ctx.db.insert('users', {
			authId: 'e2e_teacher1',
			name: 'John Smith',
			role: 'teacher',
			status: 'active'
		});

		const teacher2Id = await ctx.db.insert('users', {
			authId: 'e2e_teacher2',
			name: 'Jane Doe',
			role: 'teacher',
			status: 'active'
		});

		// Categories
		const categories = [
			{ name: 'Academic Excellence', subCategories: ['Homework', 'Test', 'Quiz'] },
			{ name: 'Participation', subCategories: ['Class Discussion', 'Group Work'] },
			{ name: 'Behavior', subCategories: [] },
			{ name: 'Creativity', subCategories: ['Art', 'Music'] }
		];

		for (const cat of categories) {
			await ctx.db.insert('point_categories', {
				name: cat.name,
				subCategories: cat.subCategories
			});
		}

		// Students
		const students = [
			{
				englishName: 'Alice Smith',
				chineseName: '史艾莉',
				studentId: 'S1001',
				grade: 9,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Bob Jones',
				chineseName: '張博博',
				studentId: 'S1002',
				grade: 10,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Charlie Brown',
				chineseName: '布查理',
				studentId: 'S1003',
				grade: 11,
				status: 'Enrolled' as const
			},
			{
				englishName: 'David Wilson',
				chineseName: '魏大維',
				studentId: 'S1004',
				grade: 12,
				status: 'Not Enrolled' as const
			},
			{
				englishName: 'Eve Davis',
				chineseName: '戴伊芙',
				studentId: 'S1005',
				grade: 9,
				status: 'Not Enrolled' as const
			},
			{
				englishName: 'Test Delete No Evals',
				chineseName: '',
				studentId: 'S9998',
				grade: 22,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Test No Evals',
				chineseName: '',
				studentId: 'S9997',
				grade: 22,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Test Student',
				chineseName: '測試學生',
				studentId: 'S9999',
				grade: 18,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Audit Student',
				chineseName: '',
				studentId: 'S2001',
				grade: 10,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Audit Student 2',
				chineseName: '',
				studentId: 'S2002',
				grade: 11,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Audit Student 3',
				chineseName: '',
				studentId: 'S2003',
				grade: 12,
				status: 'Not Enrolled' as const
			}
		];

		const studentIds: Record<string, Id<'students'>> = {};
		for (const student of students) {
			const id = await ctx.db.insert('students', student);
			studentIds[student.studentId] = id;
		}

		// Evaluations
		await ctx.db.insert('evaluations', {
			value: 10,
			studentId: studentIds['S1001'],
			timestamp: now,
			teacherId: teacher1Id,
			category: 'Academic Excellence',
			subCategory: 'Test',
			details: 'Great test score',
			semesterId: 'current'
		});

		await ctx.db.insert('evaluations', {
			value: 5,
			studentId: studentIds['S1002'],
			timestamp: now,
			teacherId: teacher2Id,
			category: 'Participation',
			subCategory: 'Class Discussion',
			details: 'Active participation',
			semesterId: 'current'
		});

		// Audit logs
		await ctx.db.insert('audit_logs', {
			action: 'student_created',
			performerId: teacher1Id,
			targetTable: 'students',
			targetId: studentIds['S2001'],
			oldValue: null,
			newValue: { englishName: 'Audit Student', studentId: 'S2001', grade: 10 },
			timestamp: now - 100000
		});

		await ctx.db.insert('audit_logs', {
			action: 'evaluation_created',
			performerId: teacher2Id,
			targetTable: 'evaluations',
			targetId: 'eval1',
			oldValue: null,
			newValue: { studentId: 'S2002', category: 'Academic Excellence', points: 15 },
			timestamp: now - 50000
		});

		await ctx.db.insert('audit_logs', {
			action: 'status_changed',
			performerId: teacher1Id,
			targetTable: 'students',
			targetId: studentIds['S2003'],
			oldValue: { status: 'Enrolled' },
			newValue: { status: 'Not Enrolled' },
			timestamp: now
		});

		return {
			message: 'Full seed complete',
			categories: 4,
			students: 11,
			evaluations: 2,
			auditLogs: 3
		};
	}
});

export const e2eClearAuditOnly = mutation({
	args: {},
	handler: async (ctx) => {
		const allAuditLogs = await ctx.db.query('audit_logs').collect();
		for (const a of allAuditLogs) {
			await ctx.db.delete(a._id);
		}
		return { message: 'Audit logs cleared' };
	}
});

export const e2eSeedCategoriesForDelete = mutation({
	args: {},
	handler: async (ctx) => {
		await ctx.db.insert('point_categories', {
			name: 'Category Without Evals',
			subCategories: []
		});

		await ctx.db.insert('point_categories', {
			name: 'Category With Evals',
			subCategories: ['Sub1', 'Sub2']
		});

		return { message: 'Categories seeded for delete tests' };
	}
});

export const e2eSeedStudentsForDisable = mutation({
	args: {},
	handler: async (ctx) => {
		const existingStudents = await ctx.db.query('students').collect();
		for (const s of existingStudents) {
			if (s.studentId.startsWith('S9') || s.studentId.startsWith('S8')) {
				await ctx.db.delete(s._id);
			}
		}

		const existingUsers = await ctx.db.query('users').collect();
		for (const u of existingUsers) {
			if (u.authId && u.authId.startsWith('e2e_disable_')) {
				await ctx.db.delete(u._id);
			}
		}

		const existingEvals = await ctx.db.query('evaluations').collect();
		for (const e of existingEvals) {
			await ctx.db.delete(e._id);
		}

		const teacherUserId = await ctx.db.insert('users', {
			authId: 'e2e_disable_teacher',
			name: 'Disable Test Teacher',
			role: 'teacher',
			status: 'active'
		});

		await ctx.db.insert('students', {
			englishName: 'Enrolled Student 1',
			chineseName: '',
			studentId: 'S9001',
			grade: 10,
			status: 'Enrolled',
			note: ''
		});

		await ctx.db.insert('students', {
			englishName: 'Enrolled Student 2',
			chineseName: '',
			studentId: 'S9002',
			grade: 11,
			status: 'Enrolled',
			note: ''
		});

		await ctx.db.insert('students', {
			englishName: 'Not Enrolled Student',
			chineseName: '',
			studentId: 'S9003',
			grade: 12,
			status: 'Not Enrolled',
			note: ''
		});

		const studentWithEvalsId = await ctx.db.insert('students', {
			englishName: 'Student With Evals',
			chineseName: '',
			studentId: 'S9010',
			grade: 10,
			status: 'Enrolled',
			note: ''
		});

		await ctx.db.insert('evaluations', {
			value: 10,
			studentId: studentWithEvalsId,
			timestamp: Date.now(),
			teacherId: teacherUserId,
			category: 'Academic Excellence',
			subCategory: 'Test',
			details: 'Test evaluation for disable test',
			semesterId: 'current'
		});

		await ctx.db.insert('students', {
			englishName: 'Student No Evals',
			chineseName: '',
			studentId: 'S9011',
			grade: 11,
			status: 'Enrolled',
			note: ''
		});

		return { message: 'Students seeded for disable tests' };
	}
});

export const e2eSeedAuditLogs = mutation({
	args: { authId: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const authId = args.authId || 'default_user';

		const performerId = await ctx.db.insert('users', {
			authId: authId,
			name: 'Test Performer',
			role: 'teacher',
			status: 'active'
		});

		await ctx.db.insert('audit_logs', {
			action: 'student_created',
			performerId: performerId,
			targetTable: 'students',
			targetId: 'student1',
			oldValue: null,
			newValue: { englishName: 'Audit Student', studentId: 'S2001', grade: 10 },
			timestamp: Date.now() - 100000
		});

		await ctx.db.insert('audit_logs', {
			action: 'evaluation_created',
			performerId: performerId,
			targetTable: 'evaluations',
			targetId: 'eval1',
			oldValue: null,
			newValue: { studentId: 'S2002', category: 'Homework', points: 5 },
			timestamp: Date.now() - 50000
		});

		await ctx.db.insert('audit_logs', {
			action: 'status_changed',
			performerId: performerId,
			targetTable: 'students',
			targetId: 'student3',
			oldValue: { status: 'Enrolled' },
			newValue: { status: 'Not Enrolled' },
			timestamp: Date.now()
		});

		return { message: 'Audit logs seeded', performerAuthId: authId };
	}
});
