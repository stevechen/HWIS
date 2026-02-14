/* eslint-disable @typescript-eslint/no-explicit-any */
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { requireUserProfile, getAuthenticatedUser, requireAdminRole } from './auth';

export const getUserByAuthId = query({
	args: { authId: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();
		if (user) {
			return { authId: user.authId, role: user.role, status: user.status };
		}
		return null;
	}
});

export const create = mutation({
	args: {
		studentIds: v.array(v.id('students')),
		value: v.number(),
		categoryId: v.id('point_categories'),
		subCategory: v.string(),
		details: v.string(),
		semesterId: v.string(),
		testToken: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx, args.testToken);
		const teacherId = userDoc._id;

		// Validate category exists
		const category = await ctx.db.get(args.categoryId);
		if (!category) {
			throw new Error(`Category with ID ${args.categoryId} does not exist`);
		}

		const timestamp = Date.now();
		const evaluationIds: string[] = [];

		for (const studentId of args.studentIds) {
			const evaluationId = await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: args.value,
				categoryId: args.categoryId,
				subCategory: args.subCategory,
				details: args.details,
				timestamp,
				semesterId: args.semesterId,
				e2eTag: args.e2eTag
			});

			evaluationIds.push(evaluationId);

			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: userDoc._id,
				targetTable: 'evaluations',
				targetId: evaluationId.toString(),
				oldValue: null,
				newValue: {
					studentId,
					value: args.value,
					categoryId: args.categoryId,
					categoryName: category.name
				},
				timestamp,
				e2eTag: args.e2eTag
			});
		}

		return evaluationIds;
	}
});

export const remove = mutation({
	args: {
		id: v.id('evaluations'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx, args.testToken);

		const evaluation = await ctx.db.get(args.id);
		if (!evaluation) {
			throw new Error('Evaluation not found');
		}

		await ctx.db.delete(args.id);

		await ctx.db.insert('audit_logs', {
			action: 'delete_evaluation',
			performerId: userDoc._id,
			targetTable: 'evaluations',
			targetId: args.id.toString(),
			oldValue: {
				studentId: evaluation.studentId,
				value: evaluation.value,
				categoryId: evaluation.categoryId
			},
			newValue: null,
			timestamp: Date.now(),
			e2eTag: evaluation.e2eTag
		});
	}
});

// Helper function for server-side filtering
function matchesMultiSearch(filter: string, value: string): boolean {
	if (!filter.trim()) return true;
	const searchTerms = filter
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (searchTerms.length === 0) return true;
	return searchTerms.some((term) => value.toLowerCase().includes(term));
}

export const listRecent = query({
	args: {
		studentFilter: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Require authentication and filter by teacher
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) return { evaluations: [], cursor: null };

		const authId = authUser.authId || (authUser as any)._id;

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) return [];

		// Check if user is admin
		const userRole = userDoc?.role;
		const isAdmin = userRole === 'admin' || userRole === 'super';

		// Fetch all evaluations for this teacher (collect() for better reactivity)
		const allEvaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', userDoc._id))
			.order('desc')
			.collect();

		// Fetch all students and categories for enrichment
		const studentIds = [...new Set(allEvaluations.map((e) => e.studentId))];
		const categoryIds = [...new Set(allEvaluations.map((e) => e.categoryId))];

		const [students, categories] = await Promise.all([
			Promise.all(studentIds.map((id) => ctx.db.get(id))),
			Promise.all(categoryIds.map((id) => ctx.db.get(id)))
		]);

		const studentMap = new Map(
			students.filter((s): s is NonNullable<typeof s> => s != null).map((s) => [s._id, s])
		);
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		let results = allEvaluations.map((eval_) => {
			const student = studentMap.get(eval_.studentId);
			const category = categoryMap.get(eval_.categoryId);
			return {
				_id: eval_._id,
				studentId: eval_.studentId,
				teacherId: eval_.teacherId,
				englishName: student?.englishName || 'Unknown Student',
				grade: student?.grade || 0,
				studentIdCode: student?.studentId || 'N/A',
				status: student?.status || 'Not Enrolled',
				value: eval_.value,
				categoryId: eval_.categoryId,
				category: category?.name || 'Unknown Category',
				subCategory: eval_.subCategory,
				details: eval_.details,
				timestamp: eval_.timestamp
			};
		});

		// Server-side filtering if studentFilter is provided
		if (args.studentFilter && args.studentFilter.trim()) {
			results = results.filter((e) => matchesMultiSearch(args.studentFilter!, e.englishName ?? ''));
		}

		// Filter out evaluations for unenrolled students (non-admin view)
		if (!isAdmin) {
			results = results.filter((e) => e.status !== 'Not Enrolled');
		}

		// Sort by timestamp descending
		return results.sort((a, b) => b.timestamp - a.timestamp);
	}
});

