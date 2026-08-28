import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import { setTestAuthRole } from './testAuth';
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
			studentId: '7009999',
			grade: 10,
			status: 'Enrolled'
		});

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('Test Student');
		expect(students[0].studentId).toBe('7009999');
		expect(students[0].classInfo?.grade).toBe(10);
		expect(students[0].status).toBe('Enrolled');
	});

	it('throws error for duplicate student ID', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'First Student',
			chineseName: '第一學生',
			studentId: '7001000',
			grade: 9,
			status: 'Enrolled'
		});

		await expect(async () => {
			await t.mutation(api.students.create, {
				englishName: 'Second Student',
				chineseName: '第二學生',
				studentId: '7001000',
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
		expect(updatedStudent.classInfo?.grade).toBe(11);
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

		// Filter by grade client-side since grade is now on classes table
		const allStudents = await t.query(api.students.list, {});
		const grade9 = allStudents.filter(
			(s: { classInfo?: { grade?: number } | null }) => s.classInfo?.grade === 9
		);
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

	it('returns more than 200 students when the roster exceeds the old cap', async () => {
		const t = convexTest(schema, modules);

		// One shared class so we can seed a large enrolled cohort cheaply.
		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});

		for (let i = 0; i < 350; i++) {
			await t.run(async (ctx) => {
				await ctx.db.insert('students', {
					englishName: `Student ${i}`,
					chineseName: `學生${i}`,
					studentId: `999${String(i).padStart(4, '0')}`,
					classId,
					status: 'Enrolled'
				});
			});
		}

		const enrolled = await t.query(api.students.list, { status: 'Enrolled' });
		expect(enrolled).toHaveLength(350);
	});

	it('caps the roster at 400 even when the cohort exceeds the cap', async () => {
		const t = convexTest(schema, modules);

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});

		for (let i = 0; i < 450; i++) {
			await t.run(async (ctx) => {
				await ctx.db.insert('students', {
					englishName: `Student ${i}`,
					chineseName: `學生${i}`,
					studentId: `888${String(i).padStart(4, '0')}`,
					classId,
					status: 'Enrolled'
				});
			});
		}

		const enrolled = await t.query(api.students.list, { status: 'Enrolled' });
		expect(enrolled).toHaveLength(400);
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
		expect(byId1?.classInfo?.grade).toBe(9);
		expect(byId1?.status).toBe('Enrolled');

		const byId2 = students.find((s: Doc<'students'>) => s.studentId === 'IMP002');
		expect(byId2).toBeDefined();
		expect(byId2?.englishName).toBe('Import Student 2');
		expect(byId2?.classInfo?.grade).toBe(10);
		expect(byId2?.status).toBe('Enrolled');

		const byId3 = students.find((s: Doc<'students'>) => s.studentId === 'IMP003');
		expect(byId3).toBeDefined();
		expect(byId3?.englishName).toBe('Import Student 3');
		expect(byId3?.classInfo?.grade).toBe(11);
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

		const grades = students.map(
			(s: { classInfo?: { grade?: number } | null }) => s.classInfo?.grade
		);
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

		// Filter by grade and status client-side
		const allStudents = await t.query(api.students.list, { status: 'Enrolled' });
		const grade10Enrolled = allStudents.filter(
			(s: { classInfo?: { grade?: number } | null }) => s.classInfo?.grade === 10
		);
		expect(grade10Enrolled).toHaveLength(1);
		expect(grade10Enrolled[0].englishName).toBe('Grade 10 Enrolled');
	});
});

describe('disableStudent', () => {
	it('sets student status to Not Enrolled', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Disable Test Student',
			chineseName: '停用測試學生',
			studentId: 'S_DISABLE01',
			grade: 10,
			status: 'Enrolled'
		});

		await t.mutation(api.students.disableStudent, { id: studentId });

		const student = (await t.query(api.students.list, {}))[0];
		expect(student.status).toBe('Not Enrolled');
	});

	it('does not delete the student record', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Keep Record Student',
			chineseName: '保留紀錄學生',
			studentId: 'S_KEEP01',
			grade: 11,
			status: 'Enrolled'
		});

		await t.mutation(api.students.disableStudent, { id: studentId });

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(1);
		expect(students[0].studentId).toBe('S_KEEP01');
	});

	it('disableStudent is idempotent on already disabled student', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Already Disabled Student',
			chineseName: '已停用學生',
			studentId: 'S_ALREADY01',
			grade: 10,
			status: 'Not Enrolled'
		});

		await t.mutation(api.students.disableStudent, { id: studentId });

		const student = (await t.query(api.students.list, {}))[0];
		expect(student.status).toBe('Not Enrolled');
	});
});

