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
import { SNAPSHOT_VERSION } from './backup_snapshot';
import { normalizeStaffName } from './staff_name';
import type { DepartmentRoles } from './authorization';

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
type RestoreLeaderboardThumbnail = Omit<
	BackupSnapshot['leaderboardThumbnails'][number],
	'_id' | '_creationTime'
>;
type RestoreLeaderboardSnapshot = Omit<
	BackupSnapshot['leaderboardSnapshots'][number],
	'_id' | '_creationTime'
>;

// The HWIS restore path consumes the original six collections plus the two
// leaderboard tables. Snapshots written before version 2.0 do not carry the
// leaderboard arrays at all, so they are optional here and read as empty.
export type RestorePayload = Omit<
	BackupSnapshot,
	| 'exportedAt'
	| 'version'
	| 'department'
	| 'students'
	| 'evaluations'
	| 'users'
	| 'categories'
	| 'classes'
	| 'houseEvents'
	| 'leaderboardThumbnails'
	| 'leaderboardSnapshots'
	| 'eslCohorts'
	| 'eslClasses'
	| 'eslClassMeetings'
	| 'eslTeacherAvailability'
	| 'eslSemesters'
	| 'eslEvents'
	| 'eslStudents'
	| 'teacherNotes'
> & {
	exportedAt?: string;
	version?: string;
	students: RestoreStudent[];
	evaluations: RestoreEvaluation[];
	users: RestoreUser[];
	categories: RestoreCategory[];
	classes: RestoreClass[];
	houseEvents: RestoreHouseEvent[];
	leaderboardThumbnails?: RestoreLeaderboardThumbnail[];
	leaderboardSnapshots?: RestoreLeaderboardSnapshot[];
};

/** Versions this build can apply through the International (HWIS) restore. */
export const HWIS_RESTORE_VERSIONS = [SNAPSHOT_VERSION, '1.0', undefined] as const;
/** Versions this build can apply through the ESL restore. */
export const ESL_RESTORE_VERSIONS = [SNAPSHOT_VERSION] as const;

export type RestoreResult = {
	skippedEvaluations: string[];
};

// --- ESL payload -----------------------------------------------------------
//
// The ESL restore owns a different graph (cohorts → classes/students/events),
// so it gets its own payload type rather than widening `RestorePayload` with
// arrays the HWIS path would ignore. Every array is optional-safe: a snapshot
// always carries all of them, but a hand-written or legacy payload that omits
// an array would otherwise break the HWIS restore, which is why the two types
// stay separate (see #238/#246). Foreign keys are strings, exactly like the
// HWIS `RestoreStudent`/`RestoreClass` overrides, because a serialized
// snapshot no longer carries live `Id` values.

type RestoreEslCohort = SerializedDocument<BackupSnapshot['eslCohorts'][number]>;
type RestoreEslClass = Omit<
	SerializedDocument<BackupSnapshot['eslClasses'][number]>,
	'cohortId' | 'teacherId'
> & {
	cohortId: string;
	teacherId?: string;
};
type RestoreEslMeeting = Omit<
	SerializedDocument<BackupSnapshot['eslClassMeetings'][number]>,
	'classId'
> & {
	classId: string;
};
type RestoreEslAvailability = Omit<
	SerializedDocument<BackupSnapshot['eslTeacherAvailability'][number]>,
	'teacherId'
> & {
	teacherId: string;
};
type RestoreEslSemester = SerializedDocument<BackupSnapshot['eslSemesters'][number]>;
type RestoreEslEvent = Omit<
	SerializedDocument<BackupSnapshot['eslEvents'][number]>,
	'semesterId'
> & {
	semesterId: string;
};
type RestoreEslStudent = Omit<
	SerializedDocument<BackupSnapshot['eslStudents'][number]>,
	'cohortId'
> & {
	cohortId: string;
};
type RestoreTeacherNote = Omit<
	SerializedDocument<BackupSnapshot['teacherNotes'][number]>,
	'classId' | 'teacherId' | 'updatedBy'
> & {
	classId: string;
	teacherId: string;
	updatedBy: string;
};

export type EslRestorePayload = {
	exportedAt?: string;
	version?: string;
	users: RestoreUser[];
	eslCohorts: RestoreEslCohort[];
	eslClasses: RestoreEslClass[];
	eslClassMeetings: RestoreEslMeeting[];
	eslTeacherAvailability: RestoreEslAvailability[];
	eslSemesters: RestoreEslSemester[];
	eslEvents: RestoreEslEvent[];
	eslStudents: RestoreEslStudent[];
	teacherNotes: RestoreTeacherNote[];
};