function getFridayOfWeek(timestamp: number): number {
	const date = new Date(timestamp);
	const day = date.getDay();
	const diff = date.getDate() - day + (day === 0 ? -6 : 1);
	const friday = new Date(date.setDate(diff));
	friday.setHours(0, 0, 0, 0);
	return friday.getTime();
}

function getWeekNumber(timestamp: number): number {
	const date = new Date(timestamp);
	const start = new Date(date.getFullYear(), 0, 1);
	const diff = date.getTime() - start.getTime();
	const oneWeek = 604800000;
	return Math.floor(diff / oneWeek) + 1;
}

function formatDateRange(fridayTimestamp: number): string {
	const friday = new Date(fridayTimestamp);
	const monday = new Date(friday);
	monday.setDate(friday.getDate() - 6);

	const mondayStr = monday.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
	const fridayStr = friday.toLocaleDateString('en-US', {
		month: 'short',
		day: '2-digit',
		year: 'numeric'
	});

	return `${mondayStr} - ${fridayStr}`;
}

export const getWeeklyReportsList = query({
	args: {
		sinceTimestamp: v.optional(v.number()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) return [];

		const defaultLookbackMs = 1000 * 60 * 60 * 24 * 365 * 2; // 2 years
		const sinceTimestamp =
			args.sinceTimestamp ?? (args.testToken ? undefined : Date.now() - defaultLookbackMs);

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp', (q) =>
				sinceTimestamp !== undefined ? q.gte('timestamp', sinceTimestamp) : q
			)
			.collect();

		const fridayMap = new Map<number, Set<string>>();

		for (const eval_ of evaluations) {
			const friday = getFridayOfWeek(eval_.timestamp);
			if (!fridayMap.has(friday)) {
				fridayMap.set(friday, new Set());
			}
			fridayMap.get(friday)!.add(eval_.studentId.toString());
		}

		const reports = Array.from(fridayMap.entries())
			.map(([friday, studentIds]) => ({
				weekNumber: getWeekNumber(friday),
				fridayDate: friday,
				formattedDate: formatDateRange(friday),
				studentCount: studentIds.size
			}))
			.sort((a, b) => b.fridayDate - a.fridayDate);

		return reports;
	}
});

export const getWeeklyReportDetail = query({
	args: {
		fridayDate: v.number(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) return [];

		const startOfWeek = args.fridayDate;
		const endOfWeek = args.fridayDate + 7 * 24 * 60 * 60 * 1000 - 1;

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp', (q) => q.gt('timestamp', startOfWeek).lt('timestamp', endOfWeek))
			.collect();

		const studentIds = [...new Set(evaluations.map((e) => e.studentId))];
		const categoryIds = [...new Set(evaluations.map((e) => e.categoryId))];

		const [students, categories] = await Promise.all([
			Promise.all(studentIds.map((id) => ctx.db.get(id))),
			Promise.all(categoryIds.map((id) => ctx.db.get(id)))
		]);

		const studentMap = new Map(
			students.filter((s): s is NonNullable<typeof s> => s != null).map((s) => [s._id, s])
		);
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		const studentPointsMap = new Map<
			string,
			{
				studentId: string;
				englishName: string;
				chineseName: string;
				grade: number;
				pointsByCategory: Record<string, number>;
				totalPoints: number;
			}
		>();

		for (const eval_ of evaluations) {
			const student = studentMap.get(eval_.studentId);
			if (!student) continue;

			const category = categoryMap.get(eval_.categoryId);
			const categoryName = category?.name || 'Unknown Category';

			let studentData = studentPointsMap.get(eval_.studentId.toString());
			if (!studentData) {
				studentData = {
					studentId: student.studentId,
					englishName: student.englishName,
					chineseName: student.chineseName,
					grade: student.grade,
					pointsByCategory: {},
					totalPoints: 0
				};
				studentPointsMap.set(eval_.studentId.toString(), studentData);
			}

			if (!studentData.pointsByCategory[categoryName]) {
				studentData.pointsByCategory[categoryName] = 0;
			}
			studentData.pointsByCategory[categoryName] += eval_.value;
			studentData.totalPoints += eval_.value;
		}

		return Array.from(studentPointsMap.values()).sort((a, b) =>
			a.englishName.localeCompare(b.englishName)
		);
	}
});

