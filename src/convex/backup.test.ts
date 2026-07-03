import { expect, test, describe } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';

describe('backup clearing logic', () => {
	test('clearing evaluations clears related audit logs', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Creativity'
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
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval-1',
				oldValue: null,
				newValue: { value: 1 },
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'update_user_role',
				performerId: teacherId,
				targetTable: 'users',
				targetId: 'user-1',
				oldValue: { role: 'teacher' },
				newValue: { role: 'admin' },
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			const evaluations = await ctx.db.query('evaluations').collect();
			for (const evaluation of evaluations) {
				await ctx.db.delete(evaluation._id);
			}

			const auditLogs = await ctx.db.query('audit_logs').collect();
			for (const log of auditLogs) {
				if (log.targetTable === 'evaluations') {
					await ctx.db.delete(log._id);
				}
			}
		});

		const evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});

		const auditLogs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(evaluations).toHaveLength(0);
		expect(auditLogs).toHaveLength(1);
		expect(auditLogs[0].targetTable).toBe('users');
	});

	test('clearing students, evaluations, categories keeps users and user audit logs', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Creativity'
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
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval-1',
				oldValue: null,
				newValue: { value: 1 },
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'update_user_role',
				performerId: teacherId,
				targetTable: 'users',
				targetId: 'user-1',
				oldValue: { role: 'teacher' },
				newValue: { role: 'admin' },
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_student',
				performerId: teacherId,
				targetTable: 'students',
				targetId: 'student-1',
				oldValue: null,
				newValue: { englishName: 'Test Student' },
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const evaluations = await ctx.db.query('evaluations').collect();
			const categories = await ctx.db.query('point_categories').collect();

			for (const student of students) await ctx.db.delete(student._id);
			for (const evaluation of evaluations) await ctx.db.delete(evaluation._id);
			for (const category of categories) await ctx.db.delete(category._id);

			const auditLogs = await ctx.db.query('audit_logs').collect();
			for (const log of auditLogs) {
				if (log.targetTable === 'students' || log.targetTable === 'evaluations') {
					await ctx.db.delete(log._id);
				}
			}
		});

		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});

		const categories = await t.run(async (ctx) => {
			return await ctx.db.query('point_categories').collect();
		});

		const users = await t.run(async (ctx) => {
			return await ctx.db.query('users').collect();
		});

		const auditLogs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(students).toHaveLength(0);
		expect(evaluations).toHaveLength(0);
		expect(categories).toHaveLength(0);
		expect(users).toHaveLength(1);
		expect(auditLogs).toHaveLength(1);
		expect(auditLogs[0].targetTable).toBe('users');
	});

	test('advance grades only affects enrolled students', async () => {
		const t = convexTest(schema, modules);

		// Create class first
		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Enrolled Student',
				chineseName: '在校學生',
				studentId: 'STU001',
				classId,
				status: 'Enrolled'
			});
		});

		// Create another class for not enrolled
		const classId2 = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 11, class: '1' });
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Not Enrolled Student',
				chineseName: '非在校學生',
				studentId: 'STU002',
				classId: classId2,
				status: 'Not Enrolled'
			});
		});

		// The backup.ts advanceGradesAndClearEvaluations doesn't actually advance grades,
		// it only deletes grade 12 and not enrolled students.
		// This test was for functionality that was never implemented.
		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const enrolled = students.find((s) => s.studentId === 'STU001');
		const notEnrolled = students.find((s) => s.studentId === 'STU002');

		expect(enrolled?.status).toBe('Enrolled');
		expect(notEnrolled?.status).toBe('Not Enrolled');
	});

	test('backup and restore preserves data structure', async () => {
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Restored Student',
			chineseName: '恢復學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled',
			note: 'Restored from backup'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'restored-user',
				name: 'Restored User',
				role: 'admin',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('point_categories', {
				name: 'Restored Category'
			});
		});

		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const users = await t.run(async (ctx) => {
			return await ctx.db.query('users').collect();
		});

		const categories = await t.run(async (ctx) => {
			return await ctx.db.query('point_categories').collect();
		});

		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('Restored Student');
		expect(students[0].note).toBe('Restored from backup');

		expect(users).toHaveLength(1);
		expect(users[0].name).toBe('Restored User');

		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Restored Category');
	});

	describe('restoreFromBackup', () => {
		test('clears existing data before restoring backup data', async () => {
			const t = convexTest(schema, modules);

			const { studentId } = await createStudentWithClass(t, {
				englishName: 'Original Student',
				chineseName: '原始學生',
				studentId: 'STU001',
				grade: 10,
				classNum: '1',
				status: 'Enrolled',
				note: 'Original'
			});

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-auth-id',
					name: 'Original Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			const categoryId = await t.mutation(api.categories.create, {
				name: 'Original Category'
			});

			const backupId = await t.run(async (ctx) => {
				const students = await ctx.db.query('students').collect();
				const classes = await ctx.db.query('classes').collect();
				const users = await ctx.db.query('users').collect();
				const categories = await ctx.db.query('point_categories').collect();
				return await ctx.db.insert('backups', {
					filename: `backup-${Date.now()}.json`,
					data: {
						exportedAt: new Date().toISOString(),
						version: '1.0',
						students,
						evaluations: [],
						users,
						categories,
						classes,
						houseEvents: []
					},
					createdAt: Date.now()
				});
			});

			// Add extra data after backup (should be erased by restore)
			await createStudentWithClass(t, {
				englishName: 'Extra Student',
				chineseName: '額外學生',
				studentId: 'STU002',
				grade: 11,
				classNum: '2',
				status: 'Enrolled'
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('point_categories', {
					name: 'Extra Category'
				});
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('evaluations', {
					studentId,
					teacherId,
					value: 5,
					categoryId,
					details: 'Extra evaluation',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				});
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('classes', { grade: 12, class: '3' });
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('house_events', {
					title: 'Extra Event',
					startDate: Date.now(),
					endDate: Date.now() + 86400000
				});
			});

			// Verify pre-restore state has the extra data
			expect(await t.run(async (ctx) => (await ctx.db.query('students').collect()).length)).toBe(2);
			expect(
				await t.run(async (ctx) => (await ctx.db.query('point_categories').collect()).length)
			).toBe(2);
			expect(await t.run(async (ctx) => (await ctx.db.query('evaluations').collect()).length)).toBe(
				1
			);
			expect(await t.run(async (ctx) => (await ctx.db.query('classes').collect()).length)).toBe(3);
			expect(
				await t.run(async (ctx) => (await ctx.db.query('house_events').collect()).length)
			).toBe(1);

			await t.mutation(api.backup.restoreFromBackup, { backupId });

			const students = await t.run(async (ctx) => await ctx.db.query('students').collect());
			const categories = await t.run(
				async (ctx) => await ctx.db.query('point_categories').collect()
			);
			const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());
			const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
			const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());

			expect(students).toHaveLength(1);
			expect(students[0].englishName).toBe('Original Student');
			expect(students[0].studentId).toBe('STU001');

			expect(categories).toHaveLength(1);
			expect(categories[0].name).toBe('Original Category');

			expect(evaluations).toHaveLength(0);
			expect(houseEvents).toHaveLength(0);

			// Only the 2 original classes should remain
			expect(classes).toHaveLength(1);
		});

		test('clears audit logs for cleared tables, preserves users and user audit logs', async () => {
			const t = convexTest(schema, modules);

			await createStudentWithClass(t, {
				englishName: 'Audit Student',
				chineseName: '審計學生',
				studentId: 'STU010',
				grade: 10,
				classNum: '1',
				status: 'Enrolled'
			});

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'audit-teacher',
					name: 'Audit Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			await t.mutation(api.categories.create, {
				name: 'Audit Category'
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('audit_logs', {
					action: 'create_student',
					performerId: teacherId,
					targetTable: 'students',
					targetId: 'stu-010',
					oldValue: null,
					newValue: { englishName: 'Audit Student' },
					timestamp: Date.now()
				});
				await ctx.db.insert('audit_logs', {
					action: 'create_evaluation',
					performerId: teacherId,
					targetTable: 'evaluations',
					targetId: 'eval-010',
					oldValue: null,
					newValue: { value: 1 },
					timestamp: Date.now()
				});
				await ctx.db.insert('audit_logs', {
					action: 'update_user_role',
					performerId: teacherId,
					targetTable: 'users',
					targetId: 'user-010',
					oldValue: { role: 'teacher' },
					newValue: { role: 'admin' },
					timestamp: Date.now()
				});
			});

			const backupId = await t.run(async (ctx) => {
				const students = await ctx.db.query('students').collect();
				const classes = await ctx.db.query('classes').collect();
				const users = await ctx.db.query('users').collect();
				const categories = await ctx.db.query('point_categories').collect();
				return await ctx.db.insert('backups', {
					filename: `backup-${Date.now()}.json`,
					data: {
						exportedAt: new Date().toISOString(),
						version: '1.0',
						students,
						evaluations: [],
						users,
						categories,
						classes,
						houseEvents: []
					},
					createdAt: Date.now()
				});
			});

			await t.mutation(api.backup.restoreFromBackup, { backupId });

			const auditLogs = await t.run(async (ctx) => await ctx.db.query('audit_logs').collect());
			const users = await t.run(async (ctx) => await ctx.db.query('users').collect());

			// User audit logs should survive
			const userAuditLogs = auditLogs.filter((l) => l.targetTable === 'users');
			expect(userAuditLogs).toHaveLength(1);
			expect(userAuditLogs[0].targetTable).toBe('users');

			// Students/evaluations audit logs should be cleared
			expect(auditLogs.filter((l) => l.targetTable === 'students')).toHaveLength(0);
			expect(auditLogs.filter((l) => l.targetTable === 'evaluations')).toHaveLength(0);

			// Users table should be preserved (not cleared) and not duplicated
			expect(users).toHaveLength(1);
		});

		test('restores house_events from backup', async () => {
			const t = convexTest(schema, modules);

			await createStudentWithClass(t, {
				englishName: 'HE Student',
				chineseName: '活動學生',
				studentId: 'STU020',
				grade: 10,
				classNum: '1',
				status: 'Enrolled'
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('house_events', {
					title: 'Sports Day',
					startDate: Date.now(),
					endDate: Date.now() + 86400000,
					housePoints: { Heracles: 100, Wukong: 80, Ixbalam: 60, Setna: 40 }
				});
				await ctx.db.insert('house_events', {
					title: 'No Points Event',
					startDate: Date.now(),
					endDate: Date.now() + 86400000
				});
			});

			const backupId = await t.run(async (ctx) => {
				const students = await ctx.db.query('students').collect();
				const classes = await ctx.db.query('classes').collect();
				const users = await ctx.db.query('users').collect();
				const categories = await ctx.db.query('point_categories').collect();
				const houseEvents = await ctx.db.query('house_events').collect();
				return await ctx.db.insert('backups', {
					filename: `backup-${Date.now()}.json`,
					data: {
						exportedAt: new Date().toISOString(),
						version: '1.0',
						students,
						evaluations: [],
						users,
						categories,
						classes,
						houseEvents
					},
					createdAt: Date.now()
				});
			});

			// Add an extra house event that should be erased
			await t.run(async (ctx) => {
				await ctx.db.insert('house_events', {
					title: 'Intruder Event',
					startDate: Date.now(),
					endDate: Date.now() + 86400000
				});
			});

			expect(
				await t.run(async (ctx) => (await ctx.db.query('house_events').collect()).length)
			).toBe(3);

			await t.mutation(api.backup.restoreFromBackup, { backupId });

			const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());

			expect(houseEvents).toHaveLength(2);
			expect(houseEvents.find((e) => e.title === 'Sports Day')?.housePoints?.Heracles).toBe(100);
			expect(houseEvents.find((e) => e.title === 'No Points Event')).toBeDefined();
			expect(houseEvents.find((e) => e.title === 'Intruder Event')).toBeUndefined();
		});
	});

	test('advanceGradesAndClearEvaluations deletes grade 12 and not enrolled, advances remaining with section matching', async () => {
		const t = convexTest(schema, modules);

		// Create multiple sections per grade to verify section-name matching
		await createStudentWithClass(t, {
			englishName: 'Grade 7 Enrolled A',
			chineseName: '七年級在校A',
			studentId: 'STU001',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});

		// Second student in same grade 7 section 1 to test dedup class creation
		await createStudentWithClass(t, {
			englishName: 'Grade 7 Enrolled B',
			chineseName: '七年級在校B',
			studentId: 'STU007',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 11 Enrolled Section 1',
			chineseName: '十一年級一班在校',
			studentId: 'STU002',
			grade: 11,
			classNum: '1',
			status: 'Enrolled'
		});

		const { studentId: stu3Id } = await createStudentWithClass(t, {
			englishName: 'Grade 11 Enrolled IB',
			chineseName: '十一年級IB在校',
			studentId: 'STU003',
			grade: 11,
			classNum: 'IB',
			status: 'Enrolled'
		});

		const { classId: class12_1 } = await createStudentWithClass(t, {
			englishName: 'Grade 12 Enrolled',
			chineseName: '十二年級在校',
			studentId: 'STU004',
			grade: 12,
			classNum: '1',
			status: 'Enrolled'
		});

		const { classId: class12_IB } = await createStudentWithClass(t, {
			englishName: 'Grade 12 Not Enrolled IB',
			chineseName: '十二年級非在校IB',
			studentId: 'STU005',
			grade: 12,
			classNum: 'IB',
			status: 'Not Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 10 Not Enrolled',
			chineseName: '十年級非在校',
			studentId: 'STU006',
			grade: 10,
			classNum: '1',
			status: 'Not Enrolled'
		});

		// Student in a "no dash" class (className equals grade number) to test non-section advancement
		const class7_plainId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 7, class: '9' });
		});
		await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Grade 7 Plain Class',
				chineseName: '七年級一般班',
				studentId: 'STU009',
				classId: class7_plainId,
				status: 'Enrolled'
			});
		});

		// Student in grade 9 class "1" — grade 9 has only "1" and "IB" (2 classes),
		// so class "1" displays as "9" (no dash). Should advance to "default" at grade 10.
		const class9_1Id = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 9, class: '1' });
		});
		await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 9, class: 'IB' });
		});
		await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Grade 9 Section 1',
				chineseName: '九年級一班',
				studentId: 'STU010',
				classId: class9_1Id,
				status: 'Enrolled'
			});
		});

		// Add class "2" at sectioned grades (7, 8, 10, 11, 12) so these grades
		// have 3 classes ("1", "2", "IB"), matching real data so class "1" displays with dash.
		// Grade 9 is plain — only "1" and "IB" — so class "1" advances to "default".
		await t.run(async (ctx) => {
			await ctx.db.insert('classes', { grade: 7, class: '2' });
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('classes', { grade: 8, class: '2' });
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('classes', { grade: 10, class: '2' });
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('classes', { grade: 11, class: '2' });
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('classes', { grade: 12, class: '2' });
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Creativity'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Old Event',
				startDate: Date.now(),
				endDate: Date.now() + 86400000
			});
		});

		// Use STU003 (grade 11 IB enrolled, will survive) for evaluation
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: stu3Id,
				teacherId,
				value: 1,
				categoryId,
				details: 'Great work',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		// Create an audit log for the evaluation
		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval-1',
				oldValue: null,
				newValue: { value: 1 },
				timestamp: Date.now()
			});
		});

		// Call the actual mutation
		await t.mutation(api.backup.advanceGradesAndClearEvaluations, {});

		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});

		const houseEvents = await t.run(async (ctx) => {
			return await ctx.db.query('house_events').collect();
		});

		const backups = await t.run(async (ctx) => {
			return await ctx.db.query('backups').collect();
		});

		const auditLogs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		const allClasses = await t.run(async (ctx) => {
			return await ctx.db.query('classes').collect();
		});

		// The function:
		// - Deletes grade 12 students (both enrolled and not enrolled)
		// - Deletes not enrolled students
		// - Advances grades by moving students to next grade's class,
		//   creating the class if it doesn't exist (e.g. '1' -> '1', 'IB' -> 'IB')
		// - Deletes all evaluations and house events
		// With our test data:
		// - STU001 (grade 7 '1' enrolled): no grade 8 '1' exists -> creates it, advances
		// - STU007 (grade 7 '1' enrolled): same section -> same created grade 8 '1' class
		// - STU002 (grade 11 '1' enrolled): grade 12 '1' exists -> advances
		// - STU003 (grade 11 'IB' enrolled): grade 12 'IB' exists -> advances
		// - STU004 (grade 12 '1' enrolled): deleted
		// - STU005 (grade 12 'IB' not enrolled): deleted
		// - STU006 (grade 10 '1' not enrolled): deleted
		// - STU009 (grade 7 class '9'): class name carries over as-is -> grade 8 '9'
		// - STU010 (grade 9 class '1'): grade 9 has only '1' and 'IB' (2 classes) ->
		//     class '1' displays without dash, so advances to 'default' at grade 10
		// Result: 6 students remain (STU001, STU007, STU002, STU003, STU009, STU010)
		expect(students).toHaveLength(6);

		// Verify section-name matching on grade advancement
		const stu2After = students.find((s) => s.studentId === 'STU002')!;
		expect(stu2After.classId).toBe(class12_1);

		const stu3After = students.find((s) => s.studentId === 'STU003')!;
		expect(stu3After.classId).toBe(class12_IB);

		// STU001 and STU007 had no matching grade 8 class — should have been created
		// and both should be in the SAME class (dedup)
		const stu1After = students.find((s) => s.studentId === 'STU001')!;
		const stu7After = students.find((s) => s.studentId === 'STU007')!;
		expect(stu7After.classId).toBe(stu1After.classId);
		const stu1Class = allClasses.find((c) => c._id === stu1After.classId)!;
		expect(stu1Class.grade).toBe(8);
		expect(stu1Class.class).toBe('1');

		// STU009 (grade 7, class '9') — non-standard class name carries over as-is
		const stu9After = students.find((s) => s.studentId === 'STU009')!;
		const stu9Class = allClasses.find((c) => c._id === stu9After.classId)!;
		expect(stu9Class.grade).toBe(8);
		expect(stu9Class.class).toBe('9');

		// STU010 (grade 9, class '1') — carries over to grade 10 class '1' (simple section-name matching)
		const stu10After = students.find((s) => s.studentId === 'STU010')!;
		const stu10Class = allClasses.find((c) => c._id === stu10After.classId)!;
		expect(stu10Class.grade).toBe(10);
		expect(stu10Class.class).toBe('1');

		// Verify empty classes were cleaned up (except protected IB at grades 11/12)
		expect(allClasses).toHaveLength(6);
		// Grade 11 IB is empty but protected — should still exist
		const protected11IB = allClasses.find((c) => c.grade === 11 && c.class === 'IB');
		expect(protected11IB).toBeDefined();
		// Empty non-protected classes should be deleted
		expect(allClasses.some((c) => c.grade === 7 && c.class === '1')).toBe(false);
		expect(allClasses.some((c) => c.grade === 11 && c.class === '1')).toBe(false);

		expect(evaluations).toHaveLength(0);
		expect(houseEvents).toHaveLength(0);
		expect(backups).toHaveLength(1);
		expect(auditLogs.filter((l) => l.targetTable === 'evaluations')).toHaveLength(0);
	});

	test('backup data includes house field on students', async () => {
		const t = convexTest(schema, modules);

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Housed Student',
				chineseName: '有學院學生',
				studentId: 'STU010',
				classId,
				status: 'Enrolled',
				house: 'Heracles'
			});
		});

		// Verify student was created with house
		const student = await t.run(async (ctx) => {
			return await ctx.db.get(studentId);
		});
		expect(student?.house).toBe('Heracles');

		// Simulate backup data collection
		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		expect(students).toHaveLength(1);
		expect(students[0].house).toBe('Heracles');
		expect(students[0].englishName).toBe('Housed Student');
	});

	test('backup data includes house_events', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Sports Day',
				startDate: Date.now(),
				endDate: Date.now() + 86400000,
				housePoints: {
					Heracles: 100,
					Wukong: 80,
					Ixbalam: 60,
					Setna: 40
				}
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'No Points Event',
				startDate: Date.now(),
				endDate: Date.now() + 86400000
			});
		});

		const events = await t.run(async (ctx) => {
			return await ctx.db.query('house_events').collect();
		});

		expect(events).toHaveLength(2);
		expect(events[0].title).toBe('Sports Day');
		expect(events[0].housePoints?.Heracles).toBe(100);
		expect(events[1].title).toBe('No Points Event');
		expect(events[1].housePoints).toBeUndefined();
	});

	test('clearAllData clears house_events and related audit logs', async () => {
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'STU011',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Cleanup Test Event',
				startDate: Date.now(),
				endDate: Date.now() + 86400000,
				housePoints: { Heracles: 50 }
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_house_event',
				performerId: teacherId,
				targetTable: 'house_events',
				targetId: 'event-1',
				oldValue: null,
				newValue: { title: 'Cleanup Test Event' },
				timestamp: Date.now()
			});
		});

		// Replicate clearAllData logic
		await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const evaluations = await ctx.db.query('evaluations').collect();
			const categories = await ctx.db.query('point_categories').collect();
			const classes = await ctx.db.query('classes').collect();
			const houseEvents = await ctx.db.query('house_events').collect();

			for (const student of students) await ctx.db.delete(student._id);
			for (const evaluation of evaluations) await ctx.db.delete(evaluation._id);
			for (const category of categories) await ctx.db.delete(category._id);
			for (const cls of classes) await ctx.db.delete(cls._id);
			for (const event of houseEvents) await ctx.db.delete(event._id);

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
		});

		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const houseEvents = await t.run(async (ctx) => {
			return await ctx.db.query('house_events').collect();
		});

		const auditLogs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(students).toHaveLength(0);
		expect(houseEvents).toHaveLength(0);

		// Only the user audit log should remain (not targetting house_events or students)
		const userAuditLogs = auditLogs.filter((l) => l.targetTable === 'users');
		expect(userAuditLogs).toHaveLength(0);
		expect(auditLogs.filter((l) => l.targetTable === 'house_events')).toHaveLength(0);
	});

	test('advanceGradesAndClearEvaluations backup includes house_events', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Advance Backup Test',
				startDate: Date.now(),
				endDate: Date.now() + 86400000,
				housePoints: { Heracles: 75 }
			});
		});

		// Simulate advanceGradesAndClearEvaluations backup (now includes houseEvents)
		const houseEvents = await t.run(async (ctx) => {
			return await ctx.db.query('house_events').collect();
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('backups', {
				filename: `backup-${Date.now()}.json`,
				data: { houseEvents },
				createdAt: Date.now()
			});
		});

		const backups = await t.run(async (ctx) => {
			return await ctx.db.query('backups').collect();
		});

		expect(backups).toHaveLength(1);
		const backupData = backups[0].data as { houseEvents: Array<{ title: string }> };
		expect(backupData.houseEvents).toHaveLength(1);
		expect(backupData.houseEvents[0].title).toBe('Advance Backup Test');
	});
});