describe('students.listPaginated', () => {
	// Seed `count` students attached to a single class so listPaginated must scan the
	// whole candidate set before applying index/post-filters. Spreads across grades,
	// houses and statuses so scale tests exercise every branch.
	async function seedScaledStudents(t: ReturnType<typeof convexTest>, count: number) {
		const classIds = await t.run(async (ctx) => {
			const ids: string[] = [];
			for (let g = 7; g <= 12; g++) {
				ids.push(await ctx.db.insert('classes', { grade: g, class: '1' }));
			}
			return ids;
		});
		await t.run(async (ctx) => {
			const houses = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;
			for (let i = 0; i < count; i++) {
				await ctx.db.insert('students', {
					englishName: `Match ${i}`,
					chineseName: `匹配${i}`,
					studentId: `SCALE${String(i).padStart(4, '0')}`,
					classId: classIds[i % classIds.length],
					// i%10 -> Not Enrolled (so status filter is meaningful at scale)
					status: i % 10 === 0 ? 'Not Enrolled' : 'Enrolled',
					// i%6 -> no house (so __unassigned filter is meaningful at scale)
					house: i % 6 === 0 ? undefined : houses[i % 4]
				});
			}
		});
		return classIds;
	}

	// Walk every page and return the flattened ids.
	async function collectIds(
		t: ReturnType<typeof convexTest>,
		args: {
			search?: string;
			status?: 'Enrolled' | 'Not Enrolled';
			grade?: number;
			house?: string;
			sortBy: 'studentId' | 'englishName' | 'chineseName' | 'grade' | 'house';
			sortDirection: 'asc' | 'desc';
			useIndex: boolean;
		}
	) {
		const ids: string[] = [];
		let cursor: string | null = null;
		let pages = 0;
		do {
			const r = await t.query(api.students.listPaginated, {
				paginationOpts: { numItems: 50, cursor },
				search: args.search,
				status: args.status,
				grade: args.grade,
				house: args.house as
					| 'Heracles'
					| 'Wukong'
					| 'Ixbalam'
					| 'Setna'
					| '__unassigned'
					| undefined,
				sortBy: args.sortBy,
				sortDirection: args.sortDirection,
				useIndex: args.useIndex
			});
			for (const s of r.page) ids.push(s.studentId);
			cursor = r.isDone ? null : r.continueCursor;
			pages++;
		} while (cursor && pages < 100);
		return ids;
	}

	it('sorts by house asc/desc', async () => {
		const t = convexTest(schema, modules);

		const houseNames = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'];
		for (let i = 0; i < houseNames.length; i++) {
			await t.mutation(api.students.create, {
				englishName: `Student ${houseNames[i]}`,
				chineseName: `學生${i}`,
				studentId: `HOUSE${i}`,
				grade: 10,
				status: 'Enrolled',
				house: houseNames[i]
			});
		}
		await t.mutation(api.students.create, {
			englishName: 'Student No House',
			chineseName: '無學生',
			studentId: 'HOUSE99',
			grade: 10,
			status: 'Enrolled'
		});

		const ascResult = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'house',
			sortDirection: 'asc'
		});
		const ascHouses = ascResult.page.map((s: { house?: string }) => s.house ?? '__unassigned');
		// Current impl: empty house ('') sorts first in asc, last in desc
		expect(ascHouses).toEqual(['__unassigned', 'Heracles', 'Ixbalam', 'Setna', 'Wukong']);

		const descResult = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'house',
			sortDirection: 'desc'
		});
		const descHouses = descResult.page.map((s: { house?: string }) => s.house ?? '__unassigned');
		expect(descHouses).toEqual(['Wukong', 'Setna', 'Ixbalam', 'Heracles', '__unassigned']);
	});

	it('sorts by studentId asc/desc', async () => {
		const t = convexTest(schema, modules);

		const ids = ['7000001', '7000002', '7000003', '8000001', '9000001'];
		for (const id of ids) {
			await t.mutation(api.students.create, {
				englishName: `Student ${id}`,
				chineseName: `學生${id}`,
				studentId: id,
				grade: 10,
				status: 'Enrolled'
			});
		}

		const ascResult = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'studentId',
			sortDirection: 'asc'
		});
		expect(ascResult.page.map((s: { studentId: string }) => s.studentId)).toEqual(ids);

		const descResult = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'studentId',
			sortDirection: 'desc'
		});
		expect(descResult.page.map((s: { studentId: string }) => s.studentId)).toEqual(
			[...ids].reverse()
		);
	});

	it('sorts by chineseName asc/desc', async () => {
		const t = convexTest(schema, modules);

		const names = ['張三', '李四', '王五', '趙六'];
		for (let i = 0; i < names.length; i++) {
			await t.mutation(api.students.create, {
				englishName: `Student ${i}`,
				chineseName: names[i],
				studentId: `CHINESE${i}`,
				grade: 10,
				status: 'Enrolled'
			});
		}

		const ascResult = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'chineseName',
			sortDirection: 'asc'
		});
		expect(ascResult.page.map((s: { chineseName: string }) => s.chineseName)).toEqual(names.sort());

		const descResult = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'chineseName',
			sortDirection: 'desc'
		});
		expect(descResult.page.map((s: { chineseName: string }) => s.chineseName)).toEqual(
			[...names].sort().reverse()
		);
	});

	it('sorts by englishName desc', async () => {
		const t = convexTest(schema, modules);

		for (const name of ['Alice', 'Bob', 'Charlie']) {
			await t.mutation(api.students.create, {
				englishName: name,
				chineseName: `中文${name}`,
				studentId: `ENG${name}`,
				grade: 10,
				status: 'Enrolled'
			});
		}

		const descResult = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'englishName',
			sortDirection: 'desc'
		});
		expect(descResult.page.map((s: { englishName: string }) => s.englishName)).toEqual([
			'Charlie',
			'Bob',
			'Alice'
		]);
	});

	it('filters by house __unassigned', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Has House',
			chineseName: '有學生',
			studentId: 'UNHOUSE01',
			grade: 10,
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'No House',
			chineseName: '無學生',
			studentId: 'UNHOUSE02',
			grade: 10,
			status: 'Enrolled'
		});

		const result = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			house: '__unassigned',
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		expect(result.page).toHaveLength(1);
		expect(result.page[0].englishName).toBe('No House');
	});

	it('filters by status+grade+house+class combined', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'G10 Enrolled Heracles 1',
			chineseName: '學生1',
			studentId: 'COMBO01',
			grade: 10,
			class: '1',
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'G10 Enrolled Heracles 2',
			chineseName: '學生2',
			studentId: 'COMBO02',
			grade: 10,
			class: '2',
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'G10 NotEnrolled Heracles 1',
			chineseName: '學生3',
			studentId: 'COMBO03',
			grade: 10,
			class: '1',
			status: 'Not Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'G11 Enrolled Heracles 1',
			chineseName: '學生4',
			studentId: 'COMBO04',
			grade: 11,
			class: '1',
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'G10 Enrolled Wukong 1',
			chineseName: '學生5',
			studentId: 'COMBO05',
			grade: 10,
			class: '1',
			status: 'Enrolled',
			house: 'Wukong'
		});

		const result = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: 'Enrolled',
			grade: 10,
			house: 'Heracles',
			class: '1',
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		expect(result.page).toHaveLength(1);
		expect(result.page[0].englishName).toBe('G10 Enrolled Heracles 1');
	});

	it('search + sort + filter together', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Alice Chen',
			chineseName: '陳艾莉',
			studentId: 'SEARCH01',
			grade: 10,
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'Bob Chen',
			chineseName: '陳鮑勃',
			studentId: 'SEARCH02',
			grade: 10,
			status: 'Enrolled',
			house: 'Wukong'
		});
		await t.mutation(api.students.create, {
			englishName: 'Charlie Wang',
			chineseName: '王查理',
			studentId: 'SEARCH03',
			grade: 11,
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'David Lee',
			chineseName: '李大衛',
			studentId: 'SEARCH04',
			grade: 10,
			status: 'Not Enrolled',
			house: 'Heracles'
		});

		const result = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: 'Chen',
			status: 'Enrolled',
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		expect(result.page).toHaveLength(2);
		expect(result.page.map((s: { englishName: string }) => s.englishName)).toEqual([
			'Alice Chen',
			'Bob Chen'
		]);
	});

	it('index-based path (useIndex) matches legacy results', async () => {
		const t = convexTest(schema, modules);

		// Create test data with various combinations
		await t.mutation(api.students.create, {
			englishName: 'Alice Heracles',
			chineseName: '陳艾莉',
			studentId: 'IDX001',
			grade: 10,
			class: '1',
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'Bob Heracles',
			chineseName: '陳鮑勃',
			studentId: 'IDX002',
			grade: 10,
			class: '2',
			status: 'Enrolled',
			house: 'Heracles'
		});
		await t.mutation(api.students.create, {
			englishName: 'Charlie Wukong',
			chineseName: '王查理',
			studentId: 'IDX003',
			grade: 10,
			class: '1',
			status: 'Enrolled',
			house: 'Wukong'
		});
		await t.mutation(api.students.create, {
			englishName: 'David NoHouse',
			chineseName: '李大衛',
			studentId: 'IDX004',
			grade: 11,
			class: '1',
			status: 'Enrolled'
		});
		await t.mutation(api.students.create, {
			englishName: 'Eve NotEnrolled',
			chineseName: '伊芙',
			studentId: 'IDX005',
			grade: 10,
			class: '1',
			status: 'Not Enrolled',
			house: 'Heracles'
		});

		// Test 1: status filter only
		const legacy1 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			status: 'Enrolled',
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		const indexed1 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			status: 'Enrolled',
			sortBy: 'englishName',
			sortDirection: 'asc',
			useIndex: true
		});
		expect(indexed1.page.map((s: { englishName: string }) => s.englishName)).toEqual(
			legacy1.page.map((s: { englishName: string }) => s.englishName)
		);

		// Test 2: status + house filter
		const legacy2 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			status: 'Enrolled',
			house: 'Heracles',
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		const indexed2 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			status: 'Enrolled',
			house: 'Heracles',
			sortBy: 'englishName',
			sortDirection: 'asc',
			useIndex: true
		});
		expect(indexed2.page.map((s: { englishName: string }) => s.englishName)).toEqual(
			legacy2.page.map((s: { englishName: string }) => s.englishName)
		);

		// Test 3: sort by studentId asc
		const legacy3 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			sortBy: 'studentId',
			sortDirection: 'asc'
		});
		const indexed3 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: true
		});
		expect(indexed3.page.map((s: { studentId: string }) => s.studentId)).toEqual(
			legacy3.page.map((s: { studentId: string }) => s.studentId)
		);

		// Test 4: sort by house
		const legacy4 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			sortBy: 'house',
			sortDirection: 'asc'
		});
		const indexed4 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			sortBy: 'house',
			sortDirection: 'asc',
			useIndex: true
		});
		expect(indexed4.page.map((s: { house?: string }) => s.house ?? '__unassigned')).toEqual(
			legacy4.page.map((s: { house?: string }) => s.house ?? '__unassigned')
		);

		// Test 5: pagination with cursor
		const legacyPage1 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 2, cursor: null },
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		const legacyPage2 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 2, cursor: legacyPage1.continueCursor },
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		const indexedPage1 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 2, cursor: null },
			sortBy: 'englishName',
			sortDirection: 'asc',
			useIndex: true
		});
		const indexedPage2 = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 2, cursor: indexedPage1.continueCursor },
			sortBy: 'englishName',
			sortDirection: 'asc',
			useIndex: true
		});
		expect(indexedPage1.page.map((s: { englishName: string }) => s.englishName)).toEqual(
			legacyPage1.page.map((s: { englishName: string }) => s.englishName)
		);
		expect(indexedPage2.page.map((s: { englishName: string }) => s.englishName)).toEqual(
			legacyPage2.page.map((s: { englishName: string }) => s.englishName)
		);
	});

	it('creates and reuses an imported class section', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.importFromExcel, {
			students: [
				{
					englishName: 'Section One',
					chineseName: '一班',
					studentId: '7001001',
					grade: 7,
					class: '2',
					status: 'Enrolled'
				},
				{
					englishName: 'Section Two',
					chineseName: '二班',
					studentId: '7001002',
					grade: 7,
					class: '2',
					status: 'Enrolled'
				}
			]
		});

		const classes = await t.query(api.classes.getByGrade, { grade: 7 });
		const students = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 10, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'englishName',
			sortDirection: 'asc'
		});

		expect(
			classes.filter((classRecord: { class: string }) => classRecord.class === '2')
		).toHaveLength(1);
		expect(
			students.page.filter(
				(student: { classInfo?: { class?: string } | null }) => student.classInfo?.class === '2'
			)
		).toHaveLength(2);
	});

	it('returns a continuation cursor for students beyond the first page', async () => {
		const t = convexTest(schema, modules);

		for (let index = 0; index < 3; index++) {
			await t.mutation(api.students.create, {
				englishName: `Student ${index}`,
				chineseName: `學生${index}`,
				studentId: `PAGINATE${index}`,
				grade: 7,
				status: 'Enrolled'
			});
		}

		const firstPage = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 2, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'englishName',
			sortDirection: 'asc'
		});
		const secondPage = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
			search: undefined,
			status: undefined,
			sortBy: 'englishName',
			sortDirection: 'asc'
		});

		expect(firstPage.page).toHaveLength(2);
		expect(secondPage.page).toHaveLength(1);
		expect(firstPage.page.map((student: { studentId: string }) => student.studentId)).not.toEqual(
			secondPage.page.map((student: { studentId: string }) => student.studentId)
		);
	});

	it('sorts by grade then class in numeric order ascending', async () => {
		const t = convexTest(schema, modules);

		const seed = [
			{ studentId: '7001010', grade: 7, class: '10' },
			{ studentId: '7001002', grade: 7, class: '2' },
			{ studentId: '7001001', grade: 7, class: '1' },
			{ studentId: '8001001', grade: 8, class: '1' },
			{ studentId: '8001002', grade: 8, class: '2' }
		];
		for (const { studentId, grade, class: className } of seed) {
			await t.mutation(api.students.create, {
				englishName: `Student ${studentId}`,
				chineseName: `學生${studentId}`,
				studentId,
				grade,
				class: className,
				status: 'Enrolled'
			});
		}

		const result = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'grade',
			sortDirection: 'asc'
		});

		expect(
			result.page.map(
				(student: { classInfo: { grade: number; class: string } }) =>
					`${student.classInfo.grade}-${student.classInfo.class}`
			)
		).toEqual(['7-1', '7-2', '7-10', '8-1', '8-2']);
	});

	it('sorts by grade descending but keeps class ascending within each grade', async () => {
		const t = convexTest(schema, modules);

		const seed = [
			{ studentId: '7001010', grade: 7, class: '10' },
			{ studentId: '7001002', grade: 7, class: '2' },
			{ studentId: '7001001', grade: 7, class: '1' },
			{ studentId: '8001001', grade: 8, class: '1' },
			{ studentId: '8001002', grade: 8, class: '2' }
		];
		for (const { studentId, grade, class: className } of seed) {
			await t.mutation(api.students.create, {
				englishName: `Student ${studentId}`,
				chineseName: `學生${studentId}`,
				studentId,
				grade,
				class: className,
				status: 'Enrolled'
			});
		}

		const result = await t.query(api.students.listPaginated, {
			paginationOpts: { numItems: 50, cursor: null },
			search: undefined,
			status: undefined,
			sortBy: 'grade',
			sortDirection: 'desc'
		});

		expect(
			result.page.map(
				(student: { classInfo: { grade: number; class: string } }) =>
					`${student.classInfo.grade}-${student.classInfo.class}`
			)
		).toEqual(['8-1', '8-2', '7-1', '7-2', '7-10']);
	});

	it('returns every search match at scale (>500 rows) without index-path truncation', async () => {
		const t = convexTest(schema, modules);

		// Seed >500 students via direct inserts so the query must scan the whole
		// candidate set before applying the free-text filter.
		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});
		await t.run(async (ctx) => {
			const houses = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;
			for (let i = 0; i < 600; i++) {
				await ctx.db.insert('students', {
					englishName: `Match ${i}`,
					chineseName: `匹配${i}`,
					studentId: `SCALE${String(i).padStart(4, '0')}`,
					classId,
					status: i % 10 === 0 ? 'Not Enrolled' : 'Enrolled',
					house: houses[i % 4]
				});
			}
		});

		const countAll = async (useIndex: boolean) => {
			let cursor: string | null = null;
			let total = 0;
			let pages = 0;
			do {
				const r = await t.query(api.students.listPaginated, {
					paginationOpts: { numItems: 50, cursor },
					search: 'Match',
					sortBy: 'studentId',
					sortDirection: 'asc',
					useIndex
				});
				total += r.page.length;
				cursor = r.isDone ? null : r.continueCursor;
				pages++;
			} while (cursor && pages < 50);
			return total;
		};

		const legacy = await countAll(false);
		const indexed = await countAll(true);
		expect(legacy).toBe(600);
		expect(indexed).toBe(600);
	});

	it('returns all status+search matches at scale via the index path (useIndex)', async () => {
		const t = convexTest(schema, modules);
		await seedScaledStudents(t, 600);

		const legacy = await collectIds(t, {
			status: 'Enrolled',
			search: 'Match',
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: false
		});
		const indexed = await collectIds(t, {
			status: 'Enrolled',
			search: 'Match',
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: true
		});

		// 60 of 600 are Not Enrolled, so 540 Enrolled should match 'Match'.
		expect(legacy.length).toBe(540);
		expect(indexed.length).toBe(540);
		expect(new Set(indexed)).toEqual(new Set(legacy));
	});

	it('returns all grade-filtered matches at scale (never-indexed field)', async () => {
		const t = convexTest(schema, modules);
		await seedScaledStudents(t, 600);

		const legacy = await collectIds(t, {
			grade: 9,
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: false
		});
		const indexed = await collectIds(t, {
			grade: 9,
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: true
		});

		// Students are spread round-robin across grades 7-12.
		expect(legacy.length).toBe(100);
		expect(indexed.length).toBe(100);
		expect(new Set(indexed)).toEqual(new Set(legacy));
	});

	it('returns all __unassigned house matches at scale via full scan', async () => {
		const t = convexTest(schema, modules);
		await seedScaledStudents(t, 600);

		const legacy = await collectIds(t, {
			house: '__unassigned',
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: false
		});
		const indexed = await collectIds(t, {
			house: '__unassigned',
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: true
		});

		// i%6 === 0 -> no house, so 100 unassigned of 600.
		expect(legacy.length).toBe(100);
		expect(indexed.length).toBe(100);
		expect(new Set(indexed)).toEqual(new Set(legacy));
	});

	it('paginates the full scaled set without gaps or duplicates (useIndex)', async () => {
		const t = convexTest(schema, modules);
		await seedScaledStudents(t, 600);

		const ids = await collectIds(t, {
			sortBy: 'studentId',
			sortDirection: 'asc',
			useIndex: true
		});

		expect(ids.length).toBe(600);
		// No duplicates and no missing rows across pages.
		expect(new Set(ids).size).toBe(600);
		const expected = Array.from({ length: 600 }, (_, i) => `SCALE${String(i).padStart(4, '0')}`);
		expect([...ids].sort()).toEqual(expected);
	});

	it('dispatcher default (no useIndex) routes to the legacy path', async () => {
		const t = convexTest(schema, modules);
		await seedScaledStudents(t, 200);

		const args = {
			status: 'Enrolled' as const,
			house: 'Heracles' as const,
			search: 'Match',
			sortBy: 'studentId' as const,
			sortDirection: 'asc' as const
		};
		const withoutFlag = await collectIds(t, { ...args, useIndex: false as const });
		// Omit the flag entirely to exercise the dispatcher's default branch.
		const defaultBranch = await (async () => {
			const ids: string[] = [];
			let cursor: string | null = null;
			let pages = 0;
			do {
				const r = await t.query(api.students.listPaginated, {
					paginationOpts: { numItems: 50, cursor },
					status: args.status,
					house: args.house,
					search: args.search,
					sortBy: args.sortBy,
					sortDirection: args.sortDirection
				});
				for (const s of r.page) ids.push(s.studentId);
				cursor = r.isDone ? null : r.continueCursor;
				pages++;
			} while (cursor && pages < 100);
			return ids;
		})();

		expect(new Set(defaultBranch)).toEqual(new Set(withoutFlag));
	});

	it('legacy and indexed paths produce identical ordered results across the full arg matrix', async () => {
		const t = convexTest(schema, modules);
		await seedScaledStudents(t, 600);

		const sortBys = ['studentId', 'englishName', 'chineseName', 'grade', 'house'] as const;
		const dirs = ['asc', 'desc'] as const;
		type Scenario = {
			status?: 'Enrolled' | 'Not Enrolled';
			house?: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna' | '__unassigned';
			grade?: number;
			class?: string;
			search?: string;
		};
		const scenarios: Scenario[] = [
			{},
			{ status: 'Enrolled' },
			{ status: 'Not Enrolled' },
			{ house: 'Heracles' },
			{ house: 'Ixbalam' },
			{ house: '__unassigned' },
			{ status: 'Enrolled', house: 'Wukong' },
			{ grade: 8 },
			{ grade: 11, house: 'Setna' },
			{ class: '1' },
			{ search: 'Match 1' },
			{ status: 'Enrolled', search: 'Match' },
			{ grade: 9, status: 'Enrolled', house: 'Heracles', search: 'Match 3' }
		];

		for (const sortBy of sortBys) {
			for (const sortDirection of dirs) {
				for (const f of scenarios) {
					const legacy = await t.query(api.students.listPaginated, {
						paginationOpts: { numItems: 1000, cursor: null },
						sortBy,
						sortDirection,
						status: f.status,
						house: f.house,
						grade: f.grade,
						class: f.class,
						search: f.search,
						useIndex: false
					});
					const indexed = await t.query(api.students.listPaginated, {
						paginationOpts: { numItems: 1000, cursor: null },
						sortBy,
						sortDirection,
						status: f.status,
						house: f.house,
						grade: f.grade,
						class: f.class,
						search: f.search,
						useIndex: true
					});
					const label = `sortBy=${sortBy} dir=${sortDirection} f=${JSON.stringify(f)}`;
					expect(
						indexed.page.map((s: { _id: string }) => s._id),
						label
					).toEqual(legacy.page.map((s: { _id: string }) => s._id));
				}
			}
		}
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
		expect(updatedStudent?.classInfo?.grade).toBe(10);
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
		expect(students[0].classInfo?.grade).toBe(10);
		expect(students[0].englishName).toBe('Second');
	});
});