// Get student details by ID
export const getStudent = query({
	args: { studentId: v.id('students'), testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return null;
		return await ctx.db.get(args.studentId);
	}
});

// Get student by custom studentId code (e.g., "S1001")
export const getStudentByStudentIdCode = query({
	args: { studentIdCode: v.string(), testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return null;
		return await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentIdCode))
			.first();
	}
});

// Get evaluation history for a student (teacher view - only their own evaluations)
export const getStudentEvaluationsByTeacher = query({
	args: {
		studentId: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx, args.testToken);
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId_teacherId', (q) =>
				q.eq('studentId', args.studentId).eq('teacherId', user._id)
			)
			.collect();

		// Enrich evaluations with teacher and category data
		const teacher = await ctx.db.get(user._id);
		const teacherName = teacher?.name || 'Unknown Teacher';

		// Fetch categories for name lookup
		const categoryIds = [...new Set(evaluations.map((e) => e.categoryId))];
		const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		const enriched = evaluations.map((e) => {
			const category = categoryMap.get(e.categoryId);
			return {
				...e,
				categoryId: e.categoryId.toString(),
				category: category?.name || 'Unknown Category',
				teacherName,
				isAdmin: false
			};
		});

		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Get evaluation history for a student by custom studentId code (teacher view)
export const getStudentEvaluationsByTeacherByStudentIdCode = query({
	args: {
		studentIdCode: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx, args.testToken);

		// Look up student by custom studentId code to get the Convex ID
		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentIdCode))
			.first();

		if (!student) {
			return [];
		}

		// Fetch evaluations for this student by this teacher
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId_teacherId', (q) =>
				q.eq('studentId', student._id).eq('teacherId', user._id)
			)
			.collect();

		// Enrich evaluations with teacher and category data
		const teacher = await ctx.db.get(user._id);
		const teacherName = teacher?.name || 'Unknown Teacher';

		// Fetch categories for name lookup
		const categoryIds = [...new Set(evaluations.map((e) => e.categoryId))];
		const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		const enriched = evaluations.map((e) => {
			const category = categoryMap.get(e.categoryId);
			return {
				...e,
				categoryId: e.categoryId.toString(),
				category: category?.name || 'Unknown Category',
				teacherName,
				isAdmin: false
			};
		});

		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Get all evaluation history for a student (admin view - all evaluations)
