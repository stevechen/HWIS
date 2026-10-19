import { mutation } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { authComponent, getAuthenticatedUser, requireAdminForSensitiveOperation } from './auth';
import { GRADES } from './shared/class_roster';

// Helper to get or create a class for e2e tests
// className: "default", "IB", "1", "2", etc.
async function getOrCreateClass(
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: any,
	grade: number,
	className: string,
	e2eTag?: string
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
		class: className,
		e2eTag
	});
}

// Type for authenticated user objects from auth (has authId or _id)
type AuthUserInfo = { authId?: string; _id?: string };

// Data factory helper functions for E2E testing
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

export const seedBaseline = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
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
		await getAuthenticatedUser(ctx);

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
			for (const grade of GRADES) {
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
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

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

		if (!resolvedFromJwt) {
			const authUser = await getAuthenticatedUser(ctx);

			if (!authUser) {
				throw new Error('User not authenticated.');
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

		// Find the student via the by_studentId index (avoids a full table scan)
		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();
		if (!student) {
			throw new Error(`Student with ID "${args.studentId}" not found`);
		}

		// Find a category with matching e2eTag using the index, or create one
		const tag = args.e2eTag || getE2ETag();
		let category = await ctx.db
			.query('point_categories')
			.withIndex('by_e2eTag', (q) => q.eq('e2eTag', tag))
			.first();

		if (!category) {
			const catId = await ctx.db.insert('point_categories', {
				name: `TestCategory_${tag}`,
				e2eTag: tag
			});
			category = {
				_id: catId,
				_creationTime: Date.now(),
				name: `TestCategory_${tag}`,
				e2eTag: tag
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
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
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
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const tag = args.e2eTag || getE2ETag();

		// Get or create class
		// "default", "IB", "1", "2", etc. - defaults to "default" class
		const className = args.class || 'default';
		const classId = await getOrCreateClass(ctx, args.grade, className, tag);

		const existing = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		if (existing) {
			if (existing.e2eTag && existing.e2eTag !== tag) {
				throw new Error(`Student ID "${args.studentId}" is already owned by another test`);
			}
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

export const seedManyStudents = mutation({
	args: {
		count: v.number(),
		grade: v.number(),
		class: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const tag = args.e2eTag || getE2ETag();
		const className = args.class || 'default';
		const classId = await getOrCreateClass(ctx, args.grade, className, tag);

		const count = Math.max(0, Math.min(args.count, 5000));
		const ids: Id<'students'>[] = [];
		for (let i = 0; i < count; i++) {
			ids.push(
				await ctx.db.insert('students', {
					englishName: `${generateStudentName()} ${i}`,
					chineseName: generateChineseName(),
					studentId: `SEED_${tag}_${i}`,
					classId,
					status: 'Enrolled',
					e2eTag: tag
				})
			);
		}

		return { count: ids.length, classId };
	}
});

export const createCategory = mutation({
	args: {
		name: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		casAlignment: v.optional(
			v.array(v.union(v.literal('Creativity'), v.literal('Activity'), v.literal('Service')))
		),
		meritCriteria: v.optional(v.array(v.string())),
		demeritCriteria: v.optional(v.array(v.string()))
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
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
		e2eTag: v.string()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
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
		e2eTag: v.string()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

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

export const tagHouseEventsByTitle = mutation({
	args: { titlePart: v.string(), e2eTag: v.string() },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const events = await ctx.db.query('house_events').collect();
		let tagged = 0;
		for (const event of events) {
			if (event.title.includes(args.titlePart)) {
				await ctx.db.patch(event._id, { e2eTag: args.e2eTag });
				tagged++;
			}
		}
		return { tagged };
	}
});

/* ------------------------------------------------------------------------- *
 * Department-aware factories (#242)
 *
 * Each factory writes only the tables its department owns: `createEsl*` never
 * touches the `students`/`classes`/`evaluations` graph, and the HWIS factories
 * above never touch an `esl_*` table. Shared users are the one place a
 * department is explicit, because `users.departmentRoles` is what decides which
 * department a staff member belongs to.
 * ------------------------------------------------------------------------- */

const departmentValidator = v.union(
	v.literal('international'),
	v.literal('esl'),
	v.literal('both')
);

const departmentRoleValidator = v.union(v.literal('admin'), v.literal('teacher'));

const eslTermValidator = v.union(v.literal('S1'), v.literal('S2'));

const eslClassTypeValidator = v.union(
	v.literal('CLIL'),
	v.literal('Comm'),
	v.literal('G9'),
	v.literal('H10A'),
	v.literal('H10B')
);

const eslEventTypeValidator = v.union(
	v.literal('start_school'),
	v.literal('reminder'),
	v.literal('no_school'),
	v.literal('no_class'),
	v.literal('partial'),
	v.literal('exam'),
	v.literal('g9_mock')
);

const eslEventTargetValidator = v.union(
	v.literal('all'),
	v.literal('CLIL'),
	v.literal('Comm'),
	v.literal('G7'),
	v.literal('G8'),
	v.literal('G9'),
	v.literal('H1')
);

const eslWeekdayValidator = v.union(
	v.literal('Monday'),
	v.literal('Tuesday'),
	v.literal('Wednesday'),
	v.literal('Thursday'),
	v.literal('Friday')
);

function defaultEslClassTypes(grade: number) {
	if (grade === 10) return ['H10A', 'H10B'] as const;
	if (grade === 9) return ['G9'] as const;
	return ['CLIL', 'Comm'] as const;
}

/**
 * Create an International (`classes`) row. Explicit counterpart to
 * {@link createEslClass}, so a spec states which department's class it needs.
 */
export const createHwisClass = mutation({
	args: {
		grade: v.number(),
		class: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const tag = args.e2eTag || getE2ETag();
		return await getOrCreateClass(ctx, args.grade, args.class || 'default', tag);
	}
});

/**
 * Create an ESL semester. Writes `esl_semesters` only.
 */
export const createEslSemester = mutation({
	args: {
		year: v.optional(v.string()),
		term: v.optional(eslTermValidator),
		startDate: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		return await ctx.db.insert('esl_semesters', {
			year: args.year ?? '2025-2026',
			term: args.term ?? 'S1',
			startDate: args.startDate ?? '2025-08-25',
			e2eTag: args.e2eTag || getE2ETag()
		});
	}
});

/**
 * Create an ESL cohort and the classes that teach it. Writes `esl_cohorts` and
 * `esl_classes` only; the cohort carries the tag because `esl_classes` has no
 * tag column of its own.
 */
export const createEslCohort = mutation({
	args: {
		year: v.optional(v.string()),
		grade: v.optional(v.number()),
		level: v.optional(v.string()),
		classNumber: v.optional(v.string()),
		classTypes: v.optional(v.array(eslClassTypeValidator)),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const tag = args.e2eTag || getE2ETag();
		const year = args.year ?? '2025-2026';
		const grade = args.grade ?? 7;
		const level = args.level ?? 'A';
		const classNumber = args.classNumber ?? '1';
		const now = Date.now();

		const cohortId = await ctx.db.insert('esl_cohorts', {
			year,
			grade,
			level,
			classNumber,
			status: 'active',
			createdAt: now,
			e2eTag: tag
		});

		const types = args.classTypes ?? defaultEslClassTypes(grade);
		const classIds: Id<'esl_classes'>[] = [];
		for (const type of types) {
			classIds.push(
				await ctx.db.insert('esl_classes', {
					cohortId,
					type,
					name: `G${grade}-${level}-${classNumber}-${type}`,
					status: 'active',
					createdAt: now
				})
			);
		}

		return { cohortId, classIds };
	}
});

/**
 * Add one class to an existing ESL cohort. Writes `esl_classes` only.
 */
export const createEslClass = mutation({
	args: {
		cohortId: v.id('esl_cohorts'),
		type: v.optional(eslClassTypeValidator),
		name: v.optional(v.string()),
		teacherId: v.optional(v.id('users')),
		room: v.optional(v.string()),
		status: v.optional(v.union(v.literal('active'), v.literal('archived')))
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const cohort = await ctx.db.get(args.cohortId);
		if (!cohort) throw new Error('Cohort not found');
		const type = args.type ?? 'CLIL';
		return await ctx.db.insert('esl_classes', {
			cohortId: args.cohortId,
			type,
			name: args.name ?? `G${cohort.grade}-${type}`,
			...(args.teacherId === undefined ? {} : { teacherId: args.teacherId }),
			...(args.room === undefined ? {} : { room: args.room }),
			status: args.status ?? 'active',
			createdAt: Date.now()
		});
	}
});

/**
 * Create an ESL student in a cohort. Writes `esl_students` only — an ESL
 * student references `esl_cohorts`, never an International `classes` row.
 */
export const createEslStudent = mutation({
	args: {
		cohortId: v.id('esl_cohorts'),
		englishName: v.optional(v.string()),
		chineseName: v.optional(v.string()),
		schoolStudentId: v.optional(v.string()),
		chineseClass: v.optional(v.string()),
		status: v.optional(v.union(v.literal('active'), v.literal('disabled'))),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const cohort = await ctx.db.get(args.cohortId);
		if (!cohort) throw new Error('Cohort not found');
		return await ctx.db.insert('esl_students', {
			cohortId: args.cohortId,
			englishName: args.englishName ?? generateStudentName(),
			chineseName: args.chineseName ?? generateChineseName(),
			schoolStudentId: args.schoolStudentId ?? `ESL${Date.now().toString().slice(-7)}`,
			chineseClass: args.chineseClass ?? 'J101',
			status: args.status ?? 'active',
			enrolledAt: Date.now(),
			e2eTag: args.e2eTag || getE2ETag()
		});
	}
});

/**
 * Create an ESL event in a semester. Writes `esl_events` only.
 */
export const createEslEvent = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		type: v.optional(eslEventTypeValidator),
		title: v.optional(v.string()),
		target: v.optional(eslEventTargetValidator),
		date: v.optional(v.string()),
		endDate: v.optional(v.string()),
		note: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');
		return await ctx.db.insert('esl_events', {
			semesterId: args.semesterId,
			type: args.type ?? 'no_school',
			title: args.title ?? 'Test ESL Event',
			target: args.target ?? 'all',
			date: args.date ?? '2025-09-01',
			...(args.endDate === undefined ? {} : { endDate: args.endDate }),
			...(args.note === undefined ? {} : { note: args.note }),
			e2eTag: args.e2eTag || getE2ETag()
		});
	}
});

/**
 * Create one weekly meeting for an ESL class. Writes `esl_class_meetings` only.
 */
export const createEslMeeting = mutation({
	args: {
		classId: v.id('esl_classes'),
		year: v.optional(v.string()),
		day: v.optional(eslWeekdayValidator),
		period: v.optional(v.number()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const cls = await ctx.db.get(args.classId);
		if (!cls) throw new Error('ESL class not found');
		return await ctx.db.insert('esl_class_meetings', {
			classId: args.classId,
			year: args.year ?? '2025-2026',
			day: args.day ?? 'Monday',
			period: args.period ?? 1,
			e2eTag: args.e2eTag || getE2ETag()
		});
	}
});

/**
 * Create a teacher's note for an ESL class date. Writes `teacher_notes` only.
 */
export const createEslNote = mutation({
	args: {
		classId: v.id('esl_classes'),
		teacherId: v.id('users'),
		date: v.optional(v.string()),
		text: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const cls = await ctx.db.get(args.classId);
		if (!cls) throw new Error('ESL class not found');
		return await ctx.db.insert('teacher_notes', {
			classId: args.classId,
			date: args.date ?? '2025-09-01',
			teacherId: args.teacherId,
			text: args.text ?? 'Test note',
			updatedAt: Date.now(),
			updatedBy: args.teacherId,
			e2eTag: args.e2eTag || getE2ETag()
		});
	}
});

/**
 * Create a teacher availability block. Writes `esl_teacher_availability` only.
 */
export const createEslAvailability = mutation({
	args: {
		teacherId: v.id('users'),
		year: v.optional(v.string()),
		day: v.optional(eslWeekdayValidator),
		period: v.optional(v.number()),
		note: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		return await ctx.db.insert('esl_teacher_availability', {
			teacherId: args.teacherId,
			year: args.year ?? '2025-2026',
			day: args.day ?? 'Monday',
			period: args.period ?? 1,
			...(args.note === undefined ? {} : { note: args.note }),
			e2eTag: args.e2eTag || getE2ETag()
		});
	}
});

/**
 * Create a test staff account with an explicit department assignment.
 *
 * `department: 'both'` is what a cross-department (hybrid) account needs;
 * teardown preserves such a user in every scope because removing them would
 * strip the other department's access.
 */
export const createTestUser = mutation({
	args: {
		authId: v.string(),
		name: v.optional(v.string()),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		department: v.optional(departmentValidator),
		departmentRole: v.optional(departmentRoleValidator),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const role = args.role ?? 'teacher';
		if (role === 'student' && args.department !== undefined) {
			throw new Error('Students cannot hold department roles');
		}

		let departmentRoles:
			| { international?: 'admin' | 'teacher'; esl?: 'admin' | 'teacher' }
			| undefined;
		if (args.department) {
			const rank = args.departmentRole ?? 'teacher';
			if (args.department === 'both') {
				departmentRoles = { international: rank, esl: rank };
			} else if (args.department === 'international') {
				departmentRoles = { international: rank };
			} else {
				departmentRoles = { esl: rank };
			}
		}

		return await ctx.db.insert('users', {
			authId: args.authId,
			name: args.name ?? `Test ${role}`,
			role,
			status: args.status ?? 'active',
			...(departmentRoles ? { departmentRoles } : {}),
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});
	}
});
