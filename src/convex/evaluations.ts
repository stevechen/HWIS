import { query, mutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { readEvaluations } from './shared/evaluation_read_model';
import {
	requireAdminForSensitiveOperation,
	getAuthenticatedUser,
	requireUserProfile,
	requireActiveStaff,
	requireUserProfileForSensitiveOperation,
	isTestRuntime
} from './auth';
import { getWeekNumber, formatDateRange } from './shared/evaluation_utils';
import { weekStartOf, weekEndOf, isEditable } from './shared/evaluation_week';
import { enrichEvaluations } from './shared/enrichment';
import type { RecentBatch, RecentBatchEvaluation } from './shared/recentActions';
import { derivedBatchKey } from './shared/recentActions';
import { resolveStudentFromEmail, isStudentEmailAddress } from './shared/student';
import {
	canReadTeacherHistory,
	requireEvaluationCreate,
	requireEvaluationDelete,
	requireEvaluationEdit,
	requireEvaluationRead,
	getEvaluationCapabilities,
	type AuthorizationActor
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
		requireEvaluationCreate(userDoc);
		const teacherId = userDoc._id;

		const category = await ctx.db.get(args.categoryId);
		if (!category) {
			throw new Error(`Category with ID ${args.categoryId} does not exist`);
		}

		const timestamp = Date.now();
		// All rows created in one call share a batch so teachers can correct the
		// whole group (or a subset) later from the Recent Actions panel.
		const batchId = crypto.randomUUID();
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
				batchId,
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
					categoryName: category.name,
					batchId
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

		requireEvaluationDelete(userDoc, { teacherId: evaluation.teacherId });

		if (!isEditable(evaluation.timestamp)) {
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
		const authUser = await getAuthenticatedUser(ctx);
		if (!authUser) return { evaluations: [], cursor: null };

		const authId = authUser.authId || (typeof authUser._id === 'string' ? authUser._id : undefined);
		if (!authId) return { evaluations: [], cursor: null };

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) return [];

		const actor: AuthorizationActor = { kind: 'staff', subject: userDoc };
		const caps = getEvaluationCapabilities(actor);

		if (!caps.viewOwnEvaluation) return [];

		return await readEvaluations(ctx, {
			scope: 'teacher',
			teacherId: userDoc._id,
			sortAscending: false,
			filters: { studentFilter: args.studentFilter, showUnenrolled: caps.viewAnyEvaluation }
		});
	}
});

/**
 * Groups the current user's recent evaluations into the batches they were
 * created in. Rows created together share a `batchId`; rows created before
 * that column existed fall back to a derived key (timestamp + value + category
 * + details + semester) so older batches still surface.
 *
 * Returns recent batches (newest first) with enriched per-student rows. The
 * client decides which batches are actionable (calendar lock + role), keeping
 * this query cache-friendly.
 */
