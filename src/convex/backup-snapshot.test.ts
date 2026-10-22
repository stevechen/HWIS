import { expect, test, describe } from 'vite-plus/test';
import { convexTest, modules, type ConvexTestInstance } from './test.setup';
import schema from './schema';
import {
	buildSnapshot,
	createStoredBackup,
	insertBackupRecord,
	parseBackupSnapshot,
	resolveBackupDepartment,
	SNAPSHOT_VERSION
} from './shared/backup_snapshot';

describe('backup snapshot', () => {
	test('buildSnapshot collects all six tables plus exportedAt and version', async () => {
		const t = await convexTest(schema, modules);

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Snapshot Student',
				chineseName: '快照學生',
				studentId: 'STU001',
				classId,
				status: 'Enrolled',
				house: 'Heracles'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'snapshot-teacher',
				name: 'Snapshot Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', { name: 'Creativity' });
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Great work',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Sports Day',
				startDate: Date.now(),
				endDate: Date.now() + 86400000,
				housePoints: { Heracles: 100 }
			});
		});

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx, 'international'));

		expect(snapshot.version).toBe(SNAPSHOT_VERSION);
		expect(snapshot.exportedAt).toEqual(expect.any(String));
		expect(snapshot.students).toHaveLength(1);
		expect(snapshot.evaluations).toHaveLength(1);
		expect(snapshot.users).toHaveLength(1);
		expect(snapshot.categories).toHaveLength(1);
		expect(snapshot.classes).toHaveLength(1);
		expect(snapshot.houseEvents).toHaveLength(1);

		expect(snapshot.students[0].house).toBe('Heracles');
		expect(snapshot.houseEvents[0].housePoints?.Heracles).toBe(100);
	});

	test('buildSnapshot includes every table even when empty', async () => {
		const t = await convexTest(schema, modules);

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx, 'international'));

		expect(snapshot.students).toHaveLength(0);
		expect(snapshot.evaluations).toHaveLength(0);
		expect(snapshot.users).toHaveLength(0);
		expect(snapshot.categories).toHaveLength(0);
		expect(snapshot.classes).toHaveLength(0);
		expect(snapshot.houseEvents).toHaveLength(0);
		expect(snapshot.version).toBe(SNAPSHOT_VERSION);
	});

	test('insertBackupRecord stores the snapshot with a backup filename and e2eTag', async () => {
		const t = await convexTest(schema, modules);

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx, 'international'));
		const backupId = await t.run(async (ctx) => insertBackupRecord(ctx, snapshot, 'snapshot-e2e'));

		const backup = await t.run(async (ctx) => ctx.db.get(backupId));

		expect(backup).toBeDefined();
		expect(backup!.filename).toMatch(/^backup-\d+\.json$/);
		expect(backup!.e2eTag).toBe('snapshot-e2e');
		expect(backup!.data).toMatchObject({
			version: SNAPSHOT_VERSION,
			students: [],
			evaluations: [],
			users: [],
			categories: [],
			classes: [],
			houseEvents: []
		});
	});

	test('insertBackupRecord chunks a snapshot larger than the 200KB limit', async () => {
		const t = await convexTest(schema, modules);

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Big Student',
				chineseName: '大學生',
				studentId: 'STU001',
				classId,
				status: 'Enrolled',
				note: 'x'.repeat(250_000),
				house: 'Heracles'
			});
		});

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx, 'international'));
		const serialized = JSON.stringify(snapshot);
		expect(serialized.length).toBeGreaterThan(200_000);

		const backupId = await t.run(async (ctx) =>
			insertBackupRecord(ctx, snapshot, 'big-snapshot-e2e')
		);

		const backup = await t.run(async (ctx) => ctx.db.get(backupId));
		expect(backup!.data).toBeUndefined();
		expect(backup!.studentsCount).toBe(1);
		expect(backup!.chunkCount).toBe(Math.ceil(serialized.length / 200_000));

		const chunks = await t.run(async (ctx) =>
			(await ctx.db.query('backup_chunks').collect()).filter((c) => c.backupId === backupId)
		);
		expect(chunks).toHaveLength(backup!.chunkCount!);
		expect(chunks.map((c) => c.data).join('')).toBe(serialized);

		const parsed = parseBackupSnapshot(chunks.sort((a, b) => a.chunkIndex - b.chunkIndex));
		expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(serialized));
	});
});