export type EslRestoreResult = {
	/** Rows dropped because a user they referenced could not be remapped. */
	skippedReferences: string[];
};

// Tables wiped by a restore, together with the audit logs that refer to them.
// User audit logs survive so account history is preserved; users themselves
// are never cleared because restore reuses existing users by authId.
const CLEARED_TABLES = [
	'evaluations',
	'students',
	'house_events',
	'classes',
	'point_categories',
	'leaderboard_thumbnails',
	'leaderboard_snapshots'
] as const;

const HWIS_REQUIRED_ARRAYS = [
	'students',
	'evaluations',
	'users',
	'categories',
	'classes',
	'houseEvents'
] as const;

const HWIS_OPTIONAL_ARRAYS = ['leaderboardThumbnails', 'leaderboardSnapshots'] as const;

const ESL_REQUIRED_ARRAYS = [
	'users',
	'eslCohorts',
	'eslClasses',
	'eslClassMeetings',
	'eslTeacherAvailability',
	'eslSemesters',
	'eslEvents',
	'eslStudents',
	'teacherNotes'
] as const;

function restoreVersionOf(payload: unknown): unknown {
	return (payload as { version?: unknown } | null | undefined)?.version;
}

function assertRestoreVersion(
	payload: unknown,
	accepted: readonly (string | undefined)[],
	label: string
): void {
	const version = restoreVersionOf(payload);
	if (accepted.includes(version as string | undefined)) return;
	const shown = version === undefined ? 'none' : JSON.stringify(version);
	throw new Error(
		`Incompatible schema version: ${label} snapshot version ${shown} is not compatible with accepted version(s) ${accepted
			.filter((v): v is string => v !== undefined)
			.map((v) => JSON.stringify(v))
			.join(', ')}. Restore cannot proceed.`
	);
}

function requireArray(payload: unknown, key: string): readonly unknown[] {
	const value = (payload as Record<string, unknown> | null | undefined)?.[key];
	if (!Array.isArray(value)) {
		throw new Error(`Invalid backup payload: missing or invalid '${key}' array.`);
	}
	return value;
}

function requireOptionalArray(payload: unknown, key: string): void {
	const value = (payload as Record<string, unknown> | null | undefined)?.[key];
	if (value !== undefined && !Array.isArray(value)) {
		throw new Error(`Invalid backup payload: invalid '${key}' array.`);
	}
}

function readId(value: unknown): string | undefined {
	const id = (value as { _id?: unknown } | null | undefined)?._id;
	return typeof id === 'string' ? id : undefined;
}

/**
 * Validates an International (HWIS) payload *before* any table is cleared.
 *
 * Version 1.0 payloads predate the leaderboard arrays and are still accepted;
 * the arrays read as empty. Unknown versions and structurally broken payloads
 * are rejected up front so a failed restore never half-applies.
 */
export function assertHwisRestorePayload(payload: unknown): asserts payload is RestorePayload {
	assertRestoreVersion(payload, HWIS_RESTORE_VERSIONS, 'International');
	for (const key of HWIS_REQUIRED_ARRAYS) requireArray(payload, key);
	for (const key of HWIS_OPTIONAL_ARRAYS) requireOptionalArray(payload, key);

	const students = requireArray(payload, 'students') as Array<{
		studentId?: unknown;
		classId?: unknown;
	}>;
	const classIds = new Set(
		(requireArray(payload, 'classes') as unknown[]).map(readId).filter((id) => id !== undefined)
	);

	const studentIds = new Set<string>();
	const duplicateStudentIds = new Set<string>();
	for (const student of students) {
		const studentId = typeof student.studentId === 'string' ? student.studentId : undefined;
		if (studentId) {
			if (studentIds.has(studentId)) duplicateStudentIds.add(studentId);
			studentIds.add(studentId);
		}
		const classId = typeof student.classId === 'string' ? student.classId : undefined;
		if (!classId || !classIds.has(classId)) {
			throw new Error(
				`Class not found for student ${student.studentId ?? '(unknown)'}: ${classId ?? '(missing)'}`
			);
		}
	}
	if (duplicateStudentIds.size > 0) {
		throw new Error(
			`Restore contains duplicate student IDs: ${[...duplicateStudentIds].sort().join(', ')}`
		);
	}
}

/**
 * Validates an ESL payload *before* any table is cleared.
 *
 * Only version 2.0 (the first version that carries the ESL arrays) is accepted:
 * an older snapshot has no ESL rows to restore, and treating it as an empty
 * ESL snapshot would silently wipe the department.
 */