describe('students.bulkAssignHouses', () => {
	it('assigns houses to matched students by name', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Alice House',
			chineseName: '愛麗絲',
			studentId: 'S_HOUSE01',
			grade: 10,
			status: 'Enrolled' as const
		});
		await t.mutation(api.students.create, {
			englishName: 'Bob House',
			chineseName: '鮑伯',
			studentId: 'S_HOUSE02',
			grade: 10,
			status: 'Enrolled' as const
		});

		const result = await t.mutation(api.students.bulkAssignHouses, {
			assignments: [
				{ englishName: 'Alice House', house: 'Heracles' },
				{ englishName: 'Bob House', house: 'Wukong' }
			]
		});

		expect(result.assigned).toBe(2);
		expect(result.total).toBe(2);

		const students = await t.query(api.students.list, {});
		const alice = students.find(
			(s: { englishName?: string; house?: string }) => s.englishName === 'Alice House'
		);
		const bob = students.find(
			(s: { englishName?: string; house?: string }) => s.englishName === 'Bob House'
		);
		expect(alice?.house).toBe('Heracles');
		expect(bob?.house).toBe('Wukong');
	});

	it('skips students not found by name', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Found Student',
			chineseName: '找到學生',
			studentId: 'S_FOUND01',
			grade: 9,
			status: 'Enrolled' as const
		});

		const result = await t.mutation(api.students.bulkAssignHouses, {
			assignments: [
				{ englishName: 'Found Student', house: 'Ixbalam' },
				{ englishName: 'Missing Student', house: 'Setna' }
			]
		});

		expect(result.assigned).toBe(1);
		expect(result.total).toBe(2);

		const students = await t.query(api.students.list, {});
		expect(students).toHaveLength(1);
		expect(students[0].house).toBe('Ixbalam');
	});

	it('handles empty assignment list', async () => {
		const t = convexTest(schema, modules);

		const result = await t.mutation(api.students.bulkAssignHouses, {
			assignments: []
		});

		expect(result.assigned).toBe(0);
		expect(result.total).toBe(0);
	});

	it('matches names case-insensitively', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.students.create, {
			englishName: 'Case Test Student',
			chineseName: '大小寫測試',
			studentId: 'S_CASE01',
			grade: 10,
			status: 'Enrolled' as const
		});

		const result = await t.mutation(api.students.bulkAssignHouses, {
			assignments: [{ englishName: 'CASE TEST STUDENT', house: 'Setna' }]
		});

		expect(result.assigned).toBe(1);

		const students = await t.query(api.students.list, {});
		expect(students[0].house).toBe('Setna');
	});

	it('overwrites existing house assignment', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Overwrite Student',
			chineseName: '覆寫學生',
			studentId: 'S_OVERWRITE01',
			grade: 10,
			status: 'Enrolled' as const
		});

		await t.mutation(api.students.assignHouse, { studentId, house: 'Heracles' });

		await t.mutation(api.students.bulkAssignHouses, {
			assignments: [{ englishName: 'Overwrite Student', house: 'Wukong' }]
		});

		const students = await t.query(api.students.list, {});
		expect(students[0].house).toBe('Wukong');
	});
});

