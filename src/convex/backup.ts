import { query, mutation } from './_generated/server';
import { v, type GenericId } from 'convex/values';
import { requireAuthenticatedUser, requireAdminRole } from './auth';

export const exportData = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
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

export const restoreFromBackup = mutation({
	args: { 
		backupId: v.id('backups'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const backup = (await ctx.db.get(args.backupId)) as BackupRecord | null;
		if (!backup) throw new Error('Backup not found');

		const data = backup.data as any;
		for (const student of data.students) {
			await ctx.db.insert('students', {
				englishName: student.englishName,
				chineseName: student.chineseName,
				studentId: student.studentId,
				grade: student.grade,
				status: student.status,
				note: student.note ?? ''
			});
		}
		for (const evaluation of data.evaluations) {
			await ctx.db.insert('evaluations', {
				studentId: evaluation.studentId,
				teacherId: evaluation.teacherId,
				value: evaluation.value,
				category: evaluation.category,
				subCategory: evaluation.subCategory,
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
				subCategories: category.subCategories
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

		for (const student of students) await ctx.db.delete(student._id);
		for (const evaluation of evaluations) await ctx.db.delete(evaluation._id);
		for (const category of categories) await ctx.db.delete(category._id);

		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			if (log.targetTable === 'students' || log.targetTable === 'evaluations') {
				await ctx.db.delete(log._id);
			}
		}

		return { message: `Cleared data` };
	}
});

export const listBackups = query({
	args: { _trigger: v.optional(v.number()) },
	handler: async (ctx) => {
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

		const grade12Students = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('grade'), 12))
			.collect();
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
			if (student.grade >= 7 && student.grade <= 11) {
				await ctx.db.patch(student._id, { grade: student.grade + 1 });
				gradesAdvanced++;
			}
		}

		return {
			message: `Advanced grades for ${gradesAdvanced} students, deleted ${grade12Students.length} grade 12 students, deleted ${notEnrolledStudents.length} not enrolled students, cleared ${allEvaluations.length} evaluations and ${auditLogsCleared} audit logs`
		};
	}
});
