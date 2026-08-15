import { describe, it, expect } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser, createStudentWithClass } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

describe('dataFactory.createEvaluationForStudent', () => {
	async function seedAdminAndStudent(
		t: ReturnType<typeof convexTest>,
		studentCode: string
	): Promise<string> {
		await seedUser(t, { authId: 'seed-admin', name: 'Seed Admin', role: 'admin' });
		mockAuthUser({ authId: 'seed-admin', name: 'Seed Admin', role: 'admin', status: 'active' });

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Test Student',
			chineseName: '測試',
			studentId: studentCode,
			grade: 10,
			classNum: '1',
			status: 'Enrolled',
			e2eTag: 'ev-tag'
		});
		return studentId;
	}

	it('creates an evaluation pointing at the seeded student', async () => {
		const t = convexTest(schema, modules);
		const seededStudentId = await seedAdminAndStudent(t, 'EV1001');

		const evaluationId = await t.mutation(api.dataFactory.createEvaluationForStudent, {
			studentId: 'EV1001',
			e2eTag: 'ev-tag'
		});

		const evaluation = await t.run((ctx) => ctx.db.get(evaluationId));
		expect(evaluation?.studentId).toBe(seededStudentId);
		expect(evaluation?.e2eTag).toBe('ev-tag');
	});

	it('matches the seeded student even when many other students exist', async () => {
		const t = convexTest(schema, modules);
		const seededStudentId = await seedAdminAndStudent(t, 'EV1002');
		for (let i = 0; i < 20; i += 1) {
			await createStudentWithClass(t, {
				englishName: `Other ${i}`,
				chineseName: '其他',
				studentId: `EV2${String(i).padStart(3, '0')}`,
				grade: 10,
				classNum: '1',
				status: 'Enrolled',
				e2eTag: 'ev-tag'
			});
		}

		const evaluationId = await t.mutation(api.dataFactory.createEvaluationForStudent, {
			studentId: 'EV1002',
			e2eTag: 'ev-tag'
		});

		const evaluation = await t.run((ctx) => ctx.db.get(evaluationId));
		expect(evaluation?.studentId).toBe(seededStudentId);
	});

	it('throws when no student matches the studentId', async () => {
		const t = convexTest(schema, modules);
		await seedAdminAndStudent(t, 'EV1003');

		await expect(
			t.mutation(api.dataFactory.createEvaluationForStudent, {
				studentId: 'NOPE',
				e2eTag: 'ev-tag'
			})
		).rejects.toThrow('Student with ID "NOPE" not found');
	});

	it('rejects unauthenticated callers before touching the student lookup', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser(null);

		await expect(
			t.mutation(api.dataFactory.createEvaluationForStudent, {
				studentId: 'EV1004',
				e2eTag: 'ev-tag'
			})
		).rejects.toThrow('User not authenticated.');
	});
});

describe('dataFactory.seedManyStudents', () => {
	async function seedAsAdmin(args: {
		count: number;
		grade: number;
		class?: string;
		e2eTag?: string;
	}) {
		const t = convexTest(schema, modules);
		await seedUser(t, { authId: 'seed-admin', name: 'Seed Admin', role: 'admin' });
		mockAuthUser({ authId: 'seed-admin', name: 'Seed Admin', role: 'admin', status: 'active' });

		const result = await t.mutation(api.dataFactory.seedManyStudents, args);
		const students = await t.run((ctx) => ctx.db.query('students').collect());
		return { t, result, students };
	}

	it('seeds the requested number of tagged students with unique IDs', async () => {
		const { result, students } = await seedAsAdmin({ count: 150, grade: 10, e2eTag: 't1' });

		expect(result.count).toBe(150);
		expect(students).toHaveLength(150);
		expect(students.every((s) => s.e2eTag === 't1')).toBe(true);
		expect(students.every((s) => s.status === 'Enrolled')).toBe(true);
		expect(new Set(students.map((s) => s.studentId)).size).toBe(150);
	});

	it('places seeded students in the requested grade', async () => {
		const { t, students } = await seedAsAdmin({ count: 5, grade: 7, e2eTag: 't2' });

		const classIds = [...new Set(students.map((s) => s.classId))];
		const classes = await t.run((ctx) => Promise.all(classIds.map((id) => ctx.db.get(id))));
		expect(classes.every((c) => c?.grade === 7)).toBe(true);
	});
});
