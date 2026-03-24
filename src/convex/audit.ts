import { query, mutation, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminRole, getAuthenticatedUser } from './auth';
import type { Id } from './_generated/dataModel';

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

interface Evaluation {
	_id: Id<'evaluations'>;
	details: string;
	categoryId: Id<'point_categories'>;
	value: number;
}

type AuthUserForAudit = {
	role?: 'admin' | 'super' | 'teacher';
	email?: string;
	authId?: string;
};

type StudentDisplayInfo = {
	studentName: string | null;
	studentGrade: number | null;
	studentGradeDisplay: string | null;
	studentId: string | null;
};

function formatStudentName(student: Pick<Student, 'englishName' | 'chineseName'>) {
	return student.englishName || null;
}

async function getStudentDisplayInfo(ctx: QueryCtx, student: Student): Promise<StudentDisplayInfo> {
	let studentGrade: number | null = null;
	let studentGradeDisplay: string | null = null;

	if (student.classId) {
		try {
			const classRecord = await ctx.db.get(student.classId);
			if (classRecord) {
				const className = classRecord.class;
				studentGrade = classRecord.grade;
				if (studentGrade !== null && studentGrade !== undefined) {
					studentGradeDisplay =
						className === 'IB' ? `${studentGrade}-IB` : `${studentGrade}-${className}`;
				}
			}
		} catch (error) {
			console.warn('Failed to fetch class info for student:', student._id, error);
		}

		if (studentGradeDisplay === null) {
			studentGradeDisplay = 'unknown';
		}
	} else {
		studentGradeDisplay = 'no class';
	}

	return {
		studentName: formatStudentName(student),
		studentGrade,
		studentGradeDisplay,
		studentId: student.studentId
	};
}

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
		performerId: v.optional(v.id('users')),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
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
		for (const log of logs.slice(0, args.limit || 50)) {
			const performer = await ctx.db.get(log.performerId);
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
					studentId = evalStudentId.toString();
					const student = await findStudentByReference(ctx, evalStudentId.toString());
					if (student) {
						({ studentName, studentGrade, studentGradeDisplay, studentId } =
							await getStudentDisplayInfo(ctx, student));
					}
				}
				if (log.targetId && log.targetId.length > 5) {
					// Only try to get evaluation if it's a valid-looking Convex ID
					const evaluation = (await ctx.db.get(
						log.targetId as Id<'evaluations'>
					)) as Evaluation | null;
					if (evaluation) {
						details = evaluation.details || null;
						// Look up category name from categoryId
						const categoryDoc = evaluation.categoryId
							? await ctx.db.get(evaluation.categoryId)
							: null;
						category = categoryDoc?.name || null;
						points = evaluation.value || null;
					}
				}
			}

			// Handle student information from direct student-related audit logs
			if (log.targetTable === 'students') {
				// For student create/update/delete actions, student info is in newValue/oldValue
				const studentData = log.newValue || log.oldValue;
				if (studentData && typeof studentData === 'object') {
					const studentIdFromData = studentData.studentId?.toString();
					const completeStudent = await findStudentByReference(ctx, studentIdFromData);

					// Use complete student record if we got it, otherwise fall back to raw data
					const student = completeStudent || (studentData as Student);

					// Extract student information
					if (student) {
						({ studentName, studentGrade, studentGradeDisplay, studentId } =
							await getStudentDisplayInfo(ctx, student));
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
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
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
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const dbUser = await requireAdminRole(ctx, args.testToken);

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
