import { expect, test, describe, afterEach, vi } from 'vite-plus/test';
import {
	convexTest,
	modules,
	createStudentWithClass,
	seedUser,
	seedEslStaff,
	mockAuthUser
} from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import {
	applyEslRestore,
	applyRestore,
	type EslRestorePayload,
	type RestorePayload
} from './shared/restore_plan';
import { buildSnapshot, insertBackupRecord, SNAPSHOT_VERSION } from './shared/backup_snapshot';

/** Serializes a live snapshot exactly as `insertBackupRecord` would. */
function serialize<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function emptyHwisPayload(): RestorePayload {
	return {
		students: [],
		evaluations: [],
		users: [],
		categories: [],
		classes: [],
		houseEvents: []
	};
}

/**
 * Seeds a small but fully cross-referenced ESL graph: a cohort with a semester,
 * an event, a class with a meeting, a student, a teacher note, and a blocked
 * availability slot. Returns the seeded users so tests can assert they are
 * reused unchanged.
 */
async function seedEslGraph(t: Awaited<ReturnType<typeof convexTest>>) {
	const { eslAdminId, teacherId } = await t.run(async (ctx) => {
		const eslAdminId = await ctx.db.insert('users', {
			authId: 'esl-admin-auth',
			name: 'Esl Admin',
			role: 'teacher',
			status: 'active',
			departmentRoles: { esl: 'admin' }
		});
		const teacherId = await ctx.db.insert('users', {
			authId: 'esl-teacher-auth',
			name: 'Esl Teacher',
			role: 'teacher',
			status: 'active',
			departmentRoles: { esl: 'teacher' }
		});
		return { eslAdminId, teacherId };
	});

	const seeded = await t.run(async (ctx) => {
		const cohortId = await ctx.db.insert('esl_cohorts', {
			year: '2025-2026',
			grade: 7,
			level: 'Beginner',
			classNumber: '1',
			status: 'active',
			createdAt: 1
		});
		const semesterId = await ctx.db.insert('esl_semesters', {
			year: '2025-2026',
			term: 'S1',
			startDate: '2025-09-01'
		});
		const eventId = await ctx.db.insert('esl_events', {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			target: 'all',
			date: '2025-10-01'
		});
		const classId = await ctx.db.insert('esl_classes', {
			cohortId,
			type: 'CLIL',
			name: 'G7 Beginner CLIL',
			teacherId,
			room: 'R1',
			status: 'active',
			createdAt: 2
		});
		const meetingId = await ctx.db.insert('esl_class_meetings', {
			classId,
			year: '2025-2026',
			day: 'Monday',
			period: 1
		});
		const studentId = await ctx.db.insert('esl_students', {
			cohortId,
			englishName: 'Alice Chan',
			chineseName: '陳小美',
			schoolStudentId: '7001001',
			chineseClass: 'J101',
			status: 'active',
			enrolledAt: 3
		});
		const noteId = await ctx.db.insert('teacher_notes', {
			classId,
			date: '2025-10-01',
			teacherId,
			text: 'Bring workbooks',
			updatedAt: 4,
			updatedBy: teacherId
		});
		const availabilityId = await ctx.db.insert('esl_teacher_availability', {
			teacherId,
			year: '2025-2026',
			day: 'Monday',
			period: 2,
			note: 'part-time'
		});
		return {
			cohortId,
			semesterId,
			eventId,
			classId,
			meetingId,
			studentId,
			noteId,
			availabilityId
		};
	});

	// `eslAdminId` is unused by the graph but stays signed in for auth tests.
	void eslAdminId;
	return { teacherId, ...seeded };
}

async function clearEslTables(t: Awaited<ReturnType<typeof convexTest>>) {
	await t.run(async (ctx) => {
		for (const table of [
			'teacher_notes',
			'esl_class_meetings',
			'esl_classes',
			'esl_events',
			'esl_semesters',
			'esl_students',
			'esl_cohorts',
			'esl_teacher_availability'
		] as const) {
			for (const row of await ctx.db.query(table).collect()) {
				await ctx.db.delete(row._id);
			}
		}
	});
}

