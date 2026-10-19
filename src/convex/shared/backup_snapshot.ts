// Backup snapshot decisions.
//
// The single home for the backup payload shape and how a department snapshot is
// collected. Both the create-backup mutation and the year-end migration
// mutation produce a snapshot through this module so the format and the set of
// captured tables stay consistent (ADR-0002). `backup.ts` remains the
// authoritative enforcer of who may create a backup; this module only decides
// what a snapshot contains.
//
// Snapshots are department-scoped. Each department gets an explicit allowlist:
// `teacher_notes` is an ESL table without an `esl_` prefix, so classifying by
// table-name prefix would silently drop every teacher note from the archive.

import type { Doc, Id } from '../_generated/dataModel';
import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server';
import type { DataModel } from '../_generated/dataModel';
import { resolveDepartmentRoles, type Department, type Role } from './authorization';
import { normalizeDepartment } from './departments';

const BACKUP_CHUNK_SIZE = 200_000;

export const SNAPSHOT_VERSION = '1.0';

/**
 * Retention thresholds for backup pruning.
 * Hot daily snapshots (system_cron) kept ~1 month.
 * system_safety snapshots kept ~3 months.
 * system_migration snapshots never pruned (IB/WASC 5-year obligation).
 * Manual backups never pruned (user-created).
 */
export const RETENTION_DAYS = {
	system_cron: 30,
	system_safety: 90,
	system_migration: Infinity,
	manual: Infinity
} as const;

/** Tables captured for the International (HWIS) department. */
export const INTERNATIONAL_SNAPSHOT_TABLES = [
	'classes',
	'students',
	'point_categories',
	'evaluations',
	'house_events',
	'leaderboard_thumbnails',
	'leaderboard_snapshots'
] as const;

/**
 * Tables captured for the ESL department.
 *
 * `teacher_notes` is deliberately listed: it has no `esl_` prefix, and a prefix
 * rule would treat it as an International table and lose every note.
 */
export const ESL_SNAPSHOT_TABLES = [
	'esl_cohorts',
	'esl_classes',
	'esl_class_meetings',
	'esl_teacher_availability',
	'esl_semesters',
	'esl_events',
	'esl_students',
	'teacher_notes'
] as const;

/**
 * The serialized backup payload.
 *
 * Every array is present in every snapshot so the shape stays uniform across
 * departments and destinations. Tables that belong to the other department are
 * empty rather than absent. `department` is optional only because snapshots
 * written before the HWIS/ESL split do not carry it; those read as
 * `international` through `resolveBackupDepartment`.
 */
export type BackupSnapshot = {
	exportedAt: string;
	version: string;
	department?: Department;
	students: Doc<'students'>[];
	evaluations: Doc<'evaluations'>[];
	users: Doc<'users'>[];
	categories: Doc<'point_categories'>[];
	classes: Doc<'classes'>[];
	houseEvents: Doc<'house_events'>[];
	leaderboardThumbnails: Doc<'leaderboard_thumbnails'>[];
	leaderboardSnapshots: Doc<'leaderboard_snapshots'>[];
	eslCohorts: Doc<'esl_cohorts'>[];
	eslClasses: Doc<'esl_classes'>[];
	eslClassMeetings: Doc<'esl_class_meetings'>[];
	eslTeacherAvailability: Doc<'esl_teacher_availability'>[];
	eslSemesters: Doc<'esl_semesters'>[];
	eslEvents: Doc<'esl_events'>[];
	eslStudents: Doc<'esl_students'>[];
	teacherNotes: Doc<'teacher_notes'>[];
};

function filterUsersByDepartment(users: Doc<'users'>[], department: Department): Doc<'users'>[] {
	return users.filter((user) => resolveDepartmentRoles(user)[department] !== undefined);
}

// Collects a department snapshot. Reads each table in parallel so a backup
// reflects a single point in time.
export async function buildSnapshot(
	ctx: { db: GenericDatabaseReader<DataModel> },
	department: Department
): Promise<BackupSnapshot> {
	const exportedAt = new Date().toISOString();

	if (department === 'esl') {
		const [
			users,
			eslCohorts,
			eslClasses,
			eslClassMeetings,
			eslTeacherAvailability,
			eslSemesters,
			eslEvents,
			eslStudents,
			teacherNotes
		] = await Promise.all([
			ctx.db.query('users').collect(),
			ctx.db.query('esl_cohorts').collect(),
			ctx.db.query('esl_classes').collect(),
			ctx.db.query('esl_class_meetings').collect(),
			ctx.db.query('esl_teacher_availability').collect(),
			ctx.db.query('esl_semesters').collect(),
			ctx.db.query('esl_events').collect(),
			ctx.db.query('esl_students').collect(),
			ctx.db.query('teacher_notes').collect()
		]);

		return {
			exportedAt,
			version: SNAPSHOT_VERSION,
			department,
			students: [],
			evaluations: [],
			users: filterUsersByDepartment(users, department),
			categories: [],
			classes: [],
			houseEvents: [],
			leaderboardThumbnails: [],
			leaderboardSnapshots: [],
			eslCohorts,
			eslClasses,
			eslClassMeetings,
			eslTeacherAvailability,
			eslSemesters,
			eslEvents,
			eslStudents,
			teacherNotes
		};
	}

	const [
		students,
		evaluations,
		users,
		categories,
		classes,
		houseEvents,
		leaderboardThumbnails,
		leaderboardSnapshots
	] = await Promise.all([
		ctx.db.query('students').collect(),
		ctx.db.query('evaluations').collect(),
		ctx.db.query('users').collect(),
		ctx.db.query('point_categories').collect(),
		ctx.db.query('classes').collect(),
		ctx.db.query('house_events').collect(),
		ctx.db.query('leaderboard_thumbnails').collect(),
		ctx.db.query('leaderboard_snapshots').collect()
	]);

	return {
		exportedAt,
		version: SNAPSHOT_VERSION,
		department,
		students,
		evaluations,
		users: filterUsersByDepartment(users, department),
		categories,
		classes,
		houseEvents,
		leaderboardThumbnails,
		leaderboardSnapshots,
		eslCohorts: [],
		eslClasses: [],
		eslClassMeetings: [],
		eslTeacherAvailability: [],
		eslSemesters: [],
		eslEvents: [],
		eslStudents: [],
		teacherNotes: []
	};
}

