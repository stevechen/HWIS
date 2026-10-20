export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

/** The two backup departments, mirroring the backend `Department` vocabulary. */
export type BackupDepartment = 'international' | 'esl';

/**
 * The department a backup record belongs to. Legacy rows written before the
 * `department` column existed have no value and are International backups, the
 * same default `resolveBackupDepartment` applies on the backend.
 */
export function backupDepartmentOf(backup: { department?: BackupDepartment }): BackupDepartment {
	return backup.department ?? 'international';
}
