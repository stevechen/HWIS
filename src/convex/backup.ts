import { query, mutation, type QueryCtx } from './_generated/server';
import { v, type GenericId } from 'convex/values';
import { requireAdminRole } from './auth';
import type { Doc, Id } from './_generated/dataModel';

async function collectBackupData(ctx: QueryCtx) {
	const students = await ctx.db.query('students').collect();
	const evaluations = await ctx.db.query('evaluations').collect();
	const users = await ctx.db.query('users').collect();
	const categories = await ctx.db.query('point_categories').collect();

	return {
		exportedAt: new Date().toISOString(),
		students,
		evaluations,
		users,
		categories
	};
}

export const exportData = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		return await collectBackupData(ctx);
	}
});

export const exportDataForCron = query({
	args: { cronSecret: v.string() },
	handler: async (ctx, args) => {
		const expectedSecret = process.env.CRON_SECRET;
		if (!expectedSecret || args.cronSecret !== expectedSecret) {
			throw new Error('Unauthorized');
		}
		return await collectBackupData(ctx);
	}
});

export const createBackup = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const students = await ctx.db.query('students').collect();
		const evaluations = await ctx.db.query('evaluations').collect();
		const users = await ctx.db.query('users').collect();
		const categories = await ctx.db.query('point_categories').collect();

		const backup = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			students,
			evaluations,
			users,
			categories
		};

		const backupId = await ctx.db.insert('backups', {
			filename: `backup-${Date.now()}.json`,
			data: backup as object,
			createdAt: Date.now()
		});

		return {
			backupId,
			message: `Created backup with ${students.length} students, ${evaluations.length} evaluations`
		};
	}
});

interface BackupRecord {
	_id: GenericId<'backups'>;
	_creationTime: number;
	filename: string;
	data: object;
	createdAt: number;
}

type BackupPayload = {
	students: Array<
		Pick<
			Doc<'students'>,
			'_id' | 'englishName' | 'chineseName' | 'studentId' | 'classId' | 'status' | 'note'
		>
	>;
	evaluations: Array<
		Pick<
			Doc<'evaluations'>,
			'studentId' | 'teacherId' | 'value' | 'categoryId' | 'details' | 'timestamp' | 'semesterId'
		>
	>;
	users: Array<Pick<Doc<'users'>, 'authId' | 'name' | 'role' | 'status'>>;
	categories: Array<
		Pick<Doc<'point_categories'>, 'name' | 'meritCriteria' | 'demeritCriteria' | 'casAlignment'>
	>;
};

export const restoreFromBackup = mutation({
	args: {
		backupId: v.id('backups'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const backup = (await ctx.db.get(args.backupId)) as BackupRecord | null;
		if (!backup) throw new Error('Backup not found');

		const data = backup.data as BackupPayload;
		for (const student of data.students) {
			await ctx.db.insert('students', {
				englishName: student.englishName,
				chineseName: student.chineseName,
				studentId: student.studentId,
				classId: student.classId,
				status: student.status,
				note: student.note ?? ''
			});
		}
		for (const evaluation of data.evaluations) {
			await ctx.db.insert('evaluations', {
				studentId: evaluation.studentId as Id<'students'>,
				teacherId: evaluation.teacherId as Id<'users'>,
				value: evaluation.value,
				categoryId: evaluation.categoryId as Id<'point_categories'>,
				details: evaluation.details,
				timestamp: evaluation.timestamp,
				semesterId: evaluation.semesterId
			});
		}
		for (const user of data.users) {
			await ctx.db.insert('users', {
				authId: user.authId ?? undefined,
				name: user.name ?? undefined,
				role: user.role ?? 'teacher',
				status: user.status ?? 'active'
			});
		}
		for (const category of data.categories) {
			await ctx.db.insert('point_categories', {
				name: category.name,
				meritCriteria: category.meritCriteria,
				demeritCriteria: category.demeritCriteria,
				casAlignment: category.casAlignment
			});
		}
		return { message: `Restored data` };
	}
});

export const clearAllData = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const students = await ctx.db.query('students').collect();
		const evaluations = await ctx.db.query('evaluations').collect();
		const categories = await ctx.db.query('point_categories').collect();
		const classes = await ctx.db.query('classes').collect();

		for (const student of students) await ctx.db.delete(student._id);
		for (const evaluation of evaluations) await ctx.db.delete(evaluation._id);
		for (const category of categories) await ctx.db.delete(category._id);
		for (const cls of classes) await ctx.db.delete(cls._id);

		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			if (
				log.targetTable === 'students' ||
				log.targetTable === 'evaluations' ||
				log.targetTable === 'classes'
			) {
				await ctx.db.delete(log._id);
			}
		}

		return { message: `Cleared data` };
	}
});

