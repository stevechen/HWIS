// Backup snapshot decisions.
//
// The single home for the backup payload shape and how a full snapshot of the
// database is collected. Both the create-backup mutation and the year-end
// migration mutation produce a snapshot through this module so the format and
// the set of captured tables stay consistent (ADR-0002). `backup.ts` remains
// the authoritative enforcer of who may create a backup; this module only
// decides what a snapshot contains.

import type { Doc, Id } from '../_generated/dataModel';
import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server';
import type { DataModel } from '../_generated/dataModel';

const BACKUP_CHUNK_SIZE = 200_000;

export const SNAPSHOT_VERSION = '1.0';

export type BackupSnapshot = {
	exportedAt: string;
	version: string;
	students: Doc<'students'>[];
	evaluations: Doc<'evaluations'>[];
	users: Doc<'users'>[];
	categories: Doc<'point_categories'>[];
	classes: Doc<'classes'>[];
	houseEvents: Doc<'house_events'>[];
};

// Collects a full snapshot of every table a backup captures. Reads each table
// in parallel so a backup reflects a single point in time.
export async function buildSnapshot(ctx: {
	db: GenericDatabaseReader<DataModel>;
}): Promise<BackupSnapshot> {
	const [students, evaluations, users, categories, classes, houseEvents] = await Promise.all([
		ctx.db.query('students').collect(),
		ctx.db.query('evaluations').collect(),
		ctx.db.query('users').collect(),
		ctx.db.query('point_categories').collect(),
		ctx.db.query('classes').collect(),
		ctx.db.query('house_events').collect()
	]);

	return {
		exportedAt: new Date().toISOString(),
		version: SNAPSHOT_VERSION,
		students,
		evaluations,
		users,
		categories,
		classes,
		houseEvents
	};
}

export type BackupSource = 'manual' | 'system_migration' | 'system_safety' | 'system_cron';

export type InsertBackupOptions = {
	name?: string;
	creatorId?: Id<'users'>;
	creatorName?: string;
	source?: BackupSource;
	e2eTag?: string;
};

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

export async function insertBackupRecord(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	snapshot: BackupSnapshot,
	optionsOrTag?: InsertBackupOptions | string
): Promise<Id<'backups'>> {
	const options: InsertBackupOptions =
		typeof optionsOrTag === 'string' ? { e2eTag: optionsOrTag } : (optionsOrTag ?? {});

	const createdAt = Date.now();
	const name = options.name?.trim() || getDefaultBackupName(options.source, createdAt);
	const filename = `backup-${createdAt}.json`;
	const serializedSnapshot = JSON.stringify(snapshot);
	const backupId = await ctx.db.insert('backups', {
		name,
		filename,
		creatorId: options.creatorId,
		creatorName: options.creatorName,
		source: options.source,
		data: serializedSnapshot.length <= BACKUP_CHUNK_SIZE ? snapshot : undefined,
		chunkCount:
			serializedSnapshot.length <= BACKUP_CHUNK_SIZE
				? undefined
				: Math.ceil(serializedSnapshot.length / BACKUP_CHUNK_SIZE),
		studentsCount: snapshot.students.length,
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
