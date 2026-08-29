import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';
import { buildSnapshot, insertBackupRecord, parseBackupSnapshot } from './shared/backup_snapshot';
import { applyRestore, type RestorePayload } from './shared/restore_plan';
import { runYearEndMigration } from './shared/migration_plan';

export const exportData = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		return await buildSnapshot(ctx);
	}
});

export const exportDataForCron = query({
	args: { cronSecret: v.string() },
	handler: async (ctx, args) => {
		const expectedSecret = process.env.CRON_SECRET;
		if (!expectedSecret || args.cronSecret !== expectedSecret) {
			throw new Error('Unauthorized');
		}
		return await buildSnapshot(ctx);
	}
});

export const createBackup = mutation({
	args: { e2eTag: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const snapshot = await buildSnapshot(ctx);
		const backupId = await insertBackupRecord(ctx, snapshot, args.e2eTag);

		return {
			backupId,
			message: `Created backup with ${snapshot.students.length} students, ${snapshot.evaluations.length} evaluations, ${snapshot.classes.length} classes`
		};
	}
});

export const restoreFromBackup = mutation({
	args: {
		backupId: v.id('backups')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const backup = await ctx.db.get(args.backupId);
		if (!backup) throw new Error('Backup not found');

		const chunks = await ctx.db
			.query('backup_chunks')
			.withIndex('by_backupId_chunkIndex', (q) => q.eq('backupId', args.backupId))
			.collect();
		const data = (backup.data ??
			parseBackupSnapshot(chunks.sort((a, b) => a.chunkIndex - b.chunkIndex))) as RestorePayload;
		const { skippedEvaluations } = await applyRestore(ctx, data);

		return {
			message: `Restored data: ${data.students.length} students, ${data.evaluations.length - skippedEvaluations.length} evaluations (${skippedEvaluations.length} skipped), ${data.users.length} users, ${data.categories.length} categories, ${data.classes.length} classes`,
			skippedEvaluations: skippedEvaluations.length > 0 ? skippedEvaluations : undefined
		};
	}
});

export const restoreFromBackupPayload = mutation({
	args: {
		backupData: v.any()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const snapshot = await buildSnapshot(ctx);
		await insertBackupRecord(ctx, snapshot);

		const data = args.backupData as RestorePayload;
		const { skippedEvaluations } = await applyRestore(ctx, data);

		return {
			message: `Restored data: ${data.students.length} students, ${data.evaluations.length - skippedEvaluations.length} evaluations (${skippedEvaluations.length} skipped), ${data.users.length} users, ${data.categories.length} categories, ${data.classes.length} classes`,
			skippedEvaluations: skippedEvaluations.length > 0 ? skippedEvaluations : undefined
		};
	}
});

export const clearAllData = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const students = await ctx.db.query('students').collect();
		const evaluations = await ctx.db.query('evaluations').collect();
		const categories = await ctx.db.query('point_categories').collect();
		const classes = await ctx.db.query('classes').collect();
		const houseEvents = await ctx.db.query('house_events').collect();
		const backups = await ctx.db.query('backups').collect();

		for (const student of students) await ctx.db.delete(student._id);
		for (const evaluation of evaluations) await ctx.db.delete(evaluation._id);
		for (const category of categories) await ctx.db.delete(category._id);
		for (const cls of classes) await ctx.db.delete(cls._id);
		for (const event of houseEvents) await ctx.db.delete(event._id);
		for (const backup of backups) {
			const chunks = await ctx.db
				.query('backup_chunks')
				.withIndex('by_backupId', (q) => q.eq('backupId', backup._id))
				.collect();
			for (const chunk of chunks) await ctx.db.delete(chunk._id);
			await ctx.db.delete(backup._id);
		}

		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			if (
				log.targetTable === 'students' ||
				log.targetTable === 'evaluations' ||
				log.targetTable === 'classes' ||
				log.targetTable === 'house_events'
			) {
				await ctx.db.delete(log._id);
			}
		}

		return { message: `Cleared data` };
	}
});

export const listBackups = query({
	args: {
		_trigger: v.optional(v.number())
	},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const backups = await ctx.db.query('backups').collect();
		return backups.sort((a, b) => b.createdAt - a.createdAt);
	}
});

export const getBackupChunk = query({
	args: {
		backupId: v.id('backups'),
		chunkIndex: v.number()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		return await ctx.db
			.query('backup_chunks')
			.withIndex('by_backupId_chunkIndex', (q) =>
				q.eq('backupId', args.backupId).eq('chunkIndex', args.chunkIndex)
			)
			.first();
	}
});

export const deleteBackup = mutation({
	args: {
		backupId: v.id('backups')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const chunks = await ctx.db
			.query('backup_chunks')
			.withIndex('by_backupId', (q) => q.eq('backupId', args.backupId))
			.collect();
		for (const chunk of chunks) await ctx.db.delete(chunk._id);
		await ctx.db.delete(args.backupId);
		return { message: 'Backup deleted' };
	}
});

export const clearEvaluations = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
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
	args: { e2eTag: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const result = await runYearEndMigration(ctx, { e2eTag: args.e2eTag });

		return {
			message: `Advanced grades for ${result.gradesAdvanced} students, deleted ${result.grade12Deleted} grade 12 students, deleted ${result.notEnrolledDeleted} not enrolled students, cleared ${result.evaluationsCleared} evaluations and ${result.auditLogsCleared} audit logs, deleted ${result.eventsDeleted} events, deleted ${result.emptyClassesDeleted} empty classes`
		};
	}
});