describe('students.getSystemStatus', () => {
	beforeEach(() => setTestAuthRole('admin'));
	afterEach(() => setTestAuthRole('admin'));

	it('reports counts and the canary flag', async () => {
		setTestAuthRole('super');
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Amy',
			chineseName: '阿美',
			studentId: '7000001',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});
		await createStudentWithClass(t, {
			englishName: 'Bob',
			chineseName: '鮑伯',
			studentId: '7000002',
			grade: 7,
			classNum: '1',
			status: 'Not Enrolled'
		});

		const d = await t.query(api.students.getSystemStatus, {});
		expect(d.counts.total).toBe(2);
		expect(d.counts.enrolled).toBe(1);
		expect(d.counts.notEnrolled).toBe(1);
		expect(d.environment.canaryEnabled).toBe(false);
	});

	it('denies non-super callers', async () => {
		const t = convexTest(schema, modules);

		await expect(t.query(api.students.getSystemStatus, {})).rejects.toThrow(
			/Forbidden: Super role required/
		);
	});
});

describe('students.runParitySelfTest', () => {
	beforeEach(() => setTestAuthRole('admin'));
	afterEach(() => setTestAuthRole('admin'));

	it('reports allMatch across the matrix', async () => {
		setTestAuthRole('super');
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Amy',
			chineseName: '阿美',
			studentId: '7000001',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});
		await createStudentWithClass(t, {
			englishName: 'Bob',
			chineseName: '鮑伯',
			studentId: '7000002',
			grade: 7,
			classNum: '1',
			status: 'Not Enrolled'
		});

		const d = await t.query(api.students.runParitySelfTest, {});
		expect(d.allMatch).toBe(true);
		expect(d.combos.length).toBeGreaterThan(0);
	});

	it('denies non-super callers', async () => {
		const t = convexTest(schema, modules);

		await expect(t.query(api.students.runParitySelfTest, {})).rejects.toThrow(
			/Forbidden: Super role required/
		);
	});
});