describe('applyEslRestore', () => {
	test('round-trips an ESL snapshot with every cross-reference intact', async () => {
		const t = await convexTest(schema, modules);
		const seeded = await seedEslGraph(t);

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx, 'esl'));
		const payload = serialize(snapshot) as EslRestorePayload;

		await clearEslTables(t);

		const result = await t.run(async (ctx) => applyEslRestore(ctx, payload));
		expect(result.skippedReferences).toHaveLength(0);

		const cohorts = await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect());
		const semesters = await t.run(async (ctx) => ctx.db.query('esl_semesters').collect());
		const events = await t.run(async (ctx) => ctx.db.query('esl_events').collect());
		const classes = await t.run(async (ctx) => ctx.db.query('esl_classes').collect());
		const meetings = await t.run(async (ctx) => ctx.db.query('esl_class_meetings').collect());
		const students = await t.run(async (ctx) => ctx.db.query('esl_students').collect());
		const notes = await t.run(async (ctx) => ctx.db.query('teacher_notes').collect());
		const availability = await t.run(async (ctx) =>
			ctx.db.query('esl_teacher_availability').collect()
		);

		expect(cohorts).toHaveLength(1);
		expect(semesters).toHaveLength(1);
		expect(events).toHaveLength(1);
		expect(classes).toHaveLength(1);
		expect(meetings).toHaveLength(1);
		expect(students).toHaveLength(1);
		expect(notes).toHaveLength(1);
		expect(availability).toHaveLength(1);

		// Every foreign key points at a live row restored in the same pass.
		const cls = classes[0];
		const cohort = await t.run(async (ctx) => ctx.db.get(cls.cohortId));
		expect(cohort?.year).toBe('2025-2026');
		const teacher = cls.teacherId ? await t.run(async (ctx) => ctx.db.get(cls.teacherId!)) : null;
		expect(teacher?.authId).toBe('esl-teacher-auth');

		const eventSemester = await t.run(async (ctx) => ctx.db.get(events[0].semesterId));
		expect(eventSemester?.term).toBe('S1');

		const meetingClass = await t.run(async (ctx) => ctx.db.get(meetings[0].classId));
		expect(meetingClass?.name).toBe('G7 Beginner CLIL');

		const studentCohort = await t.run(async (ctx) => ctx.db.get(students[0].cohortId));
		expect(studentCohort?.classNumber).toBe('1');

		const noteClass = await t.run(async (ctx) => ctx.db.get(notes[0].classId));
		expect(noteClass?.name).toBe('G7 Beginner CLIL');
		const noteUpdatedBy = await t.run(async (ctx) => ctx.db.get(notes[0].updatedBy));
		expect(noteUpdatedBy?.authId).toBe('esl-teacher-auth');

		// The restore must not leak the old ids: they are all remapped.
		expect(cls._id).not.toBe(seeded.classId);
		expect(students[0]._id).not.toBe(seeded.studentId);
	});

	test('leaves HWIS rows and a hybrid user untouched', async () => {
		const t = await convexTest(schema, modules);
		await createStudentWithClass(t, {
			englishName: 'Hwis Student',
			chineseName: '國際學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		await seedEslGraph(t);

		const hybridId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				authId: 'hybrid-auth',
				name: 'Hybrid Admin',
				role: 'admin',
				status: 'active',
				departmentRoles: { international: 'admin', esl: 'teacher' }
			})
		);

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx, 'esl'));
		const payload = serialize(snapshot) as EslRestorePayload;
		await clearEslTables(t);
		await t.run(async (ctx) => applyEslRestore(ctx, payload));

		// HWIS data survives.
		const hwisStudents = await t.run(async (ctx) => ctx.db.query('students').collect());
		const hwisClasses = await t.run(async (ctx) => ctx.db.query('classes').collect());
		expect(hwisStudents).toHaveLength(1);
		expect(hwisStudents[0].englishName).toBe('Hwis Student');
		expect(hwisClasses).toHaveLength(1);

		// The hybrid user keeps their identity and International grant verbatim.
		const hybrid = await t.run(async (ctx) => ctx.db.get(hybridId));
		expect(hybrid?.name).toBe('Hybrid Admin');
		expect(hybrid?.role).toBe('admin');
		expect(hybrid?.departmentRoles).toEqual({ international: 'admin', esl: 'teacher' });
	});

	test('does not clear the ESL holiday cache', async () => {
		const t = await convexTest(schema, modules);
		const cacheId = await t.run(async (ctx) =>
			ctx.db.insert('esl_holiday_cache', {
				year: '2026',
				date: '20260619',
				isHoliday: true,
				caption: '端午節',
				fetchedAt: 1
			})
		);

		await t.run(async (ctx) => applyEslRestore(ctx, serialize(await buildSnapshot(ctx, 'esl'))));

		expect(await t.run(async (ctx) => ctx.db.get(cacheId))).not.toBeNull();
	});

	test('skips a teacher note whose teacher is gone and reports it', async () => {
		const t = await convexTest(schema, modules);
		const payload: EslRestorePayload = {
			version: SNAPSHOT_VERSION,
			users: [],
			eslCohorts: [
				{
					_id: 'cohort-1',
					year: '2025-2026',
					grade: 7,
					level: 'Beginner',
					classNumber: '1',
					status: 'active',
					createdAt: 1
				}
			],
			eslSemesters: [],
			eslEvents: [],
			eslClasses: [
				{
					_id: 'class-1',
					cohortId: 'cohort-1',
					type: 'CLIL',
					name: 'G7 CLIL',
					status: 'active',
					createdAt: 2
				}
			],
			eslClassMeetings: [],
			eslStudents: [],
			teacherNotes: [
				{
					_id: 'note-1',
					classId: 'class-1',
					date: '2025-10-01',
					teacherId: 'missing-teacher',
					text: 'Orphaned note',
					updatedAt: 3,
					updatedBy: 'missing-teacher'
				}
			],
			eslTeacherAvailability: [
				{
					_id: 'avail-1',
					teacherId: 'missing-teacher',
					year: '2025-2026',
					day: 'Monday',
					period: 1
				}
			]
		};

		const result = await t.run(async (ctx) => applyEslRestore(ctx, payload));

		expect(result.skippedReferences).toHaveLength(2);
		expect(result.skippedReferences[0]).toContain('note-1');
		expect(await t.run(async (ctx) => ctx.db.query('teacher_notes').collect())).toHaveLength(0);
		expect(
			await t.run(async (ctx) => ctx.db.query('esl_teacher_availability').collect())
		).toHaveLength(0);
	});

	test('refuses an incompatible snapshot version with no writes', async () => {
		const t = await convexTest(schema, modules);
		await seedEslGraph(t);
		const payload: EslRestorePayload = {
			version: '999.0',
			users: [],
			eslCohorts: [],
			eslSemesters: [],
			eslEvents: [],
			eslClasses: [],
			eslClassMeetings: [],
			eslStudents: [],
			teacherNotes: [],
			eslTeacherAvailability: []
		};
		await expect(t.run(async (ctx) => applyEslRestore(ctx, payload))).rejects.toThrow(
			/Incompatible schema version/
		);

		expect(await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('esl_classes').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('esl_students').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('teacher_notes').collect())).toHaveLength(1);
	});

	test('refuses a legacy 1.0 payload for the ESL graph', async () => {
		const t = await convexTest(schema, modules);
		await seedEslGraph(t);
		const payload: EslRestorePayload = {
			version: '1.0',
			users: [],
			eslCohorts: [],
			eslSemesters: [],
			eslEvents: [],
			eslClasses: [],
			eslClassMeetings: [],
			eslStudents: [],
			teacherNotes: [],
			eslTeacherAvailability: []
		};

		await expect(t.run(async (ctx) => applyEslRestore(ctx, payload))).rejects.toThrow(
			/Incompatible schema version/
		);
		// Accepting a 1.0 payload would have cleared the graph as "empty".
		expect(await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect())).toHaveLength(1);
	});

	test('refuses a payload with a missing / dangling reference before clearing', async () => {
		const t = await convexTest(schema, modules);
		await seedEslGraph(t);
		const payload: EslRestorePayload = {
			version: SNAPSHOT_VERSION,
			users: [],
			eslCohorts: [],
			eslSemesters: [],
			eslEvents: [],
			eslClasses: [
				{
					_id: 'class-1',
					cohortId: 'missing-cohort',
					type: 'CLIL',
					name: 'Dangling',
					status: 'active',
					createdAt: 1
				}
			],
			eslClassMeetings: [],
			eslStudents: [],
			teacherNotes: [],
			eslTeacherAvailability: []
		};

		await expect(t.run(async (ctx) => applyEslRestore(ctx, payload))).rejects.toThrow(
			/Cohort not found/
		);
		expect(await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('esl_classes').collect())).toHaveLength(1);
	});
});

