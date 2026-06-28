import { mutation } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { authComponent, getAuthenticatedUser, requireAdminForSensitiveOperation } from './auth';

// Helper to get or create a class for e2e tests
// className: "default", "IB", "1", "2", etc.
async function getOrCreateClass(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: any,
	grade: number,
	className: string
): Promise<Id<'classes'>> {
	const existing = await ctx.db
		.query('classes')
		.withIndex(
			'by_grade_class',
			(q: {
				eq: (field: string, value: unknown) => { eq: (field: string, value: unknown) => unknown };
			}) => q.eq('grade', grade).eq('class', className)
		)
		.first();

	if (existing) {
		return existing._id;
	}

	return await ctx.db.insert('classes', {
		grade,
		class: className
	});
}

// Type for authenticated user objects from auth (has authId or _id)
type AuthUserInfo = { authId?: string; _id?: string };

// Data factory helper functions for E2E testing
const TABLES = [
	'students',
	'point_categories',
	'evaluations',
	'audit_logs',
	'house_events'
] as const;

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
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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
		await requireAdminForSensitiveOperation(ctx, args.testToken);
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
				await ctx.db.insert('point_categories', {
					name
				});
			}
		}

		// Step 4: Insert baseline classes
		const existingClass7 = await ctx.db
			.query('classes')
			.withIndex('by_grade_class', (q) => q.eq('grade', 7).eq('class', '1'))
			.first();
		if (!existingClass7) {
			// Create classes for grades 7-12
			for (const grade of [7, 8, 9, 10, 11, 12]) {
				for (const classNum of ['1', '2', '3']) {
					await ctx.db.insert('classes', {
						grade,
						class: classNum
					});
				}
			}
		}

		// Get class IDs for student creation
		const classes = await ctx.db.query('classes').collect();
		const classByGrade = new Map<number, Id<'classes'>>();
		for (const c of classes) {
			if (!classByGrade.has(c.grade)) {
				classByGrade.set(c.grade, c._id);
			}
		}

		// Step 5: Insert baseline students only if missing (avoid full scans)
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
					classId: classByGrade.get(9)!,
					status: 'Enrolled' as const
				},
				{
					englishName: 'Bob Jones',
					chineseName: '瓊斯·鮑勃',
					studentId: 'S1002',
					classId: classByGrade.get(10)!,
					status: 'Enrolled' as const
				},
				{
					englishName: 'Charlie Brown',
					chineseName: '查理·布朗',
					studentId: 'S1003',
					classId: classByGrade.get(11)!,
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
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		let teacherId: Id<'users'> | null = null;
		let resolvedFromJwt = false;

		// Prefer the real authenticated JWT user when present so seeded data
		// reflects the current role (teacher/admin) in UI permission tests.
		try {
			const jwtUser = (await authComponent.getAuthUser(ctx)) as AuthUserInfo | null;
			if (jwtUser) {
				const authId = jwtUser.authId || (jwtUser as { id?: string }).id || jwtUser._id;
				if (authId) {
					const userFromDb = await ctx.db
						.query('users')
						.withIndex('by_authId', (q) => q.eq('authId', authId))
						.first();
					if (userFromDb) {
						teacherId = userFromDb._id;
						resolvedFromJwt = true;
					}
				}
			}
		} catch {
			// No JWT session available; fallback to token-based behavior below.
		}

		// If no JWT user is available, keep token-based fallback for headless setup helpers.
		if (!resolvedFromJwt && args.testToken === 'unit-test-token') {
			// Look for existing test teacher or create one
			const existingUser = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', 'e2e_test_teacher'))
				.first();

			if (existingUser) {
				teacherId = existingUser._id;
			} else {
				teacherId = await ctx.db.insert('users', {
					authId: 'e2e_test_teacher',
					name: 'E2E Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			}
		} else if (!resolvedFromJwt) {
			// Get authenticated user info - use JWT auth or testToken bypass
			const authUser = await getAuthenticatedUser(ctx, args.testToken);

			// Normal lookup using authenticated user's authId
			if (!authUser) {
				throw new Error('User not authenticated. Provide testToken or use JWT auth.');
			}
			const authId = (authUser as AuthUserInfo).authId || (authUser as AuthUserInfo)._id;
			const userFromDb = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', authId))
				.first();

			if (!userFromDb) {
				throw new Error(`User not found for authId: ${authId}`);
			}

			teacherId = userFromDb._id;
		}

		if (!teacherId) {
			throw new Error('Failed to resolve teacher user for seeded evaluation');
		}

		// Find the student
		const students = await ctx.db.query('students').collect();
		const student = students.find((s) => s.studentId === args.studentId);
		if (!student) {
			throw new Error(`Student with ID "${args.studentId}" not found`);
		}

		// Find a category with matching e2eTag, or create one with the tag for proper cleanup
		const categories = await ctx.db.query('point_categories').collect();
		let category = categories.find((c) => c.e2eTag === args.e2eTag);

		// If no category with matching e2eTag, create a new one for this test
		if (!category) {
			const catId = await ctx.db.insert('point_categories', {
				name: `TestCategory_${args.e2eTag || getE2ETag()}`,
				e2eTag: args.e2eTag || getE2ETag()
			});
			category = {
				_id: catId,
				_creationTime: Date.now(),
				name: `TestCategory_${args.e2eTag || getE2ETag()}`,
				e2eTag: args.e2eTag || getE2ETag()
			};
		}

		const now = Date.now();
		const evaluationId = await ctx.db.insert('evaluations', {
			studentId: student._id,
			teacherId,
			value: 1,
			categoryId: category._id,
			details: '',
			timestamp: now,
			semesterId: '2024-H2',
			e2eTag: args.e2eTag || getE2ETag()
		});

		// Also create an audit log for the evaluation creation
		await ctx.db.insert('audit_logs', {
			action: 'create_evaluation',
			performerId: teacherId,
			targetTable: 'evaluations',
			targetId: evaluationId.toString(),
			oldValue: null,
			newValue: {
				studentId: student._id,
				value: 1,
				categoryId: category._id,
				categoryName: category.name
			},
			timestamp: now,
			e2eTag: args.e2eTag || getE2ETag()
		});

		return evaluationId;
	}
});

export const createStudent = mutation({
	args: {
		englishName: v.optional(v.string()),
		chineseName: v.optional(v.string()),
		studentId: v.optional(v.string()),
		grade: v.optional(v.number()),
		class: v.optional(v.string()),
		classId: v.optional(v.id('classes')),
		status: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const tag = args.e2eTag || getE2ETag();
		return await ctx.db.insert('students', {
			englishName: args.englishName ?? generateStudentName(),
			chineseName: args.chineseName ?? generateChineseName(),
			studentId: args.studentId ?? generateUniqueId(''),
			classId: args.classId!,
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
		grade: v.number(),
		class: v.optional(v.string()),
		status: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const tag = args.e2eTag || getE2ETag();

		// Get or create class
		// "default", "IB", "1", "2", etc. - defaults to "default" class
		const className = args.class || 'default';
		const classId = await getOrCreateClass(ctx, args.grade, className);

		const existing = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				englishName: args.englishName ?? existing.englishName,
				chineseName: args.chineseName ?? existing.chineseName,
				classId,
				status: (args.status as 'Enrolled' | 'Not Enrolled') ?? existing.status,
				e2eTag: tag
			});
			return existing._id;
		}

		return await ctx.db.insert('students', {
			englishName: args.englishName ?? `Student_${args.studentId}`,
			chineseName: args.chineseName ?? '',
			studentId: args.studentId,
			classId,
			status: (args.status as 'Enrolled' | 'Not Enrolled') ?? 'Enrolled',
			e2eTag: tag
		});
	}
});

