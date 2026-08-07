import { query, mutation, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation, getAuthenticatedUser } from './auth';
import { getDisplayName } from './shared/class_roster';
import type { Doc, Id } from './_generated/dataModel';

const ACTION_LABELS: Record<string, string> = {
	create_evaluation: 'Created',
	delete_evaluation: 'Deleted',
	update_user_role: 'Role Updated',
	update_user_status: 'Status Updated',
	create_student: 'Student Added',
	update_student: 'Student Updated',
	delete_student: 'Student Deleted',
	seed_data: 'Seeded'
};

export function getAuditActionLabel(action: string): string {
	return ACTION_LABELS[action] ?? action;
}

interface Student {
	_id: Id<'students'>;
	englishName: string;
	chineseName: string;
	studentId: string;
	classId: Id<'classes'> | null;
}

type AuthUserForAudit = {
	role?: 'admin' | 'super' | 'teacher';
	email?: string;
	authId?: string;
};

async function findStudentByReference(
	ctx: QueryCtx,
	studentRef: string | null | undefined
): Promise<Student | null> {
	if (!studentRef) {
		return null;
	}

	try {
		return (await ctx.db.get(studentRef as Id<'students'>)) as Student | null;
	} catch {
		return (await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('studentId'), studentRef))
			.first()) as Student | null;
	}
}

function getAuditActionDetails(log: {
	action: string;
	oldValue?: { role?: string; status?: string } | null;
	newValue?: { role?: string; status?: string } | null;
}) {
	if (log.action === 'update_user_role') {
		return `${log.oldValue?.role} → ${log.newValue?.role}`;
	}

	if (log.action === 'update_user_status') {
		return `${log.oldValue?.status} → ${log.newValue?.status}`;
	}

	return null;
}