export function assertEslRestorePayload(payload: unknown): asserts payload is EslRestorePayload {
	assertRestoreVersion(payload, ESL_RESTORE_VERSIONS, 'ESL');
	for (const key of ESL_REQUIRED_ARRAYS) requireArray(payload, key);

	const cohortIds = new Set(
		(requireArray(payload, 'eslCohorts') as unknown[]).map(readId).filter((id) => id !== undefined)
	);
	const semesterIds = new Set(
		(requireArray(payload, 'eslSemesters') as unknown[])
			.map(readId)
			.filter((id) => id !== undefined)
	);
	const classIds = new Set(
		(requireArray(payload, 'eslClasses') as unknown[]).map(readId).filter((id) => id !== undefined)
	);

	for (const cls of requireArray(payload, 'eslClasses') as Array<{
		_id?: string;
		cohortId?: string;
	}>) {
		if (!cls.cohortId || !cohortIds.has(cls.cohortId)) {
			throw new Error(
				`Cohort not found for class ${cls._id ?? '(unknown)'}: ${cls.cohortId ?? '(missing)'}`
			);
		}
	}
	for (const meeting of requireArray(payload, 'eslClassMeetings') as Array<{
		_id?: string;
		classId?: string;
	}>) {
		if (!meeting.classId || !classIds.has(meeting.classId)) {
			throw new Error(
				`Class not found for meeting ${meeting._id ?? '(unknown)'}: ${meeting.classId ?? '(missing)'}`
			);
		}
	}
	for (const student of requireArray(payload, 'eslStudents') as Array<{
		schoolStudentId?: string;
		cohortId?: string;
	}>) {
		if (!student.cohortId || !cohortIds.has(student.cohortId)) {
			throw new Error(
				`Cohort not found for student ${student.schoolStudentId ?? '(unknown)'}: ${student.cohortId ?? '(missing)'}`
			);
		}
	}
	for (const event of requireArray(payload, 'eslEvents') as Array<{
		_id?: string;
		semesterId?: string;
	}>) {
		if (!event.semesterId || !semesterIds.has(event.semesterId)) {
			throw new Error(
				`Semester not found for event ${event._id ?? '(unknown)'}: ${event.semesterId ?? '(missing)'}`
			);
		}
	}
}

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

// Merges a backed-up department assignment into the live one without ever
// removing a live grant. A department the live user already belongs to keeps
// its current rank (so a grant or demotion made after the backup survives),
// while departments missing live are restored from the payload. This keeps an
// ESL-only or hybrid user working across a restore instead of silently losing
// the department they were assigned after the snapshot was taken.
function mergeDepartmentRoles(
	live: DepartmentRoles | undefined,
	payload: DepartmentRoles | undefined
): DepartmentRoles | undefined {
	if (!payload) return live;
	if (!live) return payload;
	const merged: DepartmentRoles = {};
	const international = live.international ?? payload.international;
	const esl = live.esl ?? payload.esl;
	if (international) merged.international = international;
	if (esl) merged.esl = esl;
	return merged;
}