export const listRecentBatches = query({
	args: {},
	handler: async (ctx) => {
		const authUser = await getAuthenticatedUser(ctx);
		if (!authUser) return [];

		const authId = authUser.authId || (typeof authUser._id === 'string' ? authUser._id : undefined);
		if (!authId) return [];

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) return [];

		const actor: AuthorizationActor = { kind: 'staff', subject: userDoc };
		const caps = getEvaluationCapabilities(actor);
		if (!caps.viewOwnEvaluation) return [];

		const recent = await ctx.db
			.query('evaluations')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', userDoc._id))
			.order('desc')
			.take(500);

		const enriched = await enrichEvaluations(recent, ctx);

		const groups = new Map<string, RecentBatch>();

		for (const eval_ of enriched) {
			const key = eval_.batchId ?? derivedBatchKey(eval_);
			const item: RecentBatchEvaluation = {
				id: eval_._id,
				studentId: eval_.studentId,
				englishName: eval_.englishName,
				className: eval_.class ? `Grade ${eval_.grade} ${eval_.class}` : undefined,
				value: eval_.value,
				categoryId: eval_.categoryId,
				category: eval_.category,
				details: eval_.details,
				timestamp: eval_.timestamp
			};

			const existing = groups.get(key);
			if (existing) {
				existing.evaluations.push(item);
			} else {
				groups.set(key, { batchId: key, createdAt: eval_.timestamp, evaluations: [item] });
			}
		}

		return Array.from(groups.values())
			.map((batch) => ({
				...batch,
				evaluations: [...batch.evaluations].sort((a, b) =>
					a.englishName.localeCompare(b.englishName)
				)
			}))
			.sort((a, b) => b.createdAt - a.createdAt);
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
			const weekStart = weekStartOf(eval_.timestamp);
			if (!fridayMap.has(weekStart)) {
				fridayMap.set(weekStart, new Set());
			}
			fridayMap.get(weekStart)!.add(eval_.studentId.toString());
		}

		const reports = Array.from(fridayMap.entries())
			.map(([weekStart, studentIds]) => ({
				weekNumber: getWeekNumber(weekStart),
				fridayDate: weekStart,
				formattedDate: formatDateRange(weekStart),
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

		// `fridayDate` is actually the Monday that starts the week (kept for the
		// established query contract); the week spans Monday 00:00 through Sunday
		// 23:59:59.999 of the same week.
		const startOfWeek = weekStartOf(args.fridayDate);
		const endOfWeek = weekEndOf(args.fridayDate);

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
		await requireActiveStaff(ctx);
		return await ctx.db.get(args.studentId);
	}
});

// Get student by custom studentId code (e.g., "S1001")
export const getStudentByStudentIdCode = query({
	args: { studentIdCode: v.string() },
	handler: async (ctx, args) => {
		await requireActiveStaff(ctx);
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
		const user = await requireActiveStaff(ctx);
		if (!canReadTeacherHistory(user)) throw new Error('Forbidden: Teacher history access required');

		return await readEvaluations(ctx, {
			scope: 'teacher',
			teacherId: user._id,
			studentId: args.studentId,
			sortAscending: false,
			filters: { showUnenrolled: true }
		});
	}
});

// Get evaluation history for a student by custom studentId code (teacher view)
export const getStudentEvaluationsByTeacherByStudentIdCode = query({
	args: {
		studentIdCode: v.string()
	},
	handler: async (ctx, args) => {
		const user = await requireActiveStaff(ctx);
		if (!canReadTeacherHistory(user)) throw new Error('Forbidden: Teacher history access required');

		// Look up student by custom studentId code to get the Convex ID
		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentIdCode))
			.first();

		if (!student) {
			return [];
		}

		return await readEvaluations(ctx, {
			scope: 'teacher',
			teacherId: user._id,
			studentId: student._id,
			sortAscending: false,
			filters: { showUnenrolled: true }
		});
	}
});

