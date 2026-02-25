import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

describe('categories.create', () => {
	it('creates a category', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Test Category'
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Test Category');
	});

	it('creates a category with minimal data', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Simple Category'
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Simple Category');
	});
});

describe('categories.update', () => {
	it('updates category name', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Original Category'
		});

		const category = (await t.query(api.categories.list, {}))[0];

		await t.mutation(api.categories.update, {
			id: category._id,
			name: 'Updated Category'
		});

		const updated = (await t.query(api.categories.list, {}))[0];
		expect(updated.name).toBe('Updated Category');
	});
});

describe('categories.remove', () => {
	it('removes category without evaluations', async () => {
		const t = convexTest(schema, modules);

		const categoryId = await t.mutation(api.categories.create, {
			name: 'To Delete'
		});

		let categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(1);

		await t.mutation(api.categories.remove, { id: categoryId });

		categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(0);
	});

	it('removes category and cascades to delete related evaluations', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Category With Evals'
		});

		const category = (await t.query(api.categories.list, {}))[0];

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'S_TEACHER_EVAL',
			grade: 10,
			status: 'Enrolled'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 5,
				categoryId: category._id,
				details: 'Test evaluation',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		let evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});
		expect(evaluations).toHaveLength(1);

		await t.mutation(api.categories.remove, { id: category._id });

		evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});
		expect(evaluations).toHaveLength(0);

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(0);
	});

	it('throws error when category not found', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.categories.remove, {
				id: 'fake-category-id' as Id<'point_categories'>
			});
		}).rejects.toThrowError();
	});
});

describe('categories.list', () => {
	it('returns all categories', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Category A'
		});

		await t.mutation(api.categories.create, {
			name: 'Category B'
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(2);
	});

	it('returns empty list when no categories exist', async () => {
		const t = convexTest(schema, modules);

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(0);
	});
});

describe('categories.getEvaluationCount', () => {
	it('returns 0 for category with no evaluations', async () => {
		const t = convexTest(schema, modules);

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Empty Category'
		});

		const count = await t.query(api.categories.getEvaluationCount, {
			categoryId
		});

		expect(count).toBe(0);
	});

	it('returns count of evaluations for category', async () => {
		const t = convexTest(schema, modules);

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Evaluated Category'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const studentId = await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'S_EVAL_COUNT',
			grade: 10,
			status: 'Enrolled'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 5,
				categoryId: categoryId,
				details: 'Eval 1',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 10,
				categoryId: categoryId,
				details: 'Eval 2',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const count = await t.query(api.categories.getEvaluationCount, {
			categoryId
		});

		expect(count).toBe(2);
	});
});

describe('categories edge cases', () => {
	it('creates multiple categories with unique names', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'First Category'
		});
		await t.mutation(api.categories.create, {
			name: 'Second Category'
		});
		await t.mutation(api.categories.create, {
			name: 'Third Category'
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(3);
		const names = categories.map((c: { name: string }) => c.name);
		expect(names).toContain('First Category');
		expect(names).toContain('Second Category');
		expect(names).toContain('Third Category');
	});

	it('updates only name', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Original Name'
		});

		const category = (await t.query(api.categories.list, {}))[0];

		await t.mutation(api.categories.update, {
			id: category._id,
			name: 'New Name'
		});

		const updated = (await t.query(api.categories.list, {}))[0];
		expect(updated.name).toBe('New Name');
	});
});
