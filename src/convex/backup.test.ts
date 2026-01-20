import { expect, test, describe } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { modules } from './test.setup';

describe('backup clearing logic', () => {
	test('clearing evaluations clears related audit logs', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Test Student',
				chineseName: '測試學生',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
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
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				category: 'Creativity',
				subCategory: 'Leadership',
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

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Test Student',
				chineseName: '測試學生',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				category: 'Creativity',
				subCategory: 'Leadership',
				details: 'Great work',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('point_categories', {
				name: 'Creativity',
				subCategories: ['Leadership']
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

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Enrolled Student',
				chineseName: '在校學生',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Not Enrolled Student',
				chineseName: '非在校學生',
				studentId: 'STU002',
				grade: 11,
				status: 'Not Enrolled'
			});
		});

		await t.run(async (ctx) => {
			const students = await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('status'), 'Enrolled'))
				.collect();
			for (const student of students) {
				await ctx.db.patch(student._id, { grade: student.grade + 1 });
			}
		});

		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const enrolled = students.find((s) => s.studentId === 'STU001');
		const notEnrolled = students.find((s) => s.studentId === 'STU002');

		expect(enrolled?.grade).toBe(11);
		expect(notEnrolled?.grade).toBe(11);
	});

	test('backup and restore preserves data structure', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Restored Student',
				chineseName: '恢復學生',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled',
				note: 'Restored from backup'
			});
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
				name: 'Restored Category',
				subCategories: ['Sub1', 'Sub2']
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
		expect(categories[0].subCategories).toEqual(['Sub1', 'Sub2']);
	});

	test('advanceGradesAndClearEvaluations deletes grade 12 and not enrolled, advances remaining', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Grade 7 Enrolled',
				chineseName: '七年級在校',
				studentId: 'STU001',
				grade: 7,
				status: 'Enrolled'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Grade 11 Enrolled',
				chineseName: '十一年級在校',
				studentId: 'STU002',
				grade: 11,
				status: 'Enrolled'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Grade 12 Enrolled',
				chineseName: '十二年級在校',
				studentId: 'STU003',
				grade: 12,
				status: 'Enrolled'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Grade 12 Not Enrolled',
				chineseName: '十二年級非在校',
				studentId: 'STU004',
				grade: 12,
				status: 'Not Enrolled'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Grade 10 Not Enrolled',
				chineseName: '十年級非在校',
				studentId: 'STU005',
				grade: 10,
				status: 'Not Enrolled'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const studentId = await t.run(async (ctx) => {
			return (await ctx.db.query('students').collect())[0]._id;
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				category: 'Creativity',
				subCategory: 'Leadership',
				details: 'Great work',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const evaluations = await ctx.db.query('evaluations').collect();
			const users = await ctx.db.query('users').collect();
			const categories = await ctx.db.query('point_categories').collect();

			await ctx.db.insert('backups', {
				filename: `backup-${Date.now()}.json`,
				data: { students, evaluations, users, categories },
				createdAt: Date.now()
			});

			for (const evaluation of evaluations) {
				await ctx.db.delete(evaluation._id);
			}

			const auditLogs = await ctx.db.query('audit_logs').collect();
			for (const log of auditLogs) {
				if (log.targetTable === 'evaluations') {
					await ctx.db.delete(log._id);
				}
			}

			const grade12Students = await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('grade'), 12))
				.collect();
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

			const enrolledStudents = await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('status'), 'Enrolled'))
				.collect();

			for (const student of enrolledStudents) {
				if (student.grade >= 7 && student.grade <= 11) {
					await ctx.db.patch(student._id, { grade: student.grade + 1 });
				}
			}
		});

		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});

		const backups = await t.run(async (ctx) => {
			return await ctx.db.query('backups').collect();
		});

		expect(students).toHaveLength(2);
		expect(students.find((s) => s.studentId === 'STU001')?.grade).toBe(8);
		expect(students.find((s) => s.studentId === 'STU002')?.grade).toBe(12);
		expect(students.find((s) => s.studentId === 'STU003')).toBeUndefined();
		expect(students.find((s) => s.studentId === 'STU004')).toBeUndefined();
		expect(students.find((s) => s.studentId === 'STU005')).toBeUndefined();

		expect(evaluations).toHaveLength(0);
		expect(backups).toHaveLength(1);
	});
});
