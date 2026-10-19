// Shared department vocabulary for backup storage, snapshots and crons.
//
// The runtime validator lives here so the schema and every function that takes
// a department agree on exactly the same two literals.

import { v } from 'convex/values';
import type { Department } from './authorization';

export const DEPARTMENT_VALUES = ['international', 'esl'] as const;

export const departmentValidator = v.union(v.literal('international'), v.literal('esl'));

/** The departments a scheduled backup runs for, in cron order. */
export const BACKUP_DEPARTMENTS: readonly Department[] = DEPARTMENT_VALUES;

/** Backups written before the column existed belong to the International department. */
export const DEFAULT_BACKUP_DEPARTMENT: Department = 'international';

export function normalizeDepartment(department: Department | undefined): Department {
	return department ?? DEFAULT_BACKUP_DEPARTMENT;
}