// Recreates payload users. A user whose authId already exists is patched
// (name/role/status/departmentRoles) rather than duplicated so authenticated
// accounts keep their live identity. Department roles are unioned rather than
// overwritten: the payload only fills in departments the live user lacks.
// Users with an authId absent from the live database are skipped — a deleted
// user stays deleted across restores. Users without an authId are always
// inserted fresh and receive the payload's department roles.
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
			const departmentRoles = mergeDepartmentRoles(
				existingUser.departmentRoles,
				user.departmentRoles
			);
			await ctx.db.patch(existingUser._id, {
				name: user.role === 'student' ? (user.name ?? undefined) : normalizeStaffName(user.name),
				role: user.role ?? existingUser.role,
				status: user.status ?? existingUser.status,
				...(departmentRoles ? { departmentRoles } : {})
			});
			mapping.set(user._id, existingUser._id);
		} else if (user.authId) {
			continue;
		} else {
			const newUserId = await ctx.db.insert('users', {
				authId: undefined,
				name: user.role === 'student' ? (user.name ?? undefined) : normalizeStaffName(user.name),
				role: user.role ?? 'teacher',
				status: user.status ?? 'active',
				departmentRoles: user.departmentRoles
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
	// Validate version, shape and class references before anything is cleared.
	assertHwisRestorePayload(payload);

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

	// Leaderboard rows carry no references, so they are reinserted verbatim.
	// Version 1.0 payloads omit these arrays; they restore as empty.
	for (const thumbnail of payload.leaderboardThumbnails ?? []) {
		await ctx.db.insert('leaderboard_thumbnails', {
			board: thumbnail.board,
			theme: thumbnail.theme,
			url: thumbnail.url,
			updatedAt: thumbnail.updatedAt
		});
	}
	for (const snapshot of payload.leaderboardSnapshots ?? []) {
		await ctx.db.insert('leaderboard_snapshots', {
			board: snapshot.board,
			stats: snapshot.stats,
			generatedAt: snapshot.generatedAt,
			watermark: snapshot.watermark
		});
	}

	return { skippedEvaluations };
}

// --- ESL restore -----------------------------------------------------------

// ESL entity tables wiped by an ESL restore, in dependency-safe delete order.
// `esl_holiday_cache` is deliberately absent: it is a rebuildable cache owned by
// neither department's restore (see #232/#235). `backups`, `backup_chunks`,
// `backupHeartbeats`, the better-auth tables and every HWIS table are likewise
// never touched — an ESL restore cannot clobber International data.
const ESL_CLEARED_TABLES = [
	'teacher_notes',
	'esl_class_meetings',
	'esl_classes',
	'esl_events',
	'esl_semesters',
	'esl_students',
	'esl_cohorts',
	'esl_teacher_availability'
] as const;

// Clears the ESL entity tables. `audit_logs` is intentionally left untouched:
// ESL writes no audit logs today (#232), so there is nothing of its own to
// clear, and deleting by table name would risk removing International history.
async function clearEslData(ctx: { db: GenericDatabaseWriter<DataModel> }) {
	for (const table of ESL_CLEARED_TABLES) {
		const rows = await ctx.db.query(table).collect();
		for (const row of rows) {
			await ctx.db.delete(row._id);
		}
	}
}

// Maps payload users onto live users without ever mutating one. Share with
// HWIS: an existing user (matched by authId) keeps its base role/status/name and
// its live `departmentRoles` verbatim, so a hybrid user survives an ESL restore
// with their International grant intact. Users with an authId absent from the
// live database are skipped — a deleted user stays deleted. Users without an
// authId are inserted fresh with the payload's department roles.
async function remapEslUsers(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	users: EslRestorePayload['users']
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
			mapping.set(user._id, existingUser._id);
		} else if (user.authId) {
			continue;
		} else {
			const newUserId = await ctx.db.insert('users', {
				authId: undefined,
				name: user.role === 'student' ? (user.name ?? undefined) : normalizeStaffName(user.name),
				role: user.role ?? 'teacher',
				status: user.status ?? 'active',
				departmentRoles: user.departmentRoles
			});
			mapping.set(user._id, newUserId);
		}
	}
	return mapping;
}