export const listBackups = query({
	args: {
		_trigger: v.optional(v.number()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const backups = await ctx.db.query('backups').collect();
		return backups.sort((a, b) => b.createdAt - a.createdAt);
	}
});

export const deleteBackup = mutation({
	args: {
		backupId: v.id('backups'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		await ctx.db.delete(args.backupId);
		return { message: 'Backup deleted' };
	}
});

export const clearEvaluations = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const evaluations = await ctx.db.query('evaluations').collect();
		for (const evaluation of evaluations) {
			await ctx.db.delete(evaluation._id);
		}

		const auditLogs = await ctx.db.query('audit_logs').collect();
		let auditLogsCleared = 0;
		for (const log of auditLogs) {
			if (log.targetTable === 'evaluations') {
				await ctx.db.delete(log._id);
				auditLogsCleared++;
			}
		}

		return {
			message: `Cleared ${evaluations.length} evaluations and ${auditLogsCleared} audit logs`
		};
	}
});

export const advanceGradesAndClearEvaluations = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const students = await ctx.db.query('students').collect();
		const evaluations = await ctx.db.query('evaluations').collect();
		const users = await ctx.db.query('users').collect();
		const categories = await ctx.db.query('point_categories').collect();

		const backup = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			students,
			evaluations,
			users,
			categories
		};

		await ctx.db.insert('backups', {
			filename: `backup-${Date.now()}.json`,
			data: backup as object,
			createdAt: Date.now()
		});

		const allEvaluations = await ctx.db.query('evaluations').collect();
		for (const evaluation of allEvaluations) {
			await ctx.db.delete(evaluation._id);
		}

		const auditLogs = await ctx.db.query('audit_logs').collect();
		let auditLogsCleared = 0;
		for (const log of auditLogs) {
			if (log.targetTable === 'evaluations') {
				await ctx.db.delete(log._id);
				auditLogsCleared++;
			}
		}

		// Get classes to determine grade 12 students
		const allClasses = await ctx.db.query('classes').collect();
		const classMap = new Map(allClasses.map((c) => [c._id, c]));

		const allStudents = await ctx.db.query('students').collect();
		const grade12Students = allStudents.filter((s) => {
			if (s.classId) {
				const cls = classMap.get(s.classId);
				return cls && cls.grade === 12;
			}
			return false;
		});
		for (const student of grade12Students) {
			await ctx.db.delete(student._id);
		}

		const notEnrolledStudents = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Not Enrolled'))
			.collect();
		for (const student of notEnrolledStudents) {
			await ctx.db.delete(student._id);
		}

		const enrolledStudents = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Enrolled'))
			.collect();

		let gradesAdvanced = 0;
		for (const student of enrolledStudents) {
			if (student.classId) {
				const cls = classMap.get(student.classId);
				if (cls && cls.grade >= 7 && cls.grade <= 11) {
					// Find next grade's class
					const nextGradeClasses = allClasses.filter((c) => c.grade === cls.grade + 1);
					if (nextGradeClasses.length > 0) {
						await ctx.db.patch(student._id, { classId: nextGradeClasses[0]._id });
						gradesAdvanced++;
					}
				}
			}
		}

		return {
			message: `Advanced grades for ${gradesAdvanced} students, deleted ${grade12Students.length} grade 12 students, deleted ${notEnrolledStudents.length} not enrolled students, cleared ${allEvaluations.length} evaluations and ${auditLogsCleared} audit logs`
		};
	}
});