export const createCategory = mutation({
	args: {
		name: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string()),
		casAlignment: v.optional(
			v.array(v.union(v.literal('Creativity'), v.literal('Activity'), v.literal('Service')))
		),
		meritCriteria: v.optional(v.array(v.string())),
		demeritCriteria: v.optional(v.array(v.string()))
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const tag = args.e2eTag || getE2ETag();
		return await ctx.db.insert('point_categories', {
			name: args.name ?? `Category_${Date.now().toString().slice(-6)}`,
			e2eTag: tag,
			casAlignment: args.casAlignment || [],
			meritCriteria: args.meritCriteria || [],
			demeritCriteria: args.demeritCriteria || []
		});
	}
});

export const setStudentE2eTag = mutation({
	args: {
		studentId: v.string(),
		e2eTag: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		if (!student) {
			throw new Error(`Student with ID "${args.studentId}" not found`);
		}

		await ctx.db.patch(student._id, { e2eTag: args.e2eTag });
		return { success: true, studentId: args.studentId };
	}
});

export const setE2eTag = mutation({
	args: {
		dataType: v.union(v.literal('students'), v.literal('categories'), v.literal('evaluations')),
		dataId: v.string(),
		e2eTag: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		if (args.dataType === 'students') {
			const student = await ctx.db
				.query('students')
				.withIndex('by_studentId', (q) => q.eq('studentId', args.dataId))
				.first();

			if (!student) {
				throw new Error(`Student with ID "${args.dataId}" not found`);
			}

			await ctx.db.patch(student._id, { e2eTag: args.e2eTag });
			return { success: true, dataType: args.dataType, dataId: args.dataId };
		}

		if (args.dataType === 'categories') {
			const categories = await ctx.db.query('point_categories').collect();
			const category = categories.find((c) => c.name === args.dataId);

			if (!category) {
				throw new Error(`Category "${args.dataId}" not found`);
			}

			await ctx.db.patch(category._id, { e2eTag: args.e2eTag });
			return { success: true, dataType: args.dataType, dataId: args.dataId };
		}

		if (args.dataType === 'evaluations') {
			const evaluations = await ctx.db.query('evaluations').collect();
			const evalItem = evaluations.find((e) => e._id.toString() === args.dataId);

			if (!evalItem) {
				throw new Error(`Evaluation with ID "${args.dataId}" not found`);
			}

			await ctx.db.patch(evalItem._id, { e2eTag: args.e2eTag });
			return { success: true, dataType: args.dataType, dataId: args.dataId };
		}

		throw new Error(`Unknown data type: ${args.dataType}`);
	}
});

export const cleanupHouseEventsByTag = mutation({
	args: {
		tag: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		let totalDeleted = 0;
		const events = await ctx.db.query('house_events').collect();
		for (const event of events) {
			if (event.e2eTag === args.tag) {
				await ctx.db.delete(event._id);
				totalDeleted++;
			}
		}
		return { deleted: totalDeleted };
	}
});

export const cleanupAllHouseEvents = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const events = await ctx.db.query('house_events').collect();
		for (const event of events) {
			await ctx.db.delete(event._id);
		}
		return { deleted: events.length };
	}
});