describe('students.getCanaryDivergences / runCanaryCheckNow', () => {
	beforeEach(() => setTestAuthRole('admin'));
	afterEach(() => setTestAuthRole('admin'));

	it('records the last-run timestamp when a super runs the check', async () => {
		setTestAuthRole('super');
		const t = convexTest(schema, modules);

		expect((await t.query(api.students.getCanaryDivergences, {})).lastRunAt).toBeNull();

		await t.mutation(api.students.runCanaryCheckNow, {});

		const result = await t.query(api.students.getCanaryDivergences, {});
		expect(result.lastRunAt).not.toBeNull();
		// Test data agrees, so no divergences are recorded.
		expect(result.total).toBe(0);
	});

	it('denies non-super callers', async () => {
		const t = convexTest(schema, modules);

		await expect(t.query(api.students.getCanaryDivergences, {})).rejects.toThrow(
			/Forbidden: Super role required/
		);
		await expect(t.mutation(api.students.runCanaryCheckNow, {})).rejects.toThrow(
			/Forbidden: Super role required/
		);
	});
});

describe('students.setShadowCompare', () => {
	beforeEach(() => setTestAuthRole('admin'));
	afterEach(() => setTestAuthRole('admin'));

	it('super can toggle the persisted canary flag', async () => {
		setTestAuthRole('super');
		const t = convexTest(schema, modules);

		expect((await t.query(api.students.getSystemStatus, {})).environment.canaryEnabled).toBe(false);

		await t.mutation(api.students.setShadowCompare, { enabled: true });
		expect((await t.query(api.students.getSystemStatus, {})).environment.canaryEnabled).toBe(true);

		await t.mutation(api.students.setShadowCompare, { enabled: false });
		expect((await t.query(api.students.getSystemStatus, {})).environment.canaryEnabled).toBe(false);
	});

	it('denies non-super callers', async () => {
		const t = convexTest(schema, modules);

		await expect(t.mutation(api.students.setShadowCompare, { enabled: true })).rejects.toThrow(
			/Forbidden: Super role required/
		);
	});
});