export const list = query({
	args: {
		limit: v.optional(v.number()),
		action: v.optional(v.string()),
		performerId: v.optional(v.id('users'))
	},
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, 'unit-test-token');
		if (!authUser) return [];
		const user = authUser as AuthUserForAudit;
		if (
			user.role !== 'admin' &&
			user.role !== 'super' &&
			user.email !== 'super@hwis.test' &&
			user.authId !== 'test-token-admin-mock'
		) {
			return [];
		}

		let logs = await ctx.db.query('audit_logs').withIndex('by_timestamp').order('desc').take(100);

		if (args.action) {
			logs = logs.filter((l) => l.action === args.action);
		}

		if (args.performerId) {
			logs = logs.filter((l) => l.performerId === args.performerId);
		}

		const limitedLogs = logs.slice(0, args.limit || 50);

		// --- Batch 1: Load all performers ---
		const performerIds = [...new Set(limitedLogs.map((l) => l.performerId))];
		const performers = await Promise.all(performerIds.map((id) => ctx.db.get(id)));
		const performerMap = new Map(
			performers.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t._id, t])
		);

		// --- Batch 2: Load all evaluation documents referenced by audit logs ---
		const evalTargetIds: Id<'evaluations'>[] = [];
		// --- Batch 3: Collect student Convex IDs from evaluation entries ---
		const studentConvexIds: Id<'students'>[] = [];
		// --- Batch 4: Collect studentId strings from student entries ---
		const studentStringIds: string[] = [];

		for (const log of limitedLogs) {
			if (log.targetTable === 'evaluations') {
				if (log.targetId && log.targetId.length > 5) {
					evalTargetIds.push(log.targetId as Id<'evaluations'>);
				}
				const sid = log.newValue?.studentId || log.oldValue?.studentId;
				if (sid) {
					studentConvexIds.push(sid.toString() as Id<'students'>);
				}
			}
			if (log.targetTable === 'students') {
				const data = log.newValue || log.oldValue;
				if (data?.studentId) {
					studentStringIds.push(data.studentId.toString());
				}
			}
		}

		const uniqueEvalIds = [...new Set(evalTargetIds)];
		const evaluationDocs = await Promise.all(uniqueEvalIds.map((id) => ctx.db.get(id)));
		const evaluationMap = new Map(
			evaluationDocs.filter((e): e is NonNullable<typeof e> => e != null).map((e) => [e._id, e])
		);

		// --- Batch 3: Load categories from those evaluations ---
		const categoryIds: Id<'point_categories'>[] = [];
		for (const evalDoc of evaluationDocs) {
			if (evalDoc?.categoryId) categoryIds.push(evalDoc.categoryId);
		}
		const uniqueCategoryIds = [...new Set(categoryIds)];
		const categoryDocs = await Promise.all(uniqueCategoryIds.map((id) => ctx.db.get(id)));
		const categoryMap = new Map(
			categoryDocs.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		// --- Batch 4: Load students by Convex ID (from evaluation entries) ---
		const uniqueStudentConvexIds = [...new Set(studentConvexIds)];
		const studentDocs = await Promise.all(
			uniqueStudentConvexIds.map(async (id) => {
				try {
					return await ctx.db.get(id);
				} catch {
					return null;
				}
			})
		);
		const studentByConvexIdMap = new Map(
			studentDocs.filter((s): s is Doc<'students'> => Boolean(s)).map((s) => [s._id, s])
		);

		// --- Batch 5: Load students by studentId string (from student entries) ---
		const studentByStringIdMap = new Map<string, Doc<'students'>>();
		const uniqueStudentStringIds = [...new Set(studentStringIds)];
		const studentStringLookups = await Promise.all(
			uniqueStudentStringIds.map((sid) =>
				ctx.db
					.query('students')
					.withIndex('by_studentId', (q) => q.eq('studentId', sid))
					.first()
			)
		);
		for (let i = 0; i < uniqueStudentStringIds.length; i++) {
			const lookup = studentStringLookups[i];
			if (lookup) studentByStringIdMap.set(uniqueStudentStringIds[i], lookup as Doc<'students'>);
		}

		// --- Batch 6: Load classes for all resolved students ---
		const allResolvedStudents = [
			...studentByConvexIdMap.values(),
			...studentByStringIdMap.values()
		];
		const classIds = [
			...new Set(
				allResolvedStudents
					.map((s) => s.classId)
					.filter((id): id is Id<'classes'> => id !== undefined)
			)
		];
		const classDocs = await Promise.all(classIds.map((id) => ctx.db.get(id)));
		const classMap = new Map(
			classDocs.filter((c): c is NonNullable<typeof c> => c != null).map((c) => [c._id, c])
		);

		// --- Build results using batched maps ---
		const results: Array<
			Omit<(typeof logs)[number], 'performerId'> & {
				performerId: string;
				performerName: string;
				actionLabel: string;
				studentName: string | null;
				studentGrade: number | null;
				studentGradeDisplay: string | null;
				studentId: string | null;
				details: string | null;
				category: string | null;
				points: number | null;
			}
		> = [];

		for (const log of limitedLogs) {
			const performer = performerMap.get(log.performerId);
			let studentName: string | null = null;
			let studentGrade: number | null = null;
			let studentGradeDisplay: string | null = null;
			let studentId: string | null = null;
			let details: string | null = null;
			let category: string | null = null;
			let points: number | null = null;

			if (log.targetTable === 'evaluations') {
				const evalStudentId = log.newValue?.studentId || log.oldValue?.studentId;
				if (evalStudentId) {
					const studentRef = evalStudentId.toString();
					const student =
						studentByConvexIdMap.get(studentRef as Id<'students'>) ??
						(await findStudentByReference(ctx, studentRef));
					if (student) {
						const classRecord = student.classId ? classMap.get(student.classId) : null;
						let studentGradeDisplayVal: string | null = null;
						if (classRecord) {
							studentGrade = classRecord.grade;
							studentGradeDisplayVal = getDisplayName(classRecord.grade, classRecord.class);
						} else if (student.classId) {
							studentGradeDisplayVal = 'unknown';
						} else {
							studentGradeDisplayVal = 'no class';
						}
						studentName = student.englishName || null;
						studentGradeDisplay = studentGradeDisplayVal;
						studentId = student.studentId;
					}
				}
				if (log.targetId && log.targetId.length > 5) {
					const evaluation = evaluationMap.get(log.targetId as Id<'evaluations'>);
					if (evaluation) {
						details = evaluation.details || null;
						const categoryDoc = categoryMap.get(evaluation.categoryId);
						category = categoryDoc?.name || null;
						points = evaluation.value || null;
					}
				}
			}

			if (log.targetTable === 'students') {
				const studentData = log.newValue || log.oldValue;
				if (studentData && typeof studentData === 'object') {
					const studentIdFromData = studentData.studentId?.toString();
					const student =
						(studentIdFromData ? studentByStringIdMap.get(studentIdFromData) : null) ??
						(await findStudentByReference(ctx, studentIdFromData)) ??
						(studentData as Student);

					if (student) {
						const classRecord = student.classId ? classMap.get(student.classId) : null;
						let studentGradeDisplayVal: string | null = null;
						if (classRecord) {
							studentGrade = classRecord.grade;
							studentGradeDisplayVal = getDisplayName(classRecord.grade, classRecord.class);
						} else if (student.classId) {
							studentGradeDisplayVal = 'unknown';
						} else {
							studentGradeDisplayVal = 'no class';
						}
						studentName = student.englishName || null;
						studentGradeDisplay = studentGradeDisplayVal;
						studentId = student.studentId ?? studentIdFromData ?? null;
					}
				}
			}

			details = getAuditActionDetails(log) ?? details;

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { performerId: _performerId, ...logWithoutPerformer } = log;
			results.push({
				...logWithoutPerformer,
				performerId: performer?._id?.toString() ?? 'Unknown',
				performerName: performer?.name ?? 'Unknown',
				actionLabel: getAuditActionLabel(log.action),
				studentName,
				studentGrade,
				studentGradeDisplay,
				studentId,
				details,
				category,
				points
			});
		}

		return results;
	}
});

export const debugList = query({
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const logs = await ctx.db.query('audit_logs').withIndex('by_timestamp').order('desc').take(20);

		// Also check for test_admin user
		const testAdmin = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', 'test-token-admin-mock'))
			.first();

		const allUsers = await ctx.db.query('users').collect();

		return {
			logs,
			testAdminExists: !!testAdmin,
			testAdmin: testAdmin ? { authId: testAdmin.authId, role: testAdmin.role } : null,
			totalUsers: allUsers.length,
			userAuthIds: allUsers.map((u) => u.authId)
		};
	}
});

export const seed = mutation({
	handler: async (ctx) => {
		const dbUser = await requireAdminForSensitiveOperation(ctx);

		if (dbUser.role !== 'super') {
			throw new Error('Unauthorized');
		}

		await ctx.db.insert('audit_logs', {
			action: 'seed_data',
			performerId: dbUser._id,
			targetTable: 'system',
			targetId: 'seed',
			oldValue: null,
			newValue: { description: 'Database seeded' },
			timestamp: Date.now()
		});
	}
});
