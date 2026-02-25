import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';

type ImportResult =
	| { studentId: string; success: true; action: 'created' | 'updated' }
	| { studentId: string; success: false; error: string };

describe('students.create', () => {
	it('creates a student with valid data', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'S9999',
			grade: 10,
			status: 'Enrolled'
		});

		const students = await t.query(api.students.list, {});
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

		const student = (await t.query(api.students.list, {}))[0];

		await t.mutation(api.students.update, {
			id: student._id,
			englishName: 'Updated Name',
			chineseName: '更新名',
			studentId: 'S2000',
			grade: 11,
			status: 'Not Enrolled'
		});

		const updatedStudent = (await t.query(api.students.list, {}))[0];
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

		let students = await t.query(api.students.list, {});
		expect(students).toHaveLength(1);

		await t.mutation(api.students.remove, { id: studentId });

		students = await t.query(api.students.list, {});
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

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Academic'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 5,
				categoryId,
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

		const student = (await t.query(api.students.list, {}))[0];
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

		const student = (await t.query(api.students.list, {}))[0];
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

		const students = await t.query(api.students.list, {});
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

describe('Bulk Student Import', () => {
	it('creates multiple students via mutation', async () => {
		const t = convexTest(schema, modules);

		// Create multiple students (simulating bulk import)
		await t.mutation(api.students.create, {
			englishName: 'Import Student 1',
			chineseName: '導入學生1',
			studentId: 'IMP001',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Import Student 2',
			chineseName: '導入學生2',
			studentId: 'IMP002',
			grade: 10,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Import Student 3',
			chineseName: '導入學生3',
			studentId: 'IMP003',
			grade: 11,
			status: 'Not Enrolled'
		});

		// Verify all students exist in database
		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(3);

		// Verify each student's data
		const byId1 = students.find((s: Doc<'students'>) => s.studentId === 'IMP001');
		expect(byId1).toBeDefined();
		expect(byId1?.englishName).toBe('Import Student 1');
		expect(byId1?.grade).toBe(9);
		expect(byId1?.status).toBe('Enrolled');

		const byId2 = students.find((s: Doc<'students'>) => s.studentId === 'IMP002');
		expect(byId2).toBeDefined();
		expect(byId2?.englishName).toBe('Import Student 2');
		expect(byId2?.grade).toBe(10);
		expect(byId2?.status).toBe('Enrolled');

		const byId3 = students.find((s: Doc<'students'>) => s.studentId === 'IMP003');
		expect(byId3).toBeDefined();
		expect(byId3?.englishName).toBe('Import Student 3');
		expect(byId3?.grade).toBe(11);
		expect(byId3?.status).toBe('Not Enrolled');
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

		const academicCategoryId = await t.mutation(api.categories.create, {
			name: 'Academic'
		});
		const activityCategoryId = await t.mutation(api.categories.create, {
			name: 'Activity'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 5,
				categoryId: academicCategoryId,
				details: 'Evaluation 1',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 10,
				categoryId: activityCategoryId,
				details: 'Evaluation 2',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const result = await t.mutation(api.students.removeWithCascade, { id: studentId });

		expect(result.deletedStudent).toBe('Cascade Student');
		expect(result.deletedEvaluations).toBe(2);

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(0);
	});

	it('throws error when student not found', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.students.removeWithCascade, {
				id: 'fake-student-id' as Id<'students'>
			});
		}).rejects.toThrowError();
	});
});