describe('department-scoped snapshots', () => {
	async function seedBothDepartments(t: ConvexTestInstance) {
		return await t.run(async (ctx) => {
			const year = '2025-2026';

			// HWIS data.
			const classId = await ctx.db.insert('classes', { grade: 10, class: '1' });
			const studentId = await ctx.db.insert('students', {
				englishName: 'HWIS Student',
				chineseName: '國際學生',
				studentId: 'H001',
				classId,
				status: 'Enrolled',
				house: 'Heracles'
			});
			const categoryId = await ctx.db.insert('point_categories', { name: 'Creativity' });
			const legacyTeacherId = await ctx.db.insert('users', {
				authId: 'legacy-teacher',
				name: 'Legacy Teacher',
				role: 'teacher',
				status: 'active'
			});
			const eslTeacherId = await ctx.db.insert('users', {
				authId: 'esl-teacher',
				name: 'ESL Teacher',
				role: 'teacher',
				status: 'active',
				departmentRoles: { esl: 'teacher' }
			});
			const hybridId = await ctx.db.insert('users', {
				authId: 'hybrid-admin',
				name: 'Hybrid Admin',
				role: 'admin',
				status: 'active',
				departmentRoles: { international: 'admin', esl: 'teacher' }
			});
			await ctx.db.insert('users', {
				authId: 'super-user',
				name: 'Super User',
				role: 'super',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'student-user',
				name: 'Student User',
				role: 'student',
				status: 'active'
			});
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: legacyTeacherId,
				value: 1,
				categoryId,
				details: 'Great work',
				timestamp: 1,
				semesterId: '2025-H1'
			});
			await ctx.db.insert('house_events', {
				title: 'Sports Day',
				startDate: 1,
				endDate: 2
			});
			await ctx.db.insert('leaderboard_thumbnails', {
				board: 'houses',
				theme: 'default',
				url: 'https://example.test/thumb.png',
				updatedAt: 1
			});
			await ctx.db.insert('leaderboard_snapshots', {
				board: 'houses',
				stats: '{}',
				generatedAt: 1,
				watermark: 1
			});

			// ESL data. `teacher_notes` has no `esl_` prefix on purpose.
			const cohortId = await ctx.db.insert('esl_cohorts', {
				year,
				grade: 7,
				level: 'A',
				classNumber: '1',
				status: 'active',
				createdAt: 1
			});
			const eslClassId = await ctx.db.insert('esl_classes', {
				cohortId,
				type: 'CLIL',
				name: 'CLIL A',
				status: 'active',
				createdAt: 1
			});
			await ctx.db.insert('esl_class_meetings', {
				classId: eslClassId,
				year,
				day: 'Monday',
				period: 1
			});
			await ctx.db.insert('esl_teacher_availability', {
				teacherId: eslTeacherId,
				year,
				day: 'Monday',
				period: 2
			});
			const semesterId = await ctx.db.insert('esl_semesters', {
				year,
				term: 'S1',
				startDate: '2025-08-01'
			});
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'no_school',
				title: 'Holiday',
				target: 'all',
				date: '2025-09-01'
			});
			await ctx.db.insert('esl_students', {
				cohortId,
				chineseName: 'ESL 學生',
				schoolStudentId: '7001001',
				status: 'active',
				enrolledAt: 1
			});
			await ctx.db.insert('teacher_notes', {
				classId: eslClassId,
				date: '2025-09-02',
				teacherId: eslTeacherId,
				text: 'Bring the workbook',
				updatedAt: 1,
				updatedBy: eslTeacherId
			});

			// Excluded from both snapshots.
			await ctx.db.insert('backups', { filename: 'legacy.json', createdAt: 1 });
			await ctx.db.insert('backupHeartbeats', {
				completedAt: 1,
				filename: 'backup-prod-2026-01-01.json',
				environment: 'prod'
			});
			await ctx.db.insert('settings', { key: 'k', value: 'v', updatedAt: 1 });
			await ctx.db.insert('esl_holiday_cache', {
				year: '2025',
				date: '20250101',
				isHoliday: false,
				caption: '',
				fetchedAt: 1
			});

			return { eslClassId, eslTeacherId, hybridId, legacyTeacherId };
		});
	}

	test('international snapshot includes the seven HWIS tables and no ESL rows', async () => {
		const t = await convexTest(schema, modules);
		await seedBothDepartments(t);

		const snapshot = await t.run((ctx) => buildSnapshot(ctx, 'international'));

		expect(snapshot.department).toBe('international');
		expect(snapshot.students).toHaveLength(1);
		expect(snapshot.evaluations).toHaveLength(1);
		expect(snapshot.categories).toHaveLength(1);
		expect(snapshot.classes).toHaveLength(1);
		expect(snapshot.houseEvents).toHaveLength(1);
		expect(snapshot.leaderboardThumbnails).toHaveLength(1);
		expect(snapshot.leaderboardSnapshots).toHaveLength(1);

		expect(snapshot.eslCohorts).toHaveLength(0);
		expect(snapshot.eslClasses).toHaveLength(0);
		expect(snapshot.eslClassMeetings).toHaveLength(0);
		expect(snapshot.eslTeacherAvailability).toHaveLength(0);
		expect(snapshot.eslSemesters).toHaveLength(0);
		expect(snapshot.eslEvents).toHaveLength(0);
		expect(snapshot.eslStudents).toHaveLength(0);
		expect(snapshot.teacherNotes).toHaveLength(0);
	});

	test('international snapshot keeps legacy staff, students and supers', async () => {
		const t = await convexTest(schema, modules);
		await seedBothDepartments(t);

		const snapshot = await t.run((ctx) => buildSnapshot(ctx, 'international'));

		expect(snapshot.users.map((u) => u.authId).sort()).toEqual([
			'hybrid-admin',
			'legacy-teacher',
			'student-user',
			'super-user'
		]);
	});

	test('ESL snapshot includes every ESL table, including prefix-less teacher_notes', async () => {
		const t = await convexTest(schema, modules);
		await seedBothDepartments(t);

		const snapshot = await t.run((ctx) => buildSnapshot(ctx, 'esl'));

		expect(snapshot.department).toBe('esl');
		expect(snapshot.eslCohorts).toHaveLength(1);
		expect(snapshot.eslClasses).toHaveLength(1);
		expect(snapshot.eslClassMeetings).toHaveLength(1);
		expect(snapshot.eslTeacherAvailability).toHaveLength(1);
		expect(snapshot.eslSemesters).toHaveLength(1);
		expect(snapshot.eslEvents).toHaveLength(1);
		expect(snapshot.eslStudents).toHaveLength(1);
		expect(snapshot.teacherNotes).toHaveLength(1);
		expect(snapshot.teacherNotes[0].text).toBe('Bring the workbook');

		expect(snapshot.students).toHaveLength(0);
		expect(snapshot.evaluations).toHaveLength(0);
		expect(snapshot.categories).toHaveLength(0);
		expect(snapshot.classes).toHaveLength(0);
		expect(snapshot.houseEvents).toHaveLength(0);
		expect(snapshot.leaderboardThumbnails).toHaveLength(0);
		expect(snapshot.leaderboardSnapshots).toHaveLength(0);
	});

	test('ESL snapshot keeps ESL staff and supers, never students', async () => {
		const t = await convexTest(schema, modules);
		await seedBothDepartments(t);

		const snapshot = await t.run((ctx) => buildSnapshot(ctx, 'esl'));

		expect(snapshot.users.map((u) => u.authId).sort()).toEqual([
			'esl-teacher',
			'hybrid-admin',
			'super-user'
		]);
	});

	test('snapshots never include archive, auth, settings or cache tables', async () => {
		const t = await convexTest(schema, modules);
		await seedBothDepartments(t);

		for (const department of ['international', 'esl'] as const) {
			const snapshot = await t.run((ctx) => buildSnapshot(ctx, department));
			const keys = Object.keys(snapshot);
			expect(keys).not.toContain('backups');
			expect(keys).not.toContain('backup_chunks');
			expect(keys).not.toContain('backupHeartbeats');
			expect(keys).not.toContain('settings');
			expect(keys).not.toContain('esl_holiday_cache');
		}
	});

	test('createStoredBackup stores the department and scopes its snapshot', async () => {
		const t = await convexTest(schema, modules);
		await seedBothDepartments(t);

		const international = await t.run((ctx) =>
			createStoredBackup(ctx, { source: 'system_cron', department: 'international' })
		);
		const esl = await t.run((ctx) =>
			createStoredBackup(ctx, { source: 'system_cron', department: 'esl' })
		);

		const [internationalRow, eslRow] = await t.run(async (ctx) => [
			await ctx.db.get(international.backupId),
			await ctx.db.get(esl.backupId)
		]);

		expect(internationalRow?.department).toBe('international');
		expect(eslRow?.department).toBe('esl');
		expect(international.snapshot.students).toHaveLength(1);
		expect(esl.snapshot.students).toHaveLength(0);
		expect(esl.snapshot.eslStudents).toHaveLength(1);
	});

	test('legacy backup rows without a department read as international', () => {
		expect(resolveBackupDepartment({ department: undefined })).toBe('international');
		expect(resolveBackupDepartment({})).toBe('international');
		expect(resolveBackupDepartment({ department: 'esl' })).toBe('esl');
		expect(resolveBackupDepartment({ department: 'international' })).toBe('international');
	});
});