// Get all evaluation history for a student (admin view - all evaluations)
export const getStudentEvaluationsAll = query({
	args: {
		studentId: v.id('students')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const rows = await readEvaluations(ctx, {
			scope: 'admin',
			studentId: args.studentId,
			sortAscending: false,
			filters: { showUnenrolled: true }
		});
		return rows;
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

		return await readEvaluations(ctx, {
			scope: 'admin',
			studentId: student._id,
			sortAscending: false,
			filters: { showUnenrolled: true }
		});
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

		return await readEvaluations(ctx, {
			scope: 'admin',
			filters: {
				studentFilter: args.studentFilter,
				teacherFilter: args.teacherFilter,
				showUnenrolled: args.showUnenrolled
			},
			sortAscending: false
		});
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
		return await readEvaluations(ctx, {
			scope: 'admin',
			filters: {
				studentFilter: args.studentFilter,
				teacherFilter: args.teacherFilter,
				showUnenrolled: args.showUnenrolled
			},
			sortAscending: args.sortAscending,
			paginationOpts: args.paginationOpts
		});
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

		requireEvaluationEdit(userDoc, evaluation);

		if (!isEditable(evaluation.timestamp)) {
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

export const updateMany = mutation({
	args: {
		ids: v.array(v.id('evaluations')),
		value: v.optional(v.number()),
		categoryId: v.optional(v.id('point_categories')),
		details: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfileForSensitiveOperation(ctx);

		if (args.categoryId !== undefined) {
			const category = await ctx.db.get(args.categoryId);
			if (!category) {
				throw new Error(`Category with ID ${args.categoryId} does not exist`);
			}
		}

		const updates: { value?: number; categoryId?: Id<'point_categories'>; details?: string } = {};
		if (args.value !== undefined) updates.value = args.value;
		if (args.categoryId !== undefined) updates.categoryId = args.categoryId;
		if (args.details !== undefined) updates.details = args.details;

		const timestamp = Date.now();

		// All-or-nothing: any locked, unauthorized, or missing row aborts the
		// whole call before any row is touched (mutations are transactional).
		for (const id of args.ids) {
			const evaluation = await ctx.db.get(id);
			if (!evaluation) {
				throw new Error(`Evaluation not found: ${id}`);
			}

			requireEvaluationEdit(userDoc, evaluation);

			if (!isEditable(evaluation.timestamp)) {
				throw new Error(
					'This evaluation can no longer be edited. Evaluations are locked the Monday after the week ends (Mon 00:00). You can only edit evaluations within their Monday-to-Sunday week.'
				);
			}

			await ctx.db.patch(id, updates);

			await ctx.db.insert('audit_logs', {
				action: 'update_evaluation',
				performerId: userDoc._id,
				targetTable: 'evaluations',
				targetId: id.toString(),
				oldValue: { ...evaluation },
				newValue: {
					...updates,
					...(evaluation.batchId ? { batchId: evaluation.batchId } : {})
				},
				timestamp
			});
		}

		return { success: true, count: args.ids.length };
	}
});

export const removeMany = mutation({
	args: {
		ids: v.array(v.id('evaluations'))
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx);

		const timestamp = Date.now();

		for (const id of args.ids) {
			const evaluation = await ctx.db.get(id);
			if (!evaluation) {
				throw new Error(`Evaluation not found: ${id}`);
			}

			requireEvaluationDelete(userDoc, evaluation);

			if (!isEditable(evaluation.timestamp)) {
				throw new Error(
					'This evaluation can no longer be deleted. Evaluations are locked the Monday after the week ends (Mon 00:00). You can only edit evaluations within their Monday-to-Sunday week.'
				);
			}

			await ctx.db.delete(id);

			await ctx.db.insert('audit_logs', {
				action: 'delete_evaluation',
				performerId: userDoc._id,
				targetTable: 'evaluations',
				targetId: id.toString(),
				oldValue: {
					studentId: evaluation.studentId,
					value: evaluation.value,
					categoryId: evaluation.categoryId,
					...(evaluation.batchId ? { batchId: evaluation.batchId } : {})
				},
				newValue: null,
				timestamp,
				e2eTag: evaluation.e2eTag
			});
		}

		return { success: true, count: args.ids.length };
	}
});

export const getEvaluation = query({
	args: { id: v.id('evaluations') },
	handler: async (ctx, args) => {
		const user = await requireUserProfile(ctx);

		const evaluation = await ctx.db.get(args.id);
		if (!evaluation) return null;

		try {
			requireEvaluationRead(user, evaluation);
		} catch {
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
		const authUser = await getAuthenticatedUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const email = (authUser as { email?: string }).email?.toLowerCase();
		if (!isStudentEmailAddress(email)) {
			throw new Error('Only students can access this endpoint');
		}

		const student = await resolveStudentFromEmail(email, ctx);
		if (!student || student.status !== 'Enrolled') {
			return [];
		}

		const evaluations = await readEvaluations(ctx, {
			scope: 'admin',
			studentId: student._id,
			limit: 200,
			sortAscending: false,
			filters: { showUnenrolled: true }
		});

		return evaluations.map((evaluation) => ({
			_id: evaluation._id,
			value: evaluation.value,
			category: evaluation.category,
			details: evaluation.details,
			timestamp: evaluation.timestamp
		}));
	}
});
