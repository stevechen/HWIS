// Restore-plan decisions.
//
// The single home for how a backup payload is applied on top of the live
// database: which tables are cleared first (and which audit logs follow),
// how class/user/category IDs are remapped (deduplicating by grade+class and
// by name, reusing existing users by authId), and which evaluations are
// skipped when a referenced entity is missing. `backup.ts` remains the
// authoritative enforcer of who may restore (ADR-0002); this module only
// decides and executes the restore itself.

import type { Id } from '../_generated/dataModel';
import type { GenericDatabaseWriter } from 'convex/server';
import type { DataModel } from '../_generated/dataModel';
import type { BackupSnapshot } from './backup_snapshot';
import { normalizeStaffName } from './staff_name';

type SerializedDocument<T> = Omit<T, '_id' | '_creationTime'> & { _id: string };

type RestoreStudent = Omit<SerializedDocument<BackupSnapshot['students'][number]>, 'classId'> & {
	classId: string;
};

type RestoreEvaluation = Omit<
	SerializedDocument<BackupSnapshot['evaluations'][number]>,
	'studentId' | 'teacherId' | 'categoryId'
> & {
	studentId: string;
	teacherId: string;
	categoryId: string;
};

type RestoreClass = Omit<
	SerializedDocument<BackupSnapshot['classes'][number]>,
	'homeroomTeacherId'
> & {
	homeroomTeacherId?: string;
};

type RestoreUser = SerializedDocument<BackupSnapshot['users'][number]>;
type RestoreCategory = SerializedDocument<BackupSnapshot['categories'][number]>;
type RestoreHouseEvent = Omit<BackupSnapshot['houseEvents'][number], '_id' | '_creationTime'>;

export type RestorePayload = Omit<
	BackupSnapshot,
	| 'exportedAt'
	| 'version'
	| 'students'
	| 'evaluations'
	| 'users'
	| 'categories'
	| 'classes'
	| 'houseEvents'
> & {
	exportedAt?: string;
	version?: string;
	students: RestoreStudent[];
	evaluations: RestoreEvaluation[];
	users: RestoreUser[];
	categories: RestoreCategory[];
	classes: RestoreClass[];
	houseEvents: RestoreHouseEvent[];
};

export type RestoreResult = {
	skippedEvaluations: string[];
};

// Tables wiped by a restore, together with the audit logs that refer to them.
// User audit logs survive so account history is preserved; users themselves
// are never cleared because restore reuses existing users by authId.
const CLEARED_TABLES = [
	'evaluations',
	'students',
	'house_events',
	'classes',
	'point_categories'
] as const;

// Deletes every row in the entity tables a backup owns, then deletes the
// audit logs that targeted those tables. Users and user audit logs are kept.
async function clearRestorableData(ctx: { db: GenericDatabaseWriter<DataModel> }) {
	for (const table of CLEARED_TABLES) {
		const rows = await ctx.db.query(table).collect();
		for (const row of rows) {
			await ctx.db.delete(row._id);
		}
	}

	const auditLogs = await ctx.db.query('audit_logs').collect();
	for (const log of auditLogs) {
		if ((CLEARED_TABLES as readonly string[]).includes(log.targetTable)) {
			await ctx.db.delete(log._id);
		}
	}
}

// Recreates payload classes, mapping each old class id to a live one. Classes
// matching an existing grade+class are reused; otherwise a new class is
// created. This also deduplicates two payload entries for the same grade+class
// because the second finds the first's newly inserted class.
async function remapClasses(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	classes: RestorePayload['classes'],
	userIdMapping: Map<string, Id<'users'>>
) {
	const mapping = new Map<string, Id<'classes'>>();
	for (const cls of classes) {
		const existingClass = await ctx.db
			.query('classes')
			.withIndex('by_grade_class', (q) => q.eq('grade', cls.grade).eq('class', cls.class))
			.first();

		if (existingClass) {
			mapping.set(cls._id, existingClass._id);
		} else {
			const newClassId = await ctx.db.insert('classes', {
				grade: cls.grade,
				class: cls.class,
				homeroomTeacherId: cls.homeroomTeacherId
					? userIdMapping.get(cls.homeroomTeacherId)
					: undefined
			});
			mapping.set(cls._id, newClassId);
		}
	}
	return mapping;
}

