/* eslint-disable @typescript-eslint/no-explicit-any */
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
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
		category: v.string(),
		subCategory: v.string(),
		details: v.string(),
		semesterId: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx, args.testToken);
		const teacherId = userDoc._id;

		const timestamp = Date.now();
		const evaluationIds: string[] = [];

		for (const studentId of args.studentIds) {
			const evaluationId = await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: args.value,
				category: args.category,
				subCategory: args.subCategory,
				details: args.details,
				timestamp,
				semesterId: args.semesterId
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
					category: args.category
				},
				timestamp
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
				category: evaluation.category
			},
			newValue: null,
			timestamp: Date.now()
		});
	}
});

export const listRecent = query({
	args: {
		limit: v.optional(v.number()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) return [];

		const authId = authUser.authId || (authUser as any)._id;

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) return [];

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', userDoc._id))
			.order('desc')
			.take(args.limit || 50);

		const studentIds = [...new Set(evaluations.map((e) => e.studentId))];
		const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));
		const studentMap = new Map(
			students.filter((s): s is NonNullable<typeof s> => s != null).map((s) => [s._id, s])
		);

		const results: {
			/* eslint-disable @typescript-eslint/no-explicit-any */
			_id: any;
			studentId: any;
			studentName: string;
			studentIdCode: string;
			value: number;
			category: string;
			subCategory: string;
			details: string;
			timestamp: number;
		}[] = [];
		for (const eval_ of evaluations) {
			const student = studentMap.get(eval_.studentId);
			results.push({
				_id: eval_._id,
				studentId: eval_.studentId,
				studentName: student
					? `${student.englishName} (${student.chineseName})`
					: 'Unknown Student',
				studentIdCode: student?.studentId || 'N/A',
				value: eval_.value,
				category: eval_.category,
				subCategory: eval_.subCategory,
				details: eval_.details,
				timestamp: eval_.timestamp
			});
		}
		return results;
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
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) return [];

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_timestamp', (q) => q)
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
		const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));
		const studentMap = new Map(
			students.filter((s): s is NonNullable<typeof s> => s != null).map((s) => [s._id, s])
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

			if (!studentData.pointsByCategory[eval_.category]) {
				studentData.pointsByCategory[eval_.category] = 0;
			}
			studentData.pointsByCategory[eval_.category] += eval_.value;
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
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.collect();

		// Filter to only show evaluations by the current teacher
		const teacherEvaluations = evaluations.filter((e) => e.teacherId === user._id);

		// Optimization: Batch fetch all teacher data (including current user)
		const teacherIds = [...new Set(teacherEvaluations.map((e) => e.teacherId))];
		const teachers = new Map();
		for (const teacherId of teacherIds) {
			const teacher = await ctx.db.get(teacherId);
			if (teacher) teachers.set(teacherId, teacher);
		}

		// Enrich evaluations with teacher data
		const enriched = teacherEvaluations.map((e) => {
			const teacher = teachers.get(e.teacherId);
			return {
				...e,
				teacherName: teacher?.name || 'Unknown Teacher',
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

		// Optimization: Batch fetch all teacher data to avoid N+1 queries
		const teacherIds = [...new Set(evaluations.map((e) => e.teacherId))];
		const teachers = new Map();
		for (const teacherId of teacherIds) {
			const teacher = await ctx.db.get(teacherId);
			if (teacher) teachers.set(teacherId, teacher);
		}

		// Enrich evaluations with teacher data
		const enriched = evaluations.map((e) => {
			const teacher = teachers.get(e.teacherId);
			const isAdminUser = teacher?.role === 'admin' || teacher?.role === 'super';
			return {
				...e,
				teacherName: teacher?.name || 'Unknown Teacher',
				isAdmin: isAdminUser
			};
		});

		return enriched.sort((a, b) => b.timestamp - a.timestamp);
	}
});
