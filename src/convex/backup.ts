import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation, requireSuperForSensitiveOperation } from './auth';
import { canDownloadBackup, canRenameBackup, canDeleteBackup } from './shared/authorization';
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
	args: {
		name: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await requireAdminForSensitiveOperation(ctx);
		const snapshot = await buildSnapshot(ctx);
		const backupId = await insertBackupRecord(ctx, snapshot, {
			name: args.name,
			creatorId: user._id,
			creatorName: user.name ?? (user.role === 'super' ? 'Super Admin' : 'Admin'),
			creatorRole: user.role,
			source: 'manual',
			e2eTag: args.e2eTag
		});

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
		await insertBackupRecord(ctx, snapshot, { source: 'system_safety' });

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
		const user = await requireAdminForSensitiveOperation(ctx);
		const backups = await ctx.db.query('backups').collect();
		return backups
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((backup) => {
				const canDownload = canDownloadBackup(user, backup);
				return {
					...backup,
					data: canDownload ? backup.data : undefined
				};
			});
	}
});

export const getBackupChunk = query({
	args: {
		backupId: v.id('backups'),
		chunkIndex: v.number()
	},
	handler: async (ctx, args) => {
		const user = await requireAdminForSensitiveOperation(ctx);
		const backup = await ctx.db.get(args.backupId);
		if (!backup) throw new Error('Backup not found');

		if (!canDownloadBackup(user, backup)) {
			throw new Error('Forbidden');
		}

		return await ctx.db
			.query('backup_chunks')
			.withIndex('by_backupId_chunkIndex', (q) =>
				q.eq('backupId', args.backupId).eq('chunkIndex', args.chunkIndex)
			)
			.first();
	}
});

export const renameBackup = mutation({
	args: {
		backupId: v.id('backups'),
		name: v.string()
	},
	handler: async (ctx, args) => {
		const user = await requireAdminForSensitiveOperation(ctx);
		const backup = await ctx.db.get(args.backupId);
		if (!backup) throw new Error('Backup not found');

		if (!canRenameBackup(user, backup)) {
			throw new Error('Forbidden');
		}

		const trimmedName = args.name.trim();
		if (!trimmedName) throw new Error('Backup name cannot be empty');

		await ctx.db.patch(args.backupId, {
			name: trimmedName
		});

		return { message: 'Backup renamed', name: trimmedName };
	}
});

export const deleteBackup = mutation({
	args: {
		backupId: v.id('backups')
	},
	handler: async (ctx, args) => {
		const user = await requireAdminForSensitiveOperation(ctx);
		const backup = await ctx.db.get(args.backupId);
		if (!backup) throw new Error('Backup not found');

		if (!canDeleteBackup(user, backup)) {
			throw new Error('Forbidden');
		}

		const chunks = await ctx.db
			.query('backup_chunks')
			.withIndex('by_backupId', (q) => q.eq('backupId', args.backupId))
			.collect();
		for (const chunk of chunks) await ctx.db.delete(chunk._id);
		await ctx.db.delete(args.backupId);
		return { message: 'Backup deleted' };
	}
});

export const migrateLegacyBackups = mutation({
	args: {},
	handler: async (ctx) => {
		await requireSuperForSensitiveOperation(ctx);
		const backups = await ctx.db.query('backups').collect();
		const superUsers = (await ctx.db.query('users').collect()).filter(
			(u) => u.role === 'super' && u.status === 'active'
		);
		const primarySuper = superUsers[0];

		let migratedCount = 0;
		for (const backup of backups) {
			if (backup.creatorId === undefined && backup.source === undefined) {
				await ctx.db.patch(backup._id, {
					creatorId: primarySuper?._id,
					creatorName: primarySuper?.name ?? 'Super Admin',
					creatorRole: primarySuper?.role ?? 'super',
					source: 'manual',
					name: backup.name ?? backup.filename.replace('.json', '')
				});
				migratedCount++;
			}
		}

		return {
			message: `Migrated ${migratedCount} legacy backup(s)`,
			migratedCount
		};
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
