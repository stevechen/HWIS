import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { requireAdminForSensitiveOperation } from './auth';

export const e2eResetAll = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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

export const e2eResetCategoriesAndEvals = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const allCategories = await ctx.db.query('point_categories').collect();
		for (const c of allCategories) {
			await ctx.db.delete(c._id);
		}

		const allEvaluations = await ctx.db.query('evaluations').collect();
		for (const e of allEvaluations) {
			await ctx.db.delete(e._id);
		}

		return { message: 'Categories and evaluations cleaned' };
	}
});

export const e2eSeedAll = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const now = Date.now();

		// Create test admin user for Convex auth
		await ctx.db.insert('users', {
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
		const categoryIds: Record<string, Id<'point_categories'>> = {};
		const categoryNames = [
			'Responsibility',
			'Excellence',
			'Service',
			'Persistence',
			'Enthusiasm',
			'Collaboration',
			'Timeliness'
		];

		for (const name of categoryNames) {
			const id = await ctx.db.insert('point_categories', {
				name
			});
			categoryIds[name] = id;
		}

		// Create classes for test students
		const classIds: Record<number, Id<'classes'>> = {};
		for (const grade of [9, 10, 11, 12, 18, 22]) {
			const classId = await ctx.db.insert('classes', {
				grade,
				class: '1'
			});
			classIds[grade] = classId;
		}

		// Students
		const students = [
			{
				englishName: 'Alice Smith',
				chineseName: '史艾莉',
				studentId: 'S1001',
				classId: classIds[9],
				status: 'Enrolled' as const
			},
			{
				englishName: 'Bob Jones',
				chineseName: '張博博',
				studentId: 'S1002',
				classId: classIds[10],
				status: 'Enrolled' as const
			},
			{
				englishName: 'Charlie Brown',
				chineseName: '布查理',
				studentId: 'S1003',
				classId: classIds[11],
				status: 'Enrolled' as const
			},
			{
				englishName: 'David Wilson',
				chineseName: '魏大維',
				studentId: 'S1004',
				classId: classIds[12],
				status: 'Not Enrolled' as const
			},
			{
				englishName: 'Eve Davis',
				chineseName: '戴伊芙',
				studentId: 'S1005',
				classId: classIds[9],
				status: 'Not Enrolled' as const
			},
			{
				englishName: 'Test Delete No Evals',
				chineseName: '',
				studentId: 'S9998',
				classId: classIds[22],
				status: 'Enrolled' as const
			},
			{
				englishName: 'Test No Evals',
				chineseName: '',
				studentId: 'S9997',
				classId: classIds[22],
				status: 'Enrolled' as const
			},
			{
				englishName: 'Test Student',
				chineseName: '測試學生',
				studentId: 'S9999',
				classId: classIds[18],
				status: 'Enrolled' as const
			},
			{
				englishName: 'Audit Student',
				chineseName: '',
				studentId: 'S2001',
				classId: classIds[10],
				status: 'Enrolled' as const
			},
			{
				englishName: 'Audit Student 2',
				chineseName: '',
				studentId: 'S2002',
				classId: classIds[11],
				status: 'Enrolled' as const
			},
			{
				englishName: 'Audit Student 3',
				chineseName: '',
				studentId: 'S2003',
				classId: classIds[12],
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
			categoryId: categoryIds['Excellence'],
			details: 'Great test score',
			semesterId: 'current'
		});

		await ctx.db.insert('evaluations', {
			value: 5,
			studentId: studentIds['S1002'],
			timestamp: now,
			teacherId: teacher2Id,
			categoryId: categoryIds['Collaboration'],
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
			newValue: { studentId: 'S2002', category: 'Excellence', points: 15 },
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
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const allAuditLogs = await ctx.db.query('audit_logs').collect();
		for (const a of allAuditLogs) {
			await ctx.db.delete(a._id);
		}
		return { message: 'Audit logs cleared' };
	}
});

export const e2eSeedCategoriesForDelete = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		await ctx.db.insert('point_categories', {
			name: 'Category Without Evals'
		});

		await ctx.db.insert('point_categories', {
			name: 'Category With Evals'
		});

		return { message: 'Categories seeded for delete tests' };
	}
});

export const e2eCreateEvaluationForCategory = mutation({
	args: { categoryName: v.string(), testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		console.log('[e2e] Starting e2eCreateEvaluationForCategory for:', args.categoryName);

		// Get the category
		const categories = await ctx.db.query('point_categories').collect();
		const category = categories.find((c) => c.name === args.categoryName);
		console.log('[e2e] Found category:', category ? category.name : 'NOT FOUND');

		if (!category) {
			return { success: false, error: 'Category not found' };
		}

		// Get an enrolled student
		const students = await ctx.db.query('students').collect();
		console.log('[e2e] Total students:', students.length);
		const enrolledStudents = students.filter((s) => s.status === 'Enrolled');
		console.log('[e2e] Enrolled students:', enrolledStudents.length);
		const student = enrolledStudents[0];

		if (!student) {
			return { success: false, error: 'No enrolled student found' };
		}

		// Get a teacher
		const users = await ctx.db.query('users').collect();
		const teacher = users.find((u) => u.role === 'teacher' || u.role === 'admin');
		console.log('[e2e] Found teacher:', teacher ? teacher.name : 'NOT FOUND');

		const teacherId = teacher?._id || 'test-teacher-id';

		// Create evaluation
		console.log('[e2e] Creating evaluation with categoryId:', category._id);

		await ctx.db.insert('evaluations', {
			studentId: student._id,
			teacherId: teacherId as Id<'users'>,
			value: 1,
			categoryId: category._id,
			details: 'Test evaluation for e2e test',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});

		console.log('[e2e] Evaluation created successfully');
		return { success: true, category: category.name, student: student.englishName };
	}
});

