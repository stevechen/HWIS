import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './auth';

// Data factory helper functions for E2E testing
const TABLES = ['students', 'point_categories', 'evaluations', 'audit_logs'] as const;

function getE2ETag(): string {
	return `e2e-test_${Date.now().toString().slice(-6)}`;
}

function generateUniqueId(prefix: string): string {
	return `${prefix}${Date.now().toString().slice(-6)}`;
}

function generateStudentName(): string {
	const firstNames = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry'];
	const lastNames = ['Smith', 'Jones', 'Brown', 'Wilson', 'Davis', 'Miller', 'Moore'];
	const first = firstNames[Math.floor(Math.random() * firstNames.length)];
	const last = lastNames[Math.floor(Math.random() * lastNames.length)];
	return `${first} ${last}`;
}

function generateChineseName(): string {
	const surnames = [
		'王',
		'李',
		'張',
		'劉',
		'陳',
		'楊',
		'黃',
		'趙',
		'周',
		'吳',
		'徐',
		'孫',
		'馬',
		'朱',
		'胡',
		'郭',
		'林',
		'何',
		'高',
		'羅'
	];
	const givenNames = [
		'偉',
		'芳',
		'娜',
		'敏',
		'靜',
		'麗',
		'強',
		'磊',
		'軍',
		'洋',
		'勇',
		'艷',
		'杰',
		'濤',
		'明',
		'超',
		'秀英',
		'華',
		'平',
		'剛'
	];
	const surname = surnames[Math.floor(Math.random() * surnames.length)];
	const givenName = givenNames[Math.floor(Math.random() * givenNames.length)];
	return surname + givenName;
}

export const cleanupAll = mutation({
	args: {
		tag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Validate test token for cloud Convex compatibility
		await getAuthenticatedUser(ctx, args.testToken);
		const e2eTag = args.tag || getE2ETag();
		let totalDeleted = 0;

		for (const table of TABLES) {
			const items = await ctx.db.query(table).collect();
			for (const item of items) {
				if ('e2eTag' in item && item.e2eTag === e2eTag) {
					await ctx.db.delete(item._id);
					totalDeleted++;
				}
			}
		}

		return { deleted: totalDeleted, tag: args.tag };
	}
});

export const seedBaseline = mutation({
	args: {
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Real user emails to PRESERVE
		const REAL_USERS = [
			'steve.stevechen@gmail.com',
			'steve@hwhs.tc.edu.tw',
			'steve.homecook@gmail.com'
		];

		// Step 1: Clean up known test users via indexed lookups (avoid full scans)
		const testAuthIds = ['test-user-id', 'test_admin', 'e2e_teacher1', 'e2e_teacher2'];
		for (const authId of testAuthIds) {
			if (REAL_USERS.includes(authId)) continue;
			const matches = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', authId))
				.collect();
			for (const user of matches) {
				await ctx.db.delete(user._id);
			}
		}

		// Step 2: Insert fresh test users FIRST (before auth check)
		// Test admin user for test mode (matches authId set in hooks.server.ts)
		await ctx.db.insert('users', {
			authId: 'test-user-id',
			name: 'Test Admin',
			role: 'admin',
			status: 'active'
		});

		// Step 3: Validate test token for cloud Convex compatibility
		// (Must be done after creating test user)
		await getAuthenticatedUser(ctx, args.testToken);

		await ctx.db.insert('users', {
			authId: 'test_admin',
			name: 'Test Admin (Session)',
			role: 'admin',
			status: 'active'
		});

		await ctx.db.insert('users', {
			authId: 'e2e_teacher1',
			name: 'John Smith',
			role: 'teacher',
			status: 'active'
		});

		await ctx.db.insert('users', {
			authId: 'e2e_teacher2',
			name: 'Jane Doe',
			role: 'teacher',
			status: 'active'
		});

		// Step 3: Insert categories only if none exist
		const existingCategories = await ctx.db.query('point_categories').collect();
		if (existingCategories.length === 0) {
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
		}

		// Step 4: Insert baseline students only if missing (avoid full scans)
		const existingStudent = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', 'S1001'))
			.first();
		if (!existingStudent) {
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
					chineseName: '瓊斯·鮑勃',
					studentId: 'S1002',
					grade: 10,
					status: 'Enrolled' as const
				},
				{
					englishName: 'Charlie Brown',
					chineseName: '查理·布朗',
					studentId: 'S1003',
					grade: 11,
					status: 'Not Enrolled' as const
				}
			];

			for (const s of students) {
				await ctx.db.insert('students', {
					...s,
					note: ''
				});
			}
		}

		return { success: true, timestamp: now };
	}
});