export type BackupSource = 'manual' | 'system_migration' | 'system_safety' | 'system_cron';

export type InsertBackupOptions = {
	name?: string;
	creatorId?: Id<'users'>;
	creatorName?: string;
	creatorRole?: Role;
	source?: BackupSource;
	e2eTag?: string;
	department?: Department;
};

/** The department a stored backup belongs to, defaulting legacy rows to HWIS. */
export function resolveBackupDepartment(backup: { department?: Department }): Department {
	return normalizeDepartment(backup.department);
}

export function getDefaultBackupName(source: BackupSource | undefined, createdAt: number): string {
	const timestamp = new Date(createdAt).toISOString().replace('T', ' ').slice(0, 19);
	switch (source) {
		case 'system_migration':
			return `Year-End Migration Snapshot - ${timestamp}`;
		case 'system_safety':
			return `Pre-Restore Safety Snapshot - ${timestamp}`;
		case 'system_cron':
			return `Scheduled Auto Backup - ${timestamp}`;
		case 'manual':
		default:
			return `Manual Backup - ${timestamp}`;
	}
}

export async function createStoredBackup(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	options: InsertBackupOptions = {}
): Promise<{ backupId: Id<'backups'>; snapshot: BackupSnapshot }> {
	const department = normalizeDepartment(options.department);
	const snapshot = await buildSnapshot(ctx, department);
	const backupId = await insertBackupRecord(ctx, snapshot, { ...options, department });
	return { backupId, snapshot };
}

export async function insertBackupRecord(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	snapshot: BackupSnapshot,
	optionsOrTag?: InsertBackupOptions | string
): Promise<Id<'backups'>> {
	const options: InsertBackupOptions =
		typeof optionsOrTag === 'string' ? { e2eTag: optionsOrTag } : (optionsOrTag ?? {});

	const department = normalizeDepartment(options.department ?? snapshot.department);
	const createdAt = Date.now();
	const name = options.name?.trim() || getDefaultBackupName(options.source, createdAt);
	const filename = `backup-${createdAt}.json`;
	const serializedSnapshot = JSON.stringify(snapshot);
	const backupId = await ctx.db.insert('backups', {
		name,
		filename,
		creatorId: options.creatorId,
		creatorName: options.creatorName,
		creatorRole: options.creatorRole,
		source: options.source,
		department,
		data: serializedSnapshot.length <= BACKUP_CHUNK_SIZE ? snapshot : undefined,
		chunkCount:
			serializedSnapshot.length <= BACKUP_CHUNK_SIZE
				? undefined
				: Math.ceil(serializedSnapshot.length / BACKUP_CHUNK_SIZE),
		studentsCount: department === 'esl' ? snapshot.eslStudents.length : snapshot.students.length,
		createdAt,
		e2eTag: options.e2eTag
	});

	if (serializedSnapshot.length > BACKUP_CHUNK_SIZE) {
		for (
			let offset = 0, chunkIndex = 0;
			offset < serializedSnapshot.length;
			offset += BACKUP_CHUNK_SIZE, chunkIndex++
		) {
			await ctx.db.insert('backup_chunks', {
				backupId,
				chunkIndex,
				data: serializedSnapshot.slice(offset, offset + BACKUP_CHUNK_SIZE)
			});
		}
	}

	return backupId;
}

export function parseBackupSnapshot(chunks: { data: string }[]): BackupSnapshot {
	return JSON.parse(chunks.map((chunk) => chunk.data).join('')) as BackupSnapshot;
}

export async function pruneOldBackups(ctx: {
	db: GenericDatabaseReader<DataModel> & GenericDatabaseWriter<DataModel>;
}): Promise<{ deleted: number; kept: number }> {
	const now = Date.now();
	const backups = await ctx.db.query('backups').collect();
	let deleted = 0;
	let kept = 0;

	for (const backup of backups) {
		const source = backup.source ?? 'manual';
		const maxAge = RETENTION_DAYS[source];
		if (maxAge === Infinity) {
			kept++;
			continue;
		}

		const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
		if (now - backup.createdAt > maxAgeMs) {
			const chunks = await ctx.db
				.query('backup_chunks')
				.withIndex('by_backupId', (q) => q.eq('backupId', backup._id))
				.collect();
			for (const chunk of chunks) {
				await ctx.db.delete(chunk._id);
			}
			await ctx.db.delete(backup._id);
			deleted++;
		} else {
			kept++;
		}
	}

	return { deleted, kept };
}