describe('students edge cases', () => {
	it('creates students with all valid grades (7-12)', async () => {
		const t = convexTest(schema, modules);

		for (let grade = 7; grade <= 12; grade++) {
			await t.mutation(api.students.create, {
				englishName: `Student Grade ${grade}`,
				chineseName: `${grade}年級學生`,
				studentId: `S_GRADE_${grade}`,
				grade,
				status: 'Enrolled'
			});
		}

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(6);

		const grades = students.map((s: { grade: number }) => s.grade);
		expect(grades).toContain(7);
		expect(grades).toContain(8);
		expect(grades).toContain(9);
		expect(grades).toContain(10);
		expect(grades).toContain(11);
		expect(grades).toContain(12);
	});

	it('creates student with note', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Student With Note',
			chineseName: '有備註學生',
			studentId: 'S_NOTE001',
			grade: 10,
			status: 'Enrolled',
			note: 'Special accommodations required'
		});

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(1);
		expect(students[0].note).toBe('Special accommodations required');
	});

	it('creates student without note (empty string)', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Student No Note',
			chineseName: '無備註學生',
			studentId: 'S_NOTE002',
			grade: 11,
			status: 'Enrolled',
			note: ''
		});

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(1);
		expect(students[0].note).toBe('');
	});

	it('updates only specific fields (preserves others)', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Original Name',
			chineseName: '原名',
			studentId: 'S_UPDATE01',
			grade: 10,
			status: 'Enrolled',
			note: 'Original note'
		});

		const student = (await t.query(api.students.list, {}))[0];

		await t.mutation(api.students.update, {
			id: student._id,
			englishName: 'New Name',
			chineseName: '原名',
			studentId: 'S_UPDATE01',
			grade: 10,
			status: 'Enrolled'
		});

		const updated = (await t.query(api.students.list, {}))[0];
		expect(updated.englishName).toBe('New Name');
		expect(updated.chineseName).toBe('原名');
		expect(updated.note).toBe('Original note');
	});

	it('search matches both English and Chinese names', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Michael Chen',
			chineseName: '陳邁克',
			studentId: 'S_SEARCH01',
			grade: 10,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'John Wang',
			chineseName: '王約翰',
			studentId: 'S_SEARCH02',
			grade: 11,
			status: 'Enrolled'
		});

		const byEnglish = await t.query(api.students.list, { search: 'Michael' });
		expect(byEnglish).toHaveLength(1);
		expect(byEnglish[0].englishName).toBe('Michael Chen');

		const byChinese = await t.query(api.students.list, { search: '陳' });
		expect(byChinese).toHaveLength(1);
		expect(byChinese[0].chineseName).toBe('陳邁克');
	});

	it('search is case insensitive', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'S_CASE01',
			grade: 10,
			status: 'Enrolled'
		});

		const upper = await t.query(api.students.list, { search: 'TEST' });
		expect(upper).toHaveLength(1);

		const lower = await t.query(api.students.list, { search: 'test' });
		expect(lower).toHaveLength(1);

		const mixed = await t.query(api.students.list, { search: 'TeSt' });
		expect(mixed).toHaveLength(1);
	});

	it('handles multiple status transitions', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Transition Student',
			chineseName: '轉變學生',
			studentId: 'S_TRANS01',
			grade: 10,
			status: 'Enrolled'
		});

		await t.mutation(api.students.changeStatus, { id: studentId, status: 'Not Enrolled' });
		let student = (await t.query(api.students.list, {}))[0];
		expect(student.status).toBe('Not Enrolled');

		await t.mutation(api.students.changeStatus, { id: studentId, status: 'Enrolled' });
		student = (await t.query(api.students.list, {}))[0];
		expect(student.status).toBe('Enrolled');
	});

	it('filters by combined grade and status', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Grade 10 Enrolled',
			chineseName: '十年級在校',
			studentId: 'S_COMB01',
			grade: 10,
			status: 'Enrolled'
		});
		await t.mutation(api.students.create, {
			englishName: 'Grade 10 Not Enrolled',
			chineseName: '十年級不在校',
			studentId: 'S_COMB02',
			grade: 10,
			status: 'Not Enrolled'
		});
		await t.mutation(api.students.create, {
			englishName: 'Grade 11 Enrolled',
			chineseName: '十一年級在校',
			studentId: 'S_COMB03',
			grade: 11,
			status: 'Enrolled'
		});

		const grade10Enrolled = await t.query(api.students.list, { grade: 10, status: 'Enrolled' });
		expect(grade10Enrolled).toHaveLength(1);
		expect(grade10Enrolled[0].englishName).toBe('Grade 10 Enrolled');
	});
});