// Applies a department-scoped ESL snapshot. Clears only the ESL entity tables,
// then reinserts in dependency order: cohorts → semesters → events, and
// cohorts → classes → meetings, cohorts → students, classes/teachers → notes,
// teachers → availability. Users are reused by authId and never modified. Returns
// the references that were skipped because their user was gone. HWIS tables and
// audit logs are untouched.
//
// Decision (#246): an ESL restore replaces the *whole* ESL graph in the payload,
// including archived cohorts. There is no archived-only merge — the snapshot is
// the department's source of truth, so a cohort archived after the snapshot is
// gone once the snapshot is restored.
export async function applyEslRestore(
	ctx: { db: GenericDatabaseWriter<DataModel> },
	payload: EslRestorePayload
): Promise<EslRestoreResult> {
	// Version and reference validation happen before `clearEslData`, so an
	// incompatible payload leaves the live graph untouched.
	assertEslRestorePayload(payload);

	await clearEslData(ctx);

	const userIdMapping = await remapEslUsers(ctx, payload.users);
	const skippedReferences: string[] = [];

	// Cohorts first: classes and students both hang off them.
	const cohortIdMapping = new Map<string, Id<'esl_cohorts'>>();
	for (const cohort of payload.eslCohorts) {
		const newCohortId = await ctx.db.insert('esl_cohorts', {
			year: cohort.year,
			grade: cohort.grade,
			level: cohort.level,
			classNumber: cohort.classNumber,
			e2eTag: cohort.e2eTag,
			status: cohort.status,
			createdAt: cohort.createdAt
		});
		cohortIdMapping.set(cohort._id, newCohortId);
	}

	// Semesters, then their events.
	const semesterIdMapping = new Map<string, Id<'esl_semesters'>>();
	for (const semester of payload.eslSemesters) {
		const newSemesterId = await ctx.db.insert('esl_semesters', {
			year: semester.year,
			term: semester.term,
			startDate: semester.startDate,
			e2eTag: semester.e2eTag
		});
		semesterIdMapping.set(semester._id, newSemesterId);
	}

	for (const event of payload.eslEvents) {
		const newSemesterId = semesterIdMapping.get(event.semesterId);
		if (!newSemesterId) {
			throw new Error(`Semester not found for event ${event._id}: ${event.semesterId}`);
		}
		await ctx.db.insert('esl_events', {
			semesterId: newSemesterId,
			type: event.type,
			reminderKind: event.reminderKind,
			isBanner: event.isBanner,
			title: event.title,
			target: event.target,
			date: event.date,
			examGroup: event.examGroup,
			endDate: event.endDate,
			note: event.note,
			startPeriod: event.startPeriod,
			endPeriod: event.endPeriod,
			provenance: event.provenance,
			unverified: event.unverified,
			e2eTag: event.e2eTag
		});
	}

	// Classes reference their cohort and (optionally) a teacher.
	const classIdMapping = new Map<string, Id<'esl_classes'>>();
	for (const cls of payload.eslClasses) {
		const newCohortId = cohortIdMapping.get(cls.cohortId);
		if (!newCohortId) {
			throw new Error(`Cohort not found for class ${cls._id}: ${cls.cohortId}`);
		}
		const newTeacherId = cls.teacherId ? userIdMapping.get(cls.teacherId) : undefined;
		const newClassId = await ctx.db.insert('esl_classes', {
			cohortId: newCohortId,
			type: cls.type,
			name: cls.name,
			teacherId: newTeacherId,
			room: cls.room,
			status: cls.status,
			createdAt: cls.createdAt
		});
		classIdMapping.set(cls._id, newClassId);
	}

	// Meetings reference their class.
	for (const meeting of payload.eslClassMeetings) {
		const newClassId = classIdMapping.get(meeting.classId);
		if (!newClassId) {
			throw new Error(`Class not found for meeting ${meeting._id}: ${meeting.classId}`);
		}
		await ctx.db.insert('esl_class_meetings', {
			classId: newClassId,
			year: meeting.year,
			day: meeting.day,
			period: meeting.period,
			e2eTag: meeting.e2eTag
		});
	}

	// Students reference their cohort.
	for (const student of payload.eslStudents) {
		const newCohortId = cohortIdMapping.get(student.cohortId);
		if (!newCohortId) {
			throw new Error(
				`Cohort not found for student ${student.schoolStudentId}: ${student.cohortId}`
			);
		}
		await ctx.db.insert('esl_students', {
			cohortId: newCohortId,
			englishName: student.englishName,
			chineseName: student.chineseName,
			schoolStudentId: student.schoolStudentId,
			chineseClass: student.chineseClass,
			status: student.status,
			enrolledAt: student.enrolledAt,
			disabledAt: student.disabledAt,
			statusReason: student.statusReason,
			e2eTag: student.e2eTag
		});
	}

	// Notes reference a class and two users. A note whose teacher was deleted
	// cannot be reattached, so it is skipped rather than failing the restore.
	for (const note of payload.teacherNotes) {
		const newClassId = classIdMapping.get(note.classId);
		const newTeacherId = userIdMapping.get(note.teacherId);
		const newUpdatedById = userIdMapping.get(note.updatedBy);
		if (!newClassId) {
			skippedReferences.push(`Teacher note ${note._id}: class not found (${note.classId})`);
			continue;
		}
		if (!newTeacherId || !newUpdatedById) {
			skippedReferences.push(`Teacher note ${note._id}: user not found`);
			continue;
		}
		await ctx.db.insert('teacher_notes', {
			classId: newClassId,
			date: note.date,
			teacherId: newTeacherId,
			text: note.text,
			updatedAt: note.updatedAt,
			updatedBy: newUpdatedById,
			e2eTag: note.e2eTag
		});
	}

	// Availability is per teacher; skip blocks whose teacher is gone.
	for (const availability of payload.eslTeacherAvailability) {
		const newTeacherId = userIdMapping.get(availability.teacherId);
		if (!newTeacherId) {
			skippedReferences.push(
				`Teacher availability ${availability._id}: teacher not found (${availability.teacherId})`
			);
			continue;
		}
		await ctx.db.insert('esl_teacher_availability', {
			teacherId: newTeacherId,
			year: availability.year,
			day: availability.day,
			period: availability.period,
			note: availability.note,
			e2eTag: availability.e2eTag
		});
	}

	return { skippedReferences };
}
