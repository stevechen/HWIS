import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import type { EnrichedEvaluation } from './shared/enrichment';
import {
	requireAdminForSensitiveOperation,
	getAuthenticatedUser,
	requireUserProfile,
	requireUserProfileForSensitiveOperation,
	isTestRuntime
} from './auth';
import {
	getFridayOfWeek,
	getWeekNumber,
	formatDateRange,
	matchesMultiSearch
} from './shared/evaluation_utils';
import { enrichEvaluations } from './shared/enrichment';
import {
	canReadStudent,
	canReadEvaluation,
	isStudent,
	requireStudentRole
} from './shared/authorization';

export const getUserByAuthId = query({
	args: { authId: v.string() },
	handler: async (ctx, args) => {
		const currentUser = await getAuthenticatedUser(ctx);
		if (!currentUser) return null;

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
		details: v.string(),
		semesterId: v.string(),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx);
		const teacherId = userDoc._id;

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
		id: v.id('evaluations')
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx);

		const evaluation = await ctx.db.get(args.id);
		if (!evaluation) {
			throw new Error('Evaluation not found');
		}

		if (evaluation.teacherId !== userDoc._id) {
			throw new Error('Not authorized to delete this evaluation');
		}

		const evalMonday = getFridayOfWeek(evaluation.timestamp);
		const lockTime = evalMonday + 7 * 24 * 60 * 60 * 1000;
		if (Date.now() >= lockTime) {
			throw new Error(
				'This evaluation can no longer be deleted. Evaluations are locked the Monday after the week ends (Mon 00:00). You can only edit evaluations within their Monday-to-Sunday week.'
			);
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

export const listRecent = query({
	args: {
		studentFilter: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Require authentication and filter by teacher
		const authUser = await getAuthenticatedUser(ctx);
		if (!authUser) return { evaluations: [], cursor: null };

		const authId = authUser.authId || (typeof authUser._id === 'string' ? authUser._id : undefined);
		if (!authId) return { evaluations: [], cursor: null };

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) return [];

		const userRole = userDoc?.role;
		const isAdmin = userRole === 'admin' || userRole === 'super';

		const allEvaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', userDoc._id))
			.order('desc')
			.take(200);

		let results = await enrichEvaluations(allEvaluations, ctx);

		results = results.map((eval_) => ({
			...eval_,
			_id: eval_._id,
			studentId: eval_.studentId,
			teacherId: eval_.teacherId,
			englishName: eval_.englishName,
			chineseName: eval_.chineseName,
			grade: eval_.grade,
			class: eval_.class,
			studentIdCode: eval_.studentIdCode,
			status: eval_.status,
			value: eval_.value,
			categoryId: eval_.categoryId,
			category: eval_.category,
			details: eval_.details,
			timestamp: eval_.timestamp,
			semesterId: eval_.semesterId
		}));

		// Server-side filtering if studentFilter is provided
		if (args.studentFilter && args.studentFilter.trim()) {
			results = results.filter((e) => matchesMultiSearch(args.studentFilter!, e.englishName ?? ''));
		}

		// Filter out evaluations for unenrolled students (non-admin view)
		if (!isAdmin) {
			results = results.filter((e) => e.status !== 'Not Enrolled');
		}

		return results.sort((a, b) => b.timestamp - a.timestamp);
	}
});

export const getWeeklyReportsList = query({
	args: {
		sinceTimestamp: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const defaultLookbackMs = 1000 * 60 * 60 * 24 * 365 * 2; // 2 years
		const sinceTimestamp =
			args.sinceTimestamp ?? (isTestRuntime ? undefined : Date.now() - defaultLookbackMs);

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp', (q) =>
				sinceTimestamp !== undefined ? q.gte('timestamp', sinceTimestamp) : q
			)
			.take(1000);

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
		fridayDate: v.number()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		// fridayDate is actually the Monday of the week (despite the name)
		// Week runs from Monday to end of Friday (Monday + 6 days)
		const startOfWeek = args.fridayDate;
		const endOfWeek = args.fridayDate + 6 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1;

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp', (q) => q.gt('timestamp', startOfWeek).lt('timestamp', endOfWeek))
			.take(500);

		const enriched = await enrichEvaluations(evaluations, ctx);

		const studentPointsMap = new Map<
			string,
			{
				studentId: string;
				englishName: string;
				chineseName: string;
				grade: number | undefined;
				class?: string;
				pointsByCategory: Record<string, number>;
				totalPoints: number;
			}
		>();

		for (const eval_ of enriched) {
			const student = eval_;
			if (!student.englishName || student.englishName === 'Unknown Student') continue;

			const categoryName = eval_.category || 'Unknown Category';

			let studentData = studentPointsMap.get(student.studentIdCode);
			if (!studentData) {
				studentData = {
					studentId: student.studentIdCode,
					englishName: student.englishName,
					chineseName: student.chineseName,
					grade: student.grade,
					class: student.class,
					pointsByCategory: {},
					totalPoints: 0
				};
				studentPointsMap.set(student.studentIdCode, studentData);
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
	args: { studentId: v.id('students') },
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx);
		if (!canReadStudent(user, args.studentId)) {
			return null;
		}
		return await ctx.db.get(args.studentId);
	}
});

// Get student by custom studentId code (e.g., "S1001")
export const getStudentByStudentIdCode = query({
	args: { studentIdCode: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx);
		if (isStudent(user)) return null;
		return await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentIdCode))
			.first();
	}
});