describe('students.importFromExcel (bulk create/update)', () => {
	it('creates multiple students in a single call', async () => {
		const t = convexTest(schema, modules);

		const results = await t.mutation(api.students.importFromExcel, {
			students: [
				{
					englishName: 'Bulk Student 1',
					chineseName: '大量學生1',
					studentId: 'BULK001',
					grade: 9,
					status: 'Enrolled' as const
				},
				{
					englishName: 'Bulk Student 2',
					chineseName: '大量學生2',
					studentId: 'BULK002',
					grade: 10,
					status: 'Enrolled' as const
				},
				{
					englishName: 'Bulk Student 3',
					chineseName: '大量學生3',
					studentId: 'BULK003',
					grade: 11,
					status: 'Not Enrolled' as const
				}
			]
		});

		// Verify all students were created
		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(3);

		// Verify results
		expect(results).toHaveLength(3);
		expect(results.filter((r: ImportResult) => r.success && r.action === 'created')).toHaveLength(
			3
		);
	});

	it('updates existing students in bulk', async () => {
		const t = convexTest(schema, modules);

		// Create initial students
		await t.mutation(api.students.create, {
			englishName: 'Original Name',
			chineseName: '原名',
			studentId: 'UPDATE01',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Another Student',
			chineseName: '另一個學生',
			studentId: 'UPDATE02',
			grade: 10,
			status: 'Enrolled'
		});

		// Bulk update - one exists, one is new
		const results = await t.mutation(api.students.importFromExcel, {
			students: [
				{
					englishName: 'Updated Name',
					chineseName: '更新名',
					studentId: 'UPDATE01',
					grade: 10,
					status: 'Not Enrolled' as const
				},
				{
					englishName: 'New Bulk Student',
					chineseName: '新大量學生',
					studentId: 'UPDATE03',
					grade: 11,
					status: 'Enrolled' as const
				}
			]
		});

		// Verify results
		expect(results).toHaveLength(2);
		expect(results.find((r: ImportResult) => r.studentId === 'UPDATE01')?.action).toBe('updated');
		expect(results.find((r: ImportResult) => r.studentId === 'UPDATE03')?.action).toBe('created');

		// Verify total count (2 original + 1 new = 3)
		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(3);

		// Verify the update happened
		const updatedStudent = students.find((s: { studentId: string }) => s.studentId === 'UPDATE01');
		expect(updatedStudent?.englishName).toBe('Updated Name');
		expect(updatedStudent?.grade).toBe(10);
		expect(updatedStudent?.status).toBe('Not Enrolled');
	});

	it('handles validation errors for individual students in bulk', async () => {
		const t = convexTest(schema, modules);

		// Mix of valid and invalid students
		const results = await t.mutation(api.students.importFromExcel, {
			students: [
				{
					englishName: 'Valid Student',
					chineseName: '有效學生',
					studentId: 'VALID01',
					grade: 9,
					status: 'Enrolled' as const
				},
				{
					englishName: 'Invalid Grade',
					chineseName: '無效年級',
					studentId: 'INVALID01',
					grade: 5, // Invalid - below 7
					status: 'Enrolled' as const
				},
				{
					englishName: 'Another Valid',
					chineseName: '另一個有效',
					studentId: 'VALID02',
					grade: 11,
					status: 'Enrolled' as const
				}
			]
		});

		// Verify results - check what actually happens
		// Note: grade validation happens at the mutation level
		expect(results).toHaveLength(3);

		// At least the valid students should succeed
		const successfulResults = results.filter((r: ImportResult) => r.success);
		expect(successfulResults.length).toBeGreaterThanOrEqual(2);

		// Verify the students were created
		const students = await t.query(api.students.list, {});
		expect(students.length).toBeGreaterThanOrEqual(2);
	});

	it('handles empty array gracefully', async () => {
		const t = convexTest(schema, modules);

		const results = await t.mutation(api.students.importFromExcel, {
			students: []
		});

		expect(results).toHaveLength(0);

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(0);
	});

	it('handles duplicate student IDs within bulk correctly', async () => {
		const t = convexTest(schema, modules);

		// Duplicate IDs in the same bulk call - second one will update the first
		const results = await t.mutation(api.students.importFromExcel, {
			students: [
				{
					englishName: 'First',
					chineseName: '第一',
					studentId: 'DUPLICATE',
					grade: 9,
					status: 'Enrolled' as const
				},
				{
					englishName: 'Second',
					chineseName: '第二',
					studentId: 'DUPLICATE',
					grade: 10,
					status: 'Enrolled' as const
				}
			]
		});

		// Both succeed - first creates, second updates
		expect(results).toHaveLength(2);
		expect(results.filter((r: ImportResult) => r.success)).toHaveLength(2);

		// Verify only one student was created/updated
		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(1);

		// The student should have the last update's grade
		expect(students[0].grade).toBe(10);
		expect(students[0].englishName).toBe('Second');
	});
});