export const createEvaluationForStudent = mutation({
	args: {
		studentId: v.string(),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Validate test token for cloud Convex compatibility
		await getAuthenticatedUser(ctx, args.testToken);
		const students = await ctx.db.query('students').collect();
		const student = students.find((s) => s.studentId === args.studentId);
		if (!student) {
			throw new Error(`Student with ID "${args.studentId}" not found`);
		}

		// Find a teacher or admin user
		const users = await ctx.db.query('users').collect();
		let teacher = users.find((u) => u.role === 'teacher' || u.role === 'admin');

		// If no teacher/admin found, create a fallback user
		if (!teacher) {
			const teacherId = await ctx.db.insert('users', {
				authId: 'eval_teacher',
				name: 'Evaluation Teacher',
				role: 'teacher',
				status: 'active'
			});
			teacher = { _id: teacherId, _creationTime: Date.now(), role: 'teacher' as const };
		}

		// Find a category with subCategories, or any category
		const categories = await ctx.db.query('point_categories').collect();
		let category = categories.find((c) => c.subCategories && c.subCategories.length > 0);
		if (!category) {
			category = categories[0];
		}

		// If still no category, create a fallback one
		if (!category) {
			const catId = await ctx.db.insert('point_categories', {
				name: 'General',
				subCategories: ['Homework']
			});
			category = {
				_id: catId,
				_creationTime: Date.now(),
				name: 'General',
				subCategories: ['Homework']
			};
		}

		const now = Date.now();
		console.log('Creating evaluation for student:', {
			studentId: args.studentId,
			studentConvexId: student._id,
			teacherId: teacher._id,
			category: category.name
		});
		return await ctx.db.insert('evaluations', {
			studentId: student._id,
			teacherId: teacher._id,
			value: 1,
			category: category.name,
			subCategory: category.subCategories[0] || '',
			details: '',
			timestamp: now,
			semesterId: '2024-H2',
			e2eTag: args.e2eTag || getE2ETag()
		});
	}
});

export const createStudent = mutation({
	args: {
		englishName: v.optional(v.string()),
		chineseName: v.optional(v.string()),
		studentId: v.optional(v.string()),
		grade: v.optional(v.number()),
		status: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Validate test token for cloud Convex compatibility
		await getAuthenticatedUser(ctx, args.testToken);
		const tag = args.e2eTag || getE2ETag();
		return await ctx.db.insert('students', {
			englishName: args.englishName ?? generateStudentName(),
			chineseName: args.chineseName ?? generateChineseName(),
			studentId: args.studentId ?? generateUniqueId(''),
			grade: args.grade ?? 9,
			status: (args.status as 'Enrolled' | 'Not Enrolled') ?? 'Enrolled',
			e2eTag: tag
		});
	}
});

export const createStudentWithId = mutation({
	args: {
		studentId: v.string(),
		englishName: v.optional(v.string()),
		chineseName: v.optional(v.string()),
		grade: v.optional(v.number()),
		status: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Validate test token for cloud Convex compatibility
		await getAuthenticatedUser(ctx, args.testToken);
		const tag = args.e2eTag || getE2ETag();
		const existing = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				englishName: args.englishName ?? existing.englishName,
				chineseName: args.chineseName ?? existing.chineseName,
				grade: args.grade ?? existing.grade,
				status: (args.status as 'Enrolled' | 'Not Enrolled') ?? existing.status,
				e2eTag: tag
			});
			return existing._id;
		}

		return await ctx.db.insert('students', {
			englishName: args.englishName ?? `Student_${args.studentId}`,
			chineseName: args.chineseName ?? '',
			studentId: args.studentId,
			grade: args.grade ?? 9,
			status: (args.status as 'Enrolled' | 'Not Enrolled') ?? 'Enrolled',
			e2eTag: tag
		});
	}
});

export const createCategory = mutation({
	args: {
		name: v.optional(v.string()),
		subCategories: v.optional(v.array(v.string())),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Validate test token for cloud Convex compatibility
		await getAuthenticatedUser(ctx, args.testToken);
		void (args.e2eTag || getE2ETag());
		return await ctx.db.insert('point_categories', {
			name: args.name ?? `Category_${Date.now().toString().slice(-6)}`,
			subCategories: args.subCategories ?? []
		});
	}
});

export const createCategoryWithSubs = mutation({
	args: {
		name: v.string(),
		subCategories: v.array(v.string()),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Validate test token for cloud Convex compatibility
		await getAuthenticatedUser(ctx, args.testToken);
		void (args.e2eTag || getE2ETag());
		return await ctx.db.insert('point_categories', {
			name: args.name,
			subCategories: args.subCategories
		});
	}
});
