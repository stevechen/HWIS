import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import {
	requireAdminForSensitiveOperation,
	requireDepartmentRestoreAdmin,
	requireSuperForSensitiveOperation
} from './auth';
import { canDownloadBackup, canRenameBackup, canDeleteBackup } from './shared/authorization';
import {
	buildSnapshot,
	createStoredBackup,
	parseBackupSnapshot,
	pruneOldBackups,
	resolveBackupDepartment
} from './shared/backup_snapshot';
import { departmentValidator, normalizeDepartment } from './shared/departments';
import {
	applyEslRestore,
	applyRestore,
	type EslRestorePayload,
	type RestorePayload
} from './shared/restore_plan';
import { runYearEndMigration } from './shared/migration_plan';

export const exportData = query({
	args: {
		department: v.optional(departmentValidator)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		return await buildSnapshot(ctx, args.department ?? 'international');
	}
});

export const exportDataForCron = query({
	args: {
		cronSecret: v.string(),
		department: v.optional(departmentValidator)
	},
	handler: async (ctx, args) => {
		const expectedSecret = process.env.CRON_SECRET;
		if (!expectedSecret || args.cronSecret !== expectedSecret) {
			throw new Error('Unauthorized');
		}
		return await buildSnapshot(ctx, args.department ?? 'international');
	}
});

export const createBackup = mutation({
	args: {
		name: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		department: v.optional(departmentValidator)
	},
	handler: async (ctx, args) => {
		const user = await requireAdminForSensitiveOperation(ctx);
		const { backupId, snapshot } = await createStoredBackup(ctx, {
			name: args.name,
			creatorId: user._id,
			creatorName: user.name ?? (user.role === 'super' ? 'Super Admin' : 'Admin'),
			creatorRole: user.role,
			source: 'manual',
			e2eTag: args.e2eTag,
			department: args.department ?? 'international'
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
		const backup = await ctx.db.get(args.backupId);
		if (!backup) throw new Error('Backup not found');

		// Legacy rows carry no `department`; they are International backups.
		const department = resolveBackupDepartment(backup);
		await requireDepartmentRestoreAdmin(ctx, department);

		const chunks = await ctx.db
			.query('backup_chunks')
			.withIndex('by_backupId_chunkIndex', (q) => q.eq('backupId', args.backupId))
			.collect();
		const raw =
			backup.data ?? parseBackupSnapshot(chunks.sort((a, b) => a.chunkIndex - b.chunkIndex));

		if (department === 'esl') {
			const data = raw as EslRestorePayload;
			const { skippedReferences } = await applyEslRestore(ctx, data);
			return {
				message: `Restored ESL data: ${data.eslCohorts.length} cohorts, ${data.eslClasses.length} classes, ${data.eslStudents.length} students, ${data.teacherNotes.length - skippedReferences.length} notes (${skippedReferences.length} skipped)`,
				skippedReferences: skippedReferences.length > 0 ? skippedReferences : undefined
			};
		}

		const data = raw as RestorePayload;
		const { skippedEvaluations } = await applyRestore(ctx, data);

		return {
			message: `Restored data: ${data.students.length} students, ${data.evaluations.length - skippedEvaluations.length} evaluations (${skippedEvaluations.length} skipped), ${data.users.length} users, ${data.categories.length} categories, ${data.classes.length} classes`,
			skippedEvaluations: skippedEvaluations.length > 0 ? skippedEvaluations : undefined
		};
	}
});

export const createDailyBackup = internalMutation({
	args: {
		department: v.optional(departmentValidator)
	},
	handler: async (ctx, args) =>
		createStoredBackup(ctx, {
			source: 'system_cron',
			department: args.department ?? 'international'
		})
});

export const restoreFromBackupPayload = mutation({
	args: {
		backupData: v.any(),
		department: v.optional(departmentValidator),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Default to the payload's own department when the caller omits it, so a
		// legacy International payload restores as International and an ESL
		// snapshot cannot be applied through the International path by accident.
		const department = normalizeDepartment(
			args.department ??
				(args.backupData as { department?: 'international' | 'esl' } | null)?.department
		);
		await requireDepartmentRestoreAdmin(ctx, department);
		await createStoredBackup(ctx, {
			source: 'system_safety',
			e2eTag: args.e2eTag,
			department
		});

		if (department === 'esl') {
			const data = args.backupData as EslRestorePayload;
			const { skippedReferences } = await applyEslRestore(ctx, data);
			return {
				message: `Restored ESL data: ${data.eslCohorts.length} cohorts, ${data.eslClasses.length} classes, ${data.eslStudents.length} students, ${data.teacherNotes.length - skippedReferences.length} notes (${skippedReferences.length} skipped)`,
				skippedReferences: skippedReferences.length > 0 ? skippedReferences : undefined
			};
		}

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
					// Legacy rows predate the column; they are International backups.
					department: resolveBackupDepartment(backup),
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

export const pruneExpiredBackups = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		return await pruneOldBackups(ctx);
	}
});

export const runPruneExpiredBackups = internalMutation({
	args: {},
	handler: async (ctx) => pruneOldBackups(ctx)
});