export const e2eCheckEvaluationExists = query({
	args: { categoryId: v.id('point_categories'), testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_categoryId', (q) => q.eq('categoryId', args.categoryId))
			.collect();
		return { count: evaluations.length, categoryId: args.categoryId };
	}
});

export const e2eSeedStudentsForDisable = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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

		// Create classes for test students
		const classIds: Record<number, Id<'classes'>> = {};
		for (const grade of [10, 11, 12]) {
			const classId = await ctx.db.insert('classes', {
				grade,
				class: '1'
			});
			classIds[grade] = classId;
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
			classId: classIds[10],
			status: 'Enrolled',
			note: ''
		});

		await ctx.db.insert('students', {
			englishName: 'Enrolled Student 2',
			chineseName: '',
			studentId: 'S9002',
			classId: classIds[11],
			status: 'Enrolled',
			note: ''
		});

		await ctx.db.insert('students', {
			englishName: 'Not Enrolled Student',
			chineseName: '',
			studentId: 'S9003',
			classId: classIds[12],
			status: 'Not Enrolled',
			note: ''
		});

		const studentWithEvalsId = await ctx.db.insert('students', {
			englishName: 'Student With Evals',
			chineseName: '',
			studentId: 'S9010',
			classId: classIds[10],
			status: 'Enrolled',
			note: ''
		});

		// Get or create category
		const categories = await ctx.db.query('point_categories').collect();
		let academicCategory = categories.find((c) => c.name === 'Excellence');
		if (!academicCategory) {
			const catId = await ctx.db.insert('point_categories', {
				name: 'Excellence'
			});
			academicCategory = {
				_id: catId,
				_creationTime: Date.now(),
				name: 'Excellence'
			};
		}

		await ctx.db.insert('evaluations', {
			value: 10,
			studentId: studentWithEvalsId,
			timestamp: Date.now(),
			teacherId: teacherUserId,
			categoryId: academicCategory._id,
			details: 'Test evaluation for disable test',
			semesterId: 'current'
		});

		await ctx.db.insert('students', {
			englishName: 'Student No Evals',
			chineseName: '',
			studentId: 'S9011',
			classId: classIds[11],
			status: 'Enrolled',
			note: ''
		});

		return { message: 'Students seeded for disable tests' };
	}
});

export const e2eSeedAuditLogs = mutation({
	args: { authId: v.optional(v.string()), testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const authId = args.authId || 'default_user';

		// Check if user already exists, if so reuse it
		let performerId;
		const existingUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (existingUser) {
			performerId = existingUser._id;
		} else {
			performerId = await ctx.db.insert('users', {
				authId: authId,
				name: `Test Performer ${authId}`,
				role: 'teacher',
				status: 'active'
			});
		}

		await ctx.db.insert('audit_logs', {
			action: 'student_created',
			performerId: performerId,
			targetTable: 'students',
			targetId: 'student1',
			oldValue: null,
			newValue: { englishName: 'Audit Student', studentId: 'S2001', grade: 10 },
			timestamp: Date.now() - 100000,
			e2eTag: authId
		});

		await ctx.db.insert('audit_logs', {
			action: 'evaluation_created',
			performerId: performerId,
			targetTable: 'evaluations',
			targetId: 'eval1',
			oldValue: null,
			newValue: { studentId: 'S2002', category: 'Homework', points: 5 },
			timestamp: Date.now() - 50000,
			e2eTag: authId
		});

		await ctx.db.insert('audit_logs', {
			action: 'status_changed',
			performerId: performerId,
			targetTable: 'students',
			targetId: 'student3',
			oldValue: { status: 'Enrolled' },
			newValue: { status: 'Not Enrolled' },
			timestamp: Date.now(),
			e2eTag: authId
		});

		return { message: 'Audit logs seeded', performerAuthId: authId };
	}
});

export const e2eCreateEvaluationInternal = mutation({
	args: {
		studentId: v.id('students'),
		value: v.number(),
		categoryName: v.string(),
		details: v.string(),
		semesterId: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const users = await ctx.db.query('users').collect();
		const teacher = users.find((u) => u.role === 'teacher' || u.role === 'admin');

		// Get or create category by name
		const categories = await ctx.db.query('point_categories').collect();
		let category = categories.find((c) => c.name === args.categoryName);
		if (!category) {
			const catId = await ctx.db.insert('point_categories', {
				name: args.categoryName
			});
			category = {
				_id: catId,
				_creationTime: Date.now(),
				name: args.categoryName
			};
		}

		await ctx.db.insert('evaluations', {
			studentId: args.studentId,
			teacherId: teacher?._id as Id<'users'>,
			value: args.value,
			categoryId: category._id,
			details: args.details,
			timestamp: Date.now(),
			semesterId: args.semesterId
		});

		return { success: true };
	}
});