describe('HWIS restore isolation', () => {
	test('applyRestore leaves ESL rows untouched', async () => {
		const t = await convexTest(schema, modules);
		await seedEslGraph(t);

		await t.run(async (ctx) => applyRestore(ctx, emptyHwisPayload()));

		expect(await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('esl_classes').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('esl_students').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('teacher_notes').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('esl_events').collect())).toHaveLength(1);
	});
});

describe('restoreFromBackup department routing', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function seedEslBackup(t: Awaited<ReturnType<typeof convexTest>>) {
		return t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx, 'esl');
			return await insertBackupRecord(ctx, snapshot, { source: 'manual', department: 'esl' });
		});
	}

	test('a legacy backup without a department restores as International', async () => {
		const t = await convexTest(schema, modules);
		await createStudentWithClass(t, {
			englishName: 'Legacy Student',
			chineseName: '舊學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		// An ESL cohort proves the International path never clears ESL tables.
		await seedEslGraph(t);

		const backupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx, 'international');
			return ctx.db.insert('backups', {
				filename: `backup-${Date.now()}.json`,
				data: snapshot,
				createdAt: Date.now()
			});
		});

		// Default test identity is an International admin.
		const result = await t.mutation(api.backup.restoreFromBackup, { backupId });
		expect(result.message).toContain('Restored data:');
		expect(result.message).not.toContain('ESL');

		expect(await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect())).toHaveLength(1);
	});

	test('an ESL admin may restore an ESL backup', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin-auth', eslRole: 'admin' });
		const backupId = await seedEslBackup(t);

		const result = await t.mutation(api.backup.restoreFromBackup, { backupId });
		expect(result.message).toContain('Restored ESL data');
	});

	test('a super user may restore an ESL backup', async () => {
		const t = await convexTest(schema, modules);
		const superId = await seedUser(t, {
			authId: 'super-auth',
			name: 'Super',
			role: 'super',
			status: 'active'
		});
		mockAuthUser({
			_id: superId,
			authId: 'super-auth',
			name: 'Super',
			role: 'super',
			status: 'active'
		});
		const backupId = await seedEslBackup(t);

		const result = await t.mutation(api.backup.restoreFromBackup, { backupId });
		expect(result.message).toContain('Restored ESL data');
	});

	test('an International-only admin is refused an ESL restore', async () => {
		const t = await convexTest(schema, modules);
		const adminId = await seedUser(t, {
			authId: 'intl-admin-auth',
			name: 'Intl Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: adminId,
			authId: 'intl-admin-auth',
			name: 'Intl Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedEslBackup(t);

		await expect(t.mutation(api.backup.restoreFromBackup, { backupId })).rejects.toThrow(
			/Forbidden/
		);
	});

	test('an ESL-only admin is refused an International restore', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin-auth', eslRole: 'admin' });
		const backupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx, 'international');
			return await insertBackupRecord(ctx, snapshot, {
				source: 'manual',
				department: 'international'
			});
		});

		await expect(t.mutation(api.backup.restoreFromBackup, { backupId })).rejects.toThrow(
			/Forbidden/
		);
	});

	test('restoreFromBackupPayload defaults to International for a legacy payload', async () => {
		const t = await convexTest(schema, modules);
		await createStudentWithClass(t, {
			englishName: 'Hwis Student',
			chineseName: '國際學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		await t.mutation(api.backup.restoreFromBackupPayload, { backupData: emptyHwisPayload() });

		const backups = await t.run(async (ctx) => ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
		expect(backups[0].department).toBe('international');
	});

	test('restoreFromBackupPayload honours an ESL department', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin-auth', eslRole: 'admin' });
		await seedEslGraph(t);

		const payload = serialize(await t.run(async (ctx) => buildSnapshot(ctx, 'esl')));
		await t.mutation(api.backup.restoreFromBackupPayload, {
			backupData: payload,
			department: 'esl'
		});

		const backups = await t.run(async (ctx) => ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
		expect(backups[0].department).toBe('esl');
		expect(await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect())).toHaveLength(1);
	});

	test('restoreFromBackupPayload uses department arg over missing payload field', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin-auth', eslRole: 'admin' });
		await seedEslGraph(t);

		const payload = serialize(await t.run(async (ctx) => buildSnapshot(ctx, 'esl')));
		// Deliberately drop embedded department to simulate old/downloaded file.
		delete (payload as Record<string, unknown>).department;

		await t.mutation(api.backup.restoreFromBackupPayload, {
			backupData: payload,
			department: 'esl'
		});

		expect(await t.run(async (ctx) => ctx.db.query('backups').collect())).toHaveLength(1);
		expect(await t.run(async (ctx) => ctx.db.query('esl_cohorts').collect())).toHaveLength(1);
	});
});
