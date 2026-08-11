import { describe, it, expect } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

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
