import { describe, expect, test } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { generateUniqueStudentId } from '../../tests/fixtures/server-test-helpers';
import { isEditable } from './shared/evaluation_week';
import type { RecentBatch } from './shared/recentActions';

const TEACHER_AUTH = 'batch-teacher';

async function setupTeacher(t: ReturnType<typeof convexTest>): Promise<void> {
	await seedUser(t, { authId: TEACHER_AUTH, name: 'Batch Teacher', role: 'teacher' });
	mockAuthUser({ authId: TEACHER_AUTH });
}

async function makeCategory(t: ReturnType<typeof convexTest>, name: string): Promise<string> {
	return t.run((ctx) => ctx.db.insert('point_categories', { name }));
}

async function makeStudents(t: ReturnType<typeof convexTest>, count: number): Promise<string[]> {
	const ids: string[] = [];
	for (let i = 0; i < count; i++) {
		const { studentId } = await createStudentWithClass(t, {
			englishName: `Batch Student ${i}`,
			chineseName: `批次學生${i}`,
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		ids.push(studentId);
	}
	return ids;
}

async function createBatch(
	t: ReturnType<typeof convexTest>,
	studentIds: string[],
	categoryId: string,
	overrides: { value?: number; details?: string; semesterId?: string } = {}
): Promise<Id<'evaluations'>[]> {
	return t.mutation(api.evaluations.create, {
		studentIds,
		value: overrides.value ?? 1,
		categoryId,
		details: overrides.details ?? 'Good work',
		semesterId: overrides.semesterId ?? '2025-H1'
	}) as Promise<Id<'evaluations'>[]>;
}

async function getEvaluationDocs(t: ReturnType<typeof convexTest>) {
	return t.run(async (ctx) => {
		return ctx.db.query('evaluations').collect();
	});
}

describe('evaluations.create batch stamping', () => {
	test('stamps the same batchId on every row of one call', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);

		const ids = await createBatch(t, studentIds, categoryId);

		expect(ids).toHaveLength(3);
		const docs = await getEvaluationDocs(t);
		const batchIds = docs.map((d) => d.batchId);
		expect(batchIds).toHaveLength(3);
		expect(new Set(batchIds).size).toBe(1);
		expect(batchIds[0]).toBeTruthy();
	});

	test('stamps a different batchId per call', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);

		await createBatch(t, studentIds.slice(0, 1), categoryId);
		await createBatch(t, studentIds.slice(1, 2), categoryId);

		const docs = await getEvaluationDocs(t);
		expect(new Set(docs.map((d) => d.batchId)).size).toBe(2);
	});

	test('create audit rows carry the batchId', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 2);

		await createBatch(t, studentIds, categoryId);

		const auditRows = await t.run((ctx) => ctx.db.query('audit_logs').collect());
		const createAudits = auditRows.filter((a) => a.action === 'create_evaluation');
		expect(createAudits).toHaveLength(2);
		expect(createAudits.every((a) => typeof a.newValue?.batchId === 'string')).toBe(true);
	});
});

describe('evaluations.updateMany', () => {
	test('patches only the selected ids and writes one audit row each', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);
		const ids = await createBatch(t, studentIds, categoryId);

		const result = await t.mutation(api.evaluations.updateMany, {
			ids: ids.slice(0, 2),
			value: 2,
			details: 'Updated together'
		});

		expect(result).toEqual({ success: true, count: 2 });

		const docs = await getEvaluationDocs(t);
		const updated = docs.filter((d) => d.value === 2 && d.details === 'Updated together');
		expect(updated).toHaveLength(2);
		const untouched = docs.find((d) => d._id === ids[2]);
		expect(untouched!.value).toBe(1);
		expect(untouched!.details).toBe('Good work');

		const auditRows = await t.run((ctx) => ctx.db.query('audit_logs').collect());
		const updateAudits = auditRows.filter((a) => a.action === 'update_evaluation');
		expect(updateAudits).toHaveLength(2);
		expect(updateAudits.every((a) => a.newValue?.batchId)).toBeTruthy();
	});

	test('is all-or-nothing when one row is locked', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);
		const ids = await createBatch(t, studentIds, categoryId);

		// Re-point a single row at an old timestamp so its week is locked.
		const oldTimestamp = Date.now() - 3 * 7 * 24 * 60 * 60 * 1000;
		await t.run(async (ctx) => {
			await ctx.db.patch(ids[1], { timestamp: oldTimestamp });
		});
		expect(isEditable(oldTimestamp)).toBe(false);

		await expect(t.mutation(api.evaluations.updateMany, { ids, value: -1 })).rejects.toThrow(
			/no longer be edited/
		);

		const docs = await getEvaluationDocs(t);
		expect(docs.every((d) => d.value === 1)).toBe(true);
	});

	test('rejects when the caller does not own the evaluations', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 1);
		const ids = await createBatch(t, studentIds, categoryId);

		// A different teacher takes over as the caller.
		await seedUser(t, { authId: 'other-batch-teacher', name: 'Other', role: 'teacher' });
		mockAuthUser({ authId: 'other-batch-teacher' });

		await expect(t.mutation(api.evaluations.updateMany, { ids, value: 2 })).rejects.toThrow(
			'Not authorized to edit this evaluation'
		);

		const docs = await getEvaluationDocs(t);
		expect(docs[0].value).toBe(1);
	});
});

