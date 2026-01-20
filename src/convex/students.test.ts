import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

describe('students.create', () => {
	it('creates a student with valid data', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'S9999',
			grade: 10,
			status: 'Enrolled'
		});

		const students = await t.query(api.students.list);
		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('Test Student');
		expect(students[0].studentId).toBe('S9999');
		expect(students[0].grade).toBe(10);
		expect(students[0].status).toBe('Enrolled');
	});

	it('throws error for duplicate student ID', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'First Student',
			chineseName: '第一學生',
			studentId: 'S1000',
			grade: 9,
			status: 'Enrolled'
		});

		await expect(async () => {
			await t.mutation(api.students.create, {
				englishName: 'Second Student',
				chineseName: '第二學生',
				studentId: 'S1000',
				grade: 10,
				status: 'Enrolled'
			});
		}).rejects.toThrowError('Student ID already exists');
	});

	it('throws error for invalid grade (below 7)', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.students.create, {
				englishName: 'Young Student',
				chineseName: '年輕學生',
				studentId: 'S0001',
				grade: 5,
				status: 'Enrolled'
			});
		}).rejects.toThrowError('Grade must be between 7 and 12');
	});

	it('throws error for invalid grade (above 12)', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.students.create, {
				englishName: 'Old Student',
				chineseName: '老學生',
				studentId: 'S0013',
				grade: 13,
				status: 'Enrolled'
			});
		}).rejects.toThrowError('Grade must be between 7 and 12');
	});
});

describe('students.update', () => {
	it('updates student successfully', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Original Name',
			chineseName: '原名',
			studentId: 'S2000',
			grade: 10,
			status: 'Enrolled'
		});

		const student = (await t.query(api.students.list))[0];

		await t.mutation(api.students.update, {
			id: student._id,
			englishName: 'Updated Name',
			chineseName: '更新名',
			studentId: 'S2000',
			grade: 11,
			status: 'Not Enrolled'
		});

		const updatedStudent = (await t.query(api.students.list))[0];
		expect(updatedStudent.englishName).toBe('Updated Name');
		expect(updatedStudent.grade).toBe(11);
		expect(updatedStudent.status).toBe('Not Enrolled');
	});

	it('throws error when updating to duplicate student ID', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Student A',
			chineseName: '學生A',
			studentId: 'S3001',
			grade: 9,
			status: 'Enrolled'
		});

		const studentB = await t.mutation(api.students.create, {
			englishName: 'Student B',
			chineseName: '學生B',
			studentId: 'S3002',
			grade: 10,
			status: 'Enrolled'
		});

		await expect(async () => {
			await t.mutation(api.students.update, {
				id: studentB,
				englishName: 'Student B',
				chineseName: '學生B',
				studentId: 'S3001',
				grade: 10,
				status: 'Enrolled'
			});
		}).rejects.toThrowError('Student ID already exists');
	});
});

describe('students.remove', () => {
	it('removes student without evaluations', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'To Delete',
			chineseName: '待刪除',
			studentId: 'S4000',
			grade: 10,
			status: 'Enrolled'
		});

		let students = await t.query(api.students.list);
		expect(students).toHaveLength(1);

		await t.mutation(api.students.remove, { id: studentId });

		students = await t.query(api.students.list);
		expect(students).toHaveLength(0);
	});

	it('throws error when removing student with evaluations', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Has Evaluations',
			chineseName: '有評估',
			studentId: 'S4001',
			grade: 10,
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 5,
				category: 'Academic',
				subCategory: 'Homework',
				details: 'Test evaluation',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		await expect(async () => {
			await t.mutation(api.students.remove, { id: studentId });
		}).rejects.toThrowError('Cannot delete student with existing evaluations');
	});
});

describe('students.changeStatus', () => {
	it('changes student status to Not Enrolled', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Active Student',
			chineseName: '活躍學生',
			studentId: 'S5000',
			grade: 10,
			status: 'Enrolled'
		});

		await t.mutation(api.students.changeStatus, {
			id: studentId,
			status: 'Not Enrolled'
		});

		const student = (await t.query(api.students.list))[0];
		expect(student.status).toBe('Not Enrolled');
	});

	it('changes student status to Enrolled', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Inactive Student',
			chineseName: '不活躍學生',
			studentId: 'S5001',
			grade: 11,
			status: 'Not Enrolled'
		});

		await t.mutation(api.students.changeStatus, {
			id: studentId,
			status: 'Enrolled'
		});

		const student = (await t.query(api.students.list))[0];
		expect(student.status).toBe('Enrolled');
	});
});

describe('students.list', () => {
	it('returns all students sorted by name', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Charlie',
			chineseName: '查理',
			studentId: 'S6001',
			grade: 10,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Alice',
			chineseName: '艾莉',
			studentId: 'S6002',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Bob',
			chineseName: '鮑勃',
			studentId: 'S6003',
			grade: 11,
			status: 'Enrolled'
		});

		const students = await t.query(api.students.list);
		expect(students).toHaveLength(3);
		expect(students[0].englishName).toBe('Alice');
		expect(students[1].englishName).toBe('Bob');
		expect(students[2].englishName).toBe('Charlie');
	});

	it('filters by status', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Enrolled Student',
			chineseName: '在校學生',
			studentId: 'S7001',
			grade: 10,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Not Enrolled Student',
			chineseName: '不在校學生',
			studentId: 'S7002',
			grade: 11,
			status: 'Not Enrolled'
		});

		const enrolled = await t.query(api.students.list, { status: 'Enrolled' });
		expect(enrolled).toHaveLength(1);
		expect(enrolled[0].englishName).toBe('Enrolled Student');
	});

	it('filters by grade', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Grade 9',
			chineseName: '九年級',
			studentId: 'S8001',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Grade 10',
			chineseName: '十年級',
			studentId: 'S8002',
			grade: 10,
			status: 'Enrolled'
		});

		const grade9 = await t.query(api.students.list, { grade: 9 });
		expect(grade9).toHaveLength(1);
		expect(grade9[0].englishName).toBe('Grade 9');
	});

	it('filters by search term', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Alice Smith',
			chineseName: '史密斯艾莉',
			studentId: 'S9001',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Bob Jones',
			chineseName: '瓊斯鮑勃',
			studentId: 'S9002',
			grade: 10,
			status: 'Enrolled'
		});

		const results = await t.query(api.students.list, { search: 'Alice' });
		expect(results).toHaveLength(1);
		expect(results[0].englishName).toBe('Alice Smith');

		const byId = await t.query(api.students.list, { search: 'S9002' });
		expect(byId).toHaveLength(1);
		expect(byId[0].englishName).toBe('Bob Jones');
	});
});

describe('students.removeWithCascade', () => {
	it('removes student and all their evaluations', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Cascade Student',
			chineseName: '級聯學生',
			studentId: 'S10000',
			grade: 10,
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 5,
				category: 'Academic',
				subCategory: 'Homework',
				details: 'Evaluation 1',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 10,
				category: 'Activity',
				subCategory: 'Sports',
				details: 'Evaluation 2',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const result = await t.mutation(api.students.removeWithCascade, { id: studentId });

		expect(result.deletedStudent).toBe('Cascade Student');
		expect(result.deletedEvaluations).toBe(2);

		const students = await t.query(api.students.list);
		expect(students).toHaveLength(0);
	});

	it('throws error when student not found', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.students.removeWithCascade, {
				id: 'fake-student-id' as any
			});
		}).rejects.toThrowError();
	});
});