export const getStudentEvaluationsAll = query({
	args: {
		studentId: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.collect();

		// Optimization: Batch fetch all teacher and category data to avoid N+1 queries
		const teacherIds = [...new Set(evaluations.map((e) => e.teacherId))];
		const categoryIds = [...new Set(evaluations.map((e) => e.categoryId))];

		const [teachers, categories] = await Promise.all([
			Promise.all(teacherIds.map((id) => ctx.db.get(id))),
			Promise.all(categoryIds.map((id) => ctx.db.get(id)))
		]);

		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		// Enrich evaluations with teacher and category data
		const enriched = evaluations.map((e) => {
			const teacher = teacherMap.get(e.teacherId);
			const category = categoryMap.get(e.categoryId);
			const isAdminUser = teacher?.role === 'admin' || teacher?.role === 'super';
			return {
				...e,
				categoryId: e.categoryId.toString(),
				category: category?.name || 'Unknown Category',
				teacherName: teacher?.name || 'Unknown Teacher',
				isAdmin: isAdminUser
			};
		});

		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Get all evaluations for a student by custom studentId code (e.g., "S1001")
export const getStudentEvaluationsAllByStudentIdCode = query({
	args: {
		studentIdCode: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		// Look up student by custom studentId code to get the Convex ID
		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentIdCode))
			.first();

		if (!student) {
			return [];
		}

		// Fetch all evaluations for this student
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', student._id))
			.collect();

		// Optimization: Batch fetch all teacher and category data to avoid N+1 queries
		const teacherIds = [...new Set(evaluations.map((e) => e.teacherId))];
		const categoryIds = [...new Set(evaluations.map((e) => e.categoryId))];

		const [teachers, categories] = await Promise.all([
			Promise.all(teacherIds.map((id) => ctx.db.get(id))),
			Promise.all(categoryIds.map((id) => ctx.db.get(id)))
		]);

		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		// Enrich evaluations with teacher and category data
		const enriched = evaluations.map((e) => {
			const teacher = teacherMap.get(e.teacherId);
			const category = categoryMap.get(e.categoryId);
			const isAdminUser = teacher?.role === 'admin' || teacher?.role === 'super';
			return {
				...e,
				categoryId: e.categoryId.toString(),
				category: category?.name || 'Unknown Category',
				teacherName: teacher?.name || 'Unknown Teacher',
				isAdmin: isAdminUser
			};
		});

		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Get all evaluations from all teachers (admin view)
export const listAllEvaluations = query({
	args: {
		studentFilter: v.optional(v.string()),
		teacherFilter: v.optional(v.string()),
		showUnenrolled: v.optional(v.boolean()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		// Fetch all evaluations (collect() for better reactivity)
		const allEvaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp')
			.order('desc')
			.collect();

		// Fetch student, teacher, and category data for enrichment
		const studentIds = [...new Set(allEvaluations.map((e) => e.studentId))];
		const teacherIds = [...new Set(allEvaluations.map((e) => e.teacherId))];
		const categoryIds = [...new Set(allEvaluations.map((e) => e.categoryId))];

		// Parallel fetch students, teachers, and categories
		const [students, teachers, categories] = await Promise.all([
			Promise.all(studentIds.map((id) => ctx.db.get(id))),
			Promise.all(teacherIds.map((id) => ctx.db.get(id))),
			Promise.all(categoryIds.map((id) => ctx.db.get(id)))
		]);

		// Build maps for O(1) lookup
		const studentMap = new Map(
			students.filter((s): s is NonNullable<typeof s> => s != null).map((s) => [s._id, s])
		);
		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		let enriched = allEvaluations.map((eval_) => {
			const student = studentMap.get(eval_.studentId);
			const teacher = teacherMap.get(eval_.teacherId);
			const category = categoryMap.get(eval_.categoryId);
			return {
				_id: eval_._id.toString(),
				studentId: eval_.studentId.toString(),
				englishName: student?.englishName || 'Unknown Student',
				grade: student?.grade || 0,
				studentIdCode: student?.studentId || 'N/A',
				status: student?.status || 'Not Enrolled',
				value: eval_.value,
				categoryId: eval_.categoryId.toString(),
				category: category?.name || 'Unknown Category',
				subCategory: eval_.subCategory,
				details: eval_.details,
				timestamp: eval_.timestamp,
				teacherName: teacher?.name || 'Unknown Teacher',
				teacherId: eval_.teacherId.toString()
			};
		});

		// Server-side filtering
		if (args.studentFilter && args.studentFilter.trim()) {
			enriched = enriched.filter((e) =>
				matchesMultiSearch(args.studentFilter!, e.englishName ?? '')
			);
		}

		if (args.teacherFilter && args.teacherFilter.trim()) {
			enriched = enriched.filter((e) =>
				matchesMultiSearch(args.teacherFilter!, e.teacherName ?? '')
			);
		}

		// Filter unenrolled students unless showUnenrolled is true
		// Default is to hide unenrolled students (showUnenrolled = false or undefined)
		if (args.showUnenrolled !== true) {
			enriched = enriched.filter((e) => e.status !== 'Not Enrolled');
		}

		// Sort by timestamp descending
		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Paginated version of listAllEvaluations for infinite scroll
export const listAllEvaluationsPaginated = query({
	args: {
		studentFilter: v.optional(v.string()),
		teacherFilter: v.optional(v.string()),
		showUnenrolled: v.boolean(),
		sortAscending: v.boolean(),
		paginationOpts: paginationOptsValidator,
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const order = args.sortAscending ? 'asc' : 'desc';

		// Use paginate() instead of collect() for cursor-based pagination
		const result = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp')
			.order(order)
			.paginate(args.paginationOpts);

		// Enrich only the current page
		const studentIds = [...new Set(result.page.map((e) => e.studentId))];
		const teacherIds = [...new Set(result.page.map((e) => e.teacherId))];
		const categoryIds = [...new Set(result.page.map((e) => e.categoryId))];

		// Parallel fetch students, teachers, and categories
		const [students, teachers, categories] = await Promise.all([
			Promise.all(studentIds.map((id) => ctx.db.get(id))),
			Promise.all(teacherIds.map((id) => ctx.db.get(id))),
			Promise.all(categoryIds.map((id) => ctx.db.get(id)))
		]);

		// Build maps for O(1) lookup
		const studentMap = new Map(
			students.filter((s): s is NonNullable<typeof s> => s != null).map((s) => [s._id, s])
		);
		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);
		const categoryMap = new Map(
			categories.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		let enriched = result.page.map((eval_) => {
			const student = studentMap.get(eval_.studentId);
			const teacher = teacherMap.get(eval_.teacherId);
			const category = categoryMap.get(eval_.categoryId);
			return {
				_id: eval_._id.toString(),
				studentId: eval_.studentId.toString(),
				englishName: student?.englishName || 'Unknown Student',
				grade: student?.grade || 0,
				studentIdCode: student?.studentId || 'N/A',
				status: student?.status || 'Not Enrolled',
				value: eval_.value,
				categoryId: eval_.categoryId.toString(),
				category: category?.name || 'Unknown Category',
				subCategory: eval_.subCategory,
				details: eval_.details,
				timestamp: eval_.timestamp,
				teacherName: teacher?.name || 'Unknown Teacher',
				teacherId: eval_.teacherId.toString()
			};
		});

		// Server-side: unenrolled filter
		if (args.showUnenrolled !== true) {
			enriched = enriched.filter((e) => e.status !== 'Not Enrolled');
		}

		// Server-side: text filters (may reduce results below limit)
		if (args.studentFilter && args.studentFilter.trim()) {
			enriched = enriched.filter((e) =>
				matchesMultiSearch(args.studentFilter!, e.englishName ?? '')
			);
		}

		if (args.teacherFilter && args.teacherFilter.trim()) {
			enriched = enriched.filter((e) =>
				matchesMultiSearch(args.teacherFilter!, e.teacherName ?? '')
			);
		}

		return {
			page: enriched,
			isDone: result.isDone,
			continueCursor: result.continueCursor
		};
	}
});

export const update = mutation({
	args: {
		id: v.id('evaluations'),
		value: v.optional(v.number()),
		categoryId: v.optional(v.id('point_categories')),
		subCategory: v.optional(v.string()),
		details: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx, args.testToken);
		const evaluation = await ctx.db.get(args.id);

		if (!evaluation) {
			throw new Error('Evaluation not found');
		}

		// Only allow editing own evaluations (admins are also teachers)
		// Admins can only edit evaluations they created, same as regular teachers
		if (evaluation.teacherId !== userDoc._id) {
			throw new Error('Not authorized to edit this evaluation');
		}

		// Validate category exists if provided
		if (args.categoryId !== undefined) {
			const category = await ctx.db.get(args.categoryId);
			if (!category) {
				throw new Error(`Category with ID ${args.categoryId} does not exist`);
			}
		}

		const updates: Partial<typeof evaluation> = {};
		if (args.value !== undefined) updates.value = args.value;
		if (args.categoryId !== undefined) updates.categoryId = args.categoryId;
		if (args.subCategory !== undefined) updates.subCategory = args.subCategory;
		if (args.details !== undefined) updates.details = args.details;

		await ctx.db.patch(args.id, updates);

		await ctx.db.insert('audit_logs', {
			action: 'update_evaluation',
			performerId: userDoc._id,
			targetTable: 'evaluations',
			targetId: args.id.toString(),
			oldValue: { ...evaluation },
			newValue: updates,
			timestamp: Date.now()
		});

		return { success: true };
	}
});

export const getEvaluation = query({
	args: { id: v.id('evaluations'), testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return null;

		const evaluation = await ctx.db.get(args.id);
		if (!evaluation) return null;

		return evaluation;
	}
});