// Recreates payload users. A user whose authId already exists is patched
// (name/role/status) rather than duplicated so authenticated accounts keep
// their live identity; users without an authId are always inserted fresh.
async function remapUsers(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	users: RestorePayload['users']
) {
	const mapping = new Map<string, Id<'users'>>();
	for (const user of users) {
		const existingUser = user.authId
			? await ctx.db
					.query('users')
					.withIndex('by_authId', (q) => q.eq('authId', user.authId))
					.first()
			: null;

		if (existingUser) {
			await ctx.db.patch(existingUser._id, {
				name: user.role === 'student' ? (user.name ?? undefined) : normalizeStaffName(user.name),
				role: user.role ?? existingUser.role,
				status: user.status ?? existingUser.status
			});
			mapping.set(user._id, existingUser._id);
		} else {
			const newUserId = await ctx.db.insert('users', {
				authId: user.authId ?? undefined,
				name: user.role === 'student' ? (user.name ?? undefined) : normalizeStaffName(user.name),
				role: user.role ?? 'teacher',
				status: user.status ?? 'active'
			});
			mapping.set(user._id, newUserId);
		}
	}
	return mapping;
}

// Recreates payload categories. A category matching an existing name is
// patched; otherwise a new one is inserted. This deduplicates two payload
// entries with the same name via the live lookup.
async function remapCategories(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	categories: RestorePayload['categories']
) {
	const mapping = new Map<string, Id<'point_categories'>>();
	for (const category of categories) {
		const existingCategory = await ctx.db
			.query('point_categories')
			.filter((q) => q.eq(q.field('name'), category.name))
			.first();
		if (existingCategory) {
			await ctx.db.patch(existingCategory._id, {
				meritCriteria: category.meritCriteria,
				demeritCriteria: category.demeritCriteria,
				casAlignment: category.casAlignment
			});
			mapping.set(category._id, existingCategory._id);
		} else {
			const newCategoryId = await ctx.db.insert('point_categories', {
				name: category.name,
				meritCriteria: category.meritCriteria,
				demeritCriteria: category.demeritCriteria,
				casAlignment: category.casAlignment
			});
			mapping.set(category._id, newCategoryId);
		}
	}
	return mapping;
}

// Applies a backup payload to the database. Clears the entity tables a backup
// owns, recreates classes/users/categories with ID remapping, then reinserts
// students, evaluations, and house events. Returns which evaluations were
// skipped and why.
export async function applyRestore(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	payload: RestorePayload
): Promise<RestoreResult> {
	const studentIds = new Set<string>();
	const duplicateStudentIds = new Set<string>();
	for (const student of payload.students) {
		if (studentIds.has(student.studentId)) duplicateStudentIds.add(student.studentId);
		studentIds.add(student.studentId);
	}
	if (duplicateStudentIds.size > 0) {
		throw new Error(
			`Restore contains duplicate student IDs: ${[...duplicateStudentIds].sort().join(', ')}`
		);
	}

	await clearRestorableData(ctx);

	const userIdMapping = await remapUsers(ctx, payload.users);
	const classIdMapping = await remapClasses(ctx, payload.classes, userIdMapping);
	const categoryIdMapping = await remapCategories(ctx, payload.categories);

	const studentIdMapping = new Map<string, Id<'students'>>();
	for (const student of payload.students) {
		const newClassId = classIdMapping.get(student.classId);
		if (!newClassId) {
			throw new Error(`Class not found for student ${student.studentId}: ${student.classId}`);
		}

		const newStudentId = await ctx.db.insert('students', {
			englishName: student.englishName,
			chineseName: student.chineseName,
			studentId: student.studentId,
			classId: newClassId,
			status: student.status,
			note: student.note ?? '',
			house: student.house
		});
		studentIdMapping.set(student._id, newStudentId);
	}

	const skippedEvaluations: string[] = [];
	for (const evaluation of payload.evaluations) {
		const newStudentId = studentIdMapping.get(evaluation.studentId);
		if (!newStudentId) {
			skippedEvaluations.push(
				`Evaluation ${evaluation._id}: student not found (${evaluation.studentId})`
			);
			continue;
		}

		const newTeacherId = userIdMapping.get(evaluation.teacherId);
		if (!newTeacherId) {
			skippedEvaluations.push(
				`Evaluation ${evaluation._id}: teacher not found (${evaluation.teacherId})`
			);
			continue;
		}

		const newCategoryId = categoryIdMapping.get(evaluation.categoryId);
		if (!newCategoryId) {
			skippedEvaluations.push(
				`Evaluation ${evaluation._id}: category not found (${evaluation.categoryId})`
			);
			continue;
		}

		await ctx.db.insert('evaluations', {
			studentId: newStudentId,
			teacherId: newTeacherId,
			value: evaluation.value,
			categoryId: newCategoryId,
			details: evaluation.details,
			timestamp: evaluation.timestamp,
			semesterId: evaluation.semesterId
		});
	}

	for (const event of payload.houseEvents) {
		await ctx.db.insert('house_events', {
			title: event.title,
			startDate: event.startDate,
			endDate: event.endDate,
			housePoints: event.housePoints ?? undefined,
			e2eTag: event.e2eTag
		});
	}

	return { skippedEvaluations };
}