describe('evaluations.removeMany', () => {
	test('deletes only the selected ids and writes audit rows', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);
		const ids = await createBatch(t, studentIds, categoryId);

		const result = await t.mutation(api.evaluations.removeMany, { ids: ids.slice(0, 2) });

		expect(result).toEqual({ success: true, count: 2 });

		const docs = await getEvaluationDocs(t);
		expect(docs).toHaveLength(1);
		expect(docs[0]._id).toBe(ids[2]);

		const auditRows = await t.run((ctx) => ctx.db.query('audit_logs').collect());
		const deleteAudits = auditRows.filter((a) => a.action === 'delete_evaluation');
		expect(deleteAudits).toHaveLength(2);
		expect(deleteAudits.every((a) => a.oldValue?.batchId)).toBeTruthy();
	});

	test('is all-or-nothing when one row is locked', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);
		const ids = await createBatch(t, studentIds, categoryId);

		const oldTimestamp = Date.now() - 3 * 7 * 24 * 60 * 60 * 1000;
		await t.run(async (ctx) => {
			await ctx.db.patch(ids[0], { timestamp: oldTimestamp });
		});

		await expect(t.mutation(api.evaluations.removeMany, { ids })).rejects.toThrow(
			/no longer be deleted/
		);

		const docs = await getEvaluationDocs(t);
		expect(docs).toHaveLength(3);
	});
});

describe('evaluations.listRecentBatches', () => {
	test('groups the caller\u2019s recent evaluations by batchId, newest first', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);

		const idsA = await createBatch(t, studentIds, categoryId, { details: 'Batch A' });
		const idsB = await createBatch(t, studentIds, categoryId, { details: 'Batch B' });

		const batches: RecentBatch[] = await t.query(api.evaluations.listRecentBatches, {});

		expect(batches).toHaveLength(2);
		expect(batches[0].createdAt).toBeGreaterThanOrEqual(batches[1].createdAt);
		expect(batches[0].evaluations.map((e) => e.details)).toEqual(
			expect.arrayContaining(['Batch B'])
		);

		const batchA = batches.find(
			(b) => b.evaluations.length === 3 && b.evaluations[0].details === 'Batch A'
		);
		expect(batchA).toBeTruthy();
		const allIds = batches.flatMap((b) => b.evaluations.map((e) => e.id));
		expect([...idsA, ...idsB].sort()).toEqual([...allIds].sort());
	});

	test('excludes evaluations owned by other teachers', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 1);
		const ids = await createBatch(t, studentIds, categoryId);

		await seedUser(t, { authId: 'other-batch-teacher', name: 'Other', role: 'teacher' });
		mockAuthUser({ authId: 'other-batch-teacher' });

		const batches: RecentBatch[] = await t.query(api.evaluations.listRecentBatches, {});
		expect(batches).toHaveLength(0);
		expect(ids).toHaveLength(1);
	});

	test('reflects a partially-edited batch after updateMany', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);
		const ids = await createBatch(t, studentIds, categoryId);

		await t.mutation(api.evaluations.updateMany, { ids: ids.slice(0, 1), value: 2 });

		const batches: RecentBatch[] = await t.query(api.evaluations.listRecentBatches, {});
		expect(batches).toHaveLength(1);
		const values = batches[0].evaluations.map((e) => e.value);
		expect(values.sort()).toEqual([1, 1, 2]);
	});

	test('groups legacy rows without batchId via the derived key', async () => {
		const t = convexTest(schema, modules);
		await setupTeacher(t);
		const categoryId = await makeCategory(t, 'Creativity');
		const studentIds = await makeStudents(t, 3);

		// Insert three legacy rows directly (no batchId) with identical stamps.
		const sharedTimestamp = Date.now();
		const inserted = await t.run(async (ctx) => {
			const ids: string[] = [];
			for (const studentId of studentIds) {
				ids.push(
					await ctx.db.insert('evaluations', {
						studentId,
						teacherId: (await ctx.db.query('users').first())!._id,
						value: 1,
						categoryId,
						details: 'Legacy group',
						timestamp: sharedTimestamp,
						semesterId: '2025-H1'
					})
				);
			}
			return ids;
		});

		const batches: RecentBatch[] = await t.query(api.evaluations.listRecentBatches, {});
		expect(batches).toHaveLength(1);
		expect(batches[0].evaluations).toHaveLength(3);
		expect(inserted).toHaveLength(3);
	});

	test('returns an empty list for an unauthenticated caller', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser(null);
		const batches: RecentBatch[] = await t.query(api.evaluations.listRecentBatches, {});
		expect(batches).toEqual([]);
	});
});