// Get evaluation history for a student (teacher view - only their own evaluations)
export const getStudentEvaluationsByTeacher = query({
	args: {
		studentId: v.id('students')
	},
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx);

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId_teacherId', (q) =>
				q.eq('studentId', args.studentId).eq('teacherId', user._id)
			)
			.take(200);

		const enriched = await enrichEvaluations(evaluations, ctx);

		const teacher = await ctx.db.get(user._id);
		const teacherName = teacher?.name || 'Unknown Teacher';

		const result = enriched.map((e) => ({
			...e,
			categoryId: e.categoryId.toString(),
			teacherName,
			isAdmin: false
		}));

		return result.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Get evaluation history for a student by custom studentId code (teacher view)
export const getStudentEvaluationsByTeacherByStudentIdCode = query({
	args: {
		studentIdCode: v.string()
	},
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx);

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

		const baseEnriched = await enrichEvaluations(evaluations, ctx);

		const teacher = await ctx.db.get(user._id);
		const teacherName = teacher?.name || 'Unknown Teacher';

		const enriched = baseEnriched.map((e) => ({
			...e,
			categoryId: e.categoryId.toString(),
			teacherName,
			isAdmin: false
		}));

		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Get all evaluation history for a student (admin view - all evaluations)
export const getStudentEvaluationsAll = query({
	args: {
		studentId: v.id('students')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.take(500);

		const baseEnriched = await enrichEvaluations(evaluations, ctx);

		// Fetch teacher data for enrichment
		const teacherIds = [...new Set(evaluations.map((e) => e.teacherId))];
		const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);

		// Enrich evaluations with teacher data on top of base enrichment
		const enriched = baseEnriched.map((eval_) => ({
			...eval_,
			categoryId: eval_.categoryId.toString(),
			teacherName: teacherMap.get(eval_.teacherId)?.name || 'Unknown Teacher',
			isAdmin:
				teacherMap.get(eval_.teacherId)?.role === 'admin' ||
				teacherMap.get(eval_.teacherId)?.role === 'super'
		}));

		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});

// Get all evaluations for a student by custom studentId code (e.g., "S1001")
export const getStudentEvaluationsAllByStudentIdCode = query({
	args: {
		studentIdCode: v.string()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		// Look up student by custom studentId code to get the Convex ID
		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentIdCode))
			.first();

		if (!student) {
			return [];
		}

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', student._id))
			.take(500);

		const baseEnriched = await enrichEvaluations(evaluations, ctx);

		const teacherIds = [...new Set(evaluations.map((e) => e.teacherId))];
		const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);

		// Enrich evaluations with teacher data on top of base enrichment
		const enriched = baseEnriched.map((eval_: EnrichedEvaluation) => {
			const teacher = teacherMap.get(eval_.teacherId);
			const isAdminUser = teacher?.role === 'admin' || teacher?.role === 'super';
			return {
				...eval_,
				categoryId: eval_.categoryId.toString(),
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
		showUnenrolled: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const allEvaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp')
			.order('desc')
			.take(500);

		const baseEnriched = await enrichEvaluations(allEvaluations, ctx);

		// Fetch teacher data for enrichment
		const teacherIds = [...new Set(allEvaluations.map((e) => e.teacherId))];
		const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);

		let enriched = baseEnriched.map((eval_: EnrichedEvaluation) => ({
			...eval_,
			_id: eval_._id.toString(),
			studentId: eval_.studentId.toString(),
			categoryId: eval_.categoryId.toString(),
			teacherName: teacherMap.get(eval_.teacherId)?.name || 'Unknown Teacher',
			teacherId: eval_.teacherId.toString()
		}));

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
		paginationOpts: paginationOptsValidator
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const order = args.sortAscending ? 'asc' : 'desc';

		// Use paginate() instead of collect() for cursor-based pagination
		const result = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp')
			.order(order)
			.paginate(args.paginationOpts);

		// Enrich only the current page
		const baseEnriched = await enrichEvaluations(result.page, ctx);

		// Fetch teacher data for enrichment
		const teacherIds = [...new Set(result.page.map((e) => e.teacherId))];
		const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
		const teacherMap = new Map(
			teachers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);

		let enriched = baseEnriched.map((eval_: EnrichedEvaluation) => ({
			...eval_,
			_id: eval_._id.toString(),
			studentId: eval_.studentId.toString(),
			categoryId: eval_.categoryId.toString(),
			teacherName: teacherMap.get(eval_.teacherId)?.name || 'Unknown Teacher',
			teacherId: eval_.teacherId.toString()
		}));

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
		details: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfileForSensitiveOperation(ctx);
		const evaluation = await ctx.db.get(args.id);

		if (!evaluation) {
			throw new Error('Evaluation not found');
		}

		// Only allow editing own evaluations (admins are also teachers)
		// Admins can only edit evaluations they created, same as regular teachers
		if (evaluation.teacherId !== userDoc._id) {
			throw new Error('Not authorized to edit this evaluation');
		}

		const evalMonday = getFridayOfWeek(evaluation.timestamp);
		const lockTime = evalMonday + 7 * 24 * 60 * 60 * 1000;
		if (Date.now() >= lockTime) {
			throw new Error(
				'This evaluation can no longer be edited. Evaluations are locked the Monday after the week ends (Mon 00:00). You can only edit evaluations within their Monday-to-Sunday week.'
			);
		}

		if (args.categoryId !== undefined) {
			const category = await ctx.db.get(args.categoryId);
			if (!category) {
				throw new Error(`Category with ID ${args.categoryId} does not exist`);
			}
		}

		const updates: Partial<typeof evaluation> = {};
		if (args.value !== undefined) updates.value = args.value;
		if (args.categoryId !== undefined) updates.categoryId = args.categoryId;
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
	args: { id: v.id('evaluations') },
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx);

		const evaluation = await ctx.db.get(args.id);
		if (!evaluation) return null;

		if (!canReadEvaluation(user, evaluation)) {
			return null;
		}

		return evaluation;
	}
});

// Get evaluations for a student (anonymous view - no teacher names)
// Used by students to view their own evaluations
export const getStudentEvaluationsAnonymous = query({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserProfile(ctx);

		requireStudentRole(user);

		const studentRecordId = user.studentRecordId;

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', studentRecordId))
			.take(200);

		const baseEnriched = await enrichEvaluations(evaluations, ctx);

		// Return anonymous evaluations (no teacher names/IDs)
		const anonymousEvaluations = baseEnriched.map((e: EnrichedEvaluation) => ({
			_id: e._id,
			value: e.value,
			category: e.category,
			details: e.details,
			timestamp: e.timestamp
		}));

		return anonymousEvaluations.sort((a, b) => b.timestamp - a.timestamp);
	}
});
