// Year-end migration decisions (ADR-0006).
//
// The single home for the grade-migration workflow: write an auto-backup first,
// clear evaluations/audit logs/house events, graduate grade 12 (any status),
// remove Not Enrolled students, advance enrolled students into the next
// grade's matching section (creating target classes on demand and deduplicating
// them), clear homeroom teachers, and delete empty classes while keeping
// protected IB classes at grades 11-12. `backup.ts` remains the authoritative
// enforcer of who may run the migration and reports the result (ADR-0002);
// this module only decides and executes the migration itself.

import type { Id } from '../_generated/dataModel';
import type { GenericDatabaseWriter } from 'convex/server';
import type { DataModel } from '../_generated/dataModel';
import { buildSnapshot, insertBackupRecord } from './backup_snapshot';

export type MigrationResult = {
	gradesAdvanced: number;
	grade12Deleted: number;
	notEnrolledDeleted: number;
	evaluationsCleared: number;
	auditLogsCleared: number;
	eventsDeleted: number;
	emptyClassesDeleted: number;
};

export async function runYearEndMigration(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	options: { e2eTag?: string }
): Promise<MigrationResult> {
	// Auto-backup first so the migration can be rolled back from a snapshot.
	const snapshot = await buildSnapshot(ctx);
	await insertBackupRecord(ctx, snapshot, options.e2eTag);

	// Clear evaluations and their audit logs.
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

	// Clear house events for the new academic year.
	const houseEvents = await ctx.db.query('house_events').collect();
	for (const event of houseEvents) {
		await ctx.db.delete(event._id);
	}

	// Delete grade 12 students (any status) then not-enrolled students.
	const classes = await ctx.db.query('classes').collect();
	const classMap = new Map(classes.map((c) => [c._id, c]));

	const allStudents = await ctx.db.query('students').collect();
	const grade12Students = allStudents.filter((s) => {
		if (!s.classId) return false;
		const cls = classMap.get(s.classId);
		return cls && cls.grade === 12;
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

	// Advance enrolled students into the next grade's matching section,
	// creating a target class once per (grade, section) and reusing it.
	const enrolledStudents = await ctx.db
		.query('students')
		.filter((q) => q.eq(q.field('status'), 'Enrolled'))
		.collect();

	const classLookup = new Map<string, Id<'classes'>>();
	for (const c of classes) {
		classLookup.set(`${c.grade}:${c.class}`, c._id);
	}

	let gradesAdvanced = 0;
	for (const student of enrolledStudents) {
		if (!student.classId) continue;
		const cls = classMap.get(student.classId);
		if (!cls || cls.grade < 7 || cls.grade > 11) continue;

		const nextGrade = cls.grade + 1;
		const key = `${nextGrade}:${cls.class}`;
		let nextClassId = classLookup.get(key);
		if (!nextClassId) {
			nextClassId = await ctx.db.insert('classes', {
				grade: nextGrade,
				class: cls.class
			});
			classLookup.set(key, nextClassId);
		}
		await ctx.db.patch(student._id, { classId: nextClassId });
		gradesAdvanced++;
	}

	// Clear homeroom teacher assignments — they change yearly and admins
	// prefer to reassign them each year after grade migration.
	const classesAfterAdvance = await ctx.db.query('classes').collect();
	for (const cls of classesAfterAdvance) {
		if (cls.homeroomTeacherId !== undefined) {
			await ctx.db.patch(cls._id, { homeroomTeacherId: undefined });
		}
	}

	// Remove empty classes, but never IB classes at grades 11-12 — those are
	// kept for future planning.
	const remainingStudents = await ctx.db.query('students').collect();
	const usedClassIds = new Set(remainingStudents.map((s) => s.classId));
	const postAdvanceClasses = await ctx.db.query('classes').collect();
	let emptyClassesDeleted = 0;
	for (const cls of postAdvanceClasses) {
		if (usedClassIds.has(cls._id)) continue;
		if (cls.class === 'IB' && (cls.grade === 11 || cls.grade === 12)) continue;
		await ctx.db.delete(cls._id);
		emptyClassesDeleted++;
	}

	return {
		gradesAdvanced,
		grade12Deleted: grade12Students.length,
		notEnrolledDeleted: notEnrolledStudents.length,
		evaluationsCleared: evaluations.length,
		auditLogsCleared,
		eventsDeleted: houseEvents.length,
		emptyClassesDeleted
	};
}
