import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

describe('categories.create', () => {
	it('creates a category with subCategories', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Test Category',
			subCategories: ['Sub1', 'Sub2', 'Sub3']
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Test Category');
		expect(categories[0].subCategories).toEqual(['Sub1', 'Sub2', 'Sub3']);
	});

	it('creates a category without subCategories', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Simple Category',
			subCategories: []
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Simple Category');
		expect(categories[0].subCategories).toEqual([]);
	});
});

describe('categories.update', () => {
	it('updates category name and subCategories', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Original Category',
			subCategories: ['Original Sub']
		});

		const category = (await t.query(api.categories.list, {}))[0];

		await t.mutation(api.categories.update, {
			id: category._id,
			name: 'Updated Category',
			subCategories: ['Updated Sub 1', 'Updated Sub 2']
		});

		const updated = (await t.query(api.categories.list, {}))[0];
		expect(updated.name).toBe('Updated Category');
		expect(updated.subCategories).toEqual(['Updated Sub 1', 'Updated Sub 2']);
	});

	it('clears subCategories', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Category With Subs',
			subCategories: ['Sub1', 'Sub2']
		});

		const category = (await t.query(api.categories.list, {}))[0];

		await t.mutation(api.categories.update, {
			id: category._id,
			name: 'Category Without Subs',
			subCategories: []
		});

		const updated = (await t.query(api.categories.list, {}))[0];
		expect(updated.subCategories).toEqual([]);
	});
});

describe('categories.remove', () => {
	it('removes category without evaluations', async () => {
		const t = convexTest(schema, modules);

		const categoryId = await t.mutation(api.categories.create, {
			name: 'To Delete',
			subCategories: ['Sub']
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
			name: 'Category With Evals',
			subCategories: ['Sub']
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
				category: 'Category With Evals',
				subCategory: 'Sub',
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
				id: 'fake-category-id' as any
			});
		}).rejects.toThrowError();
	});
});

describe('categories.list', () => {
	it('returns all categories', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Category A',
			subCategories: ['A1', 'A2']
		});

		await t.mutation(api.categories.create, {
			name: 'Category B',
			subCategories: ['B1']
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

		await t.mutation(api.categories.create, {
			name: 'Empty Category',
			subCategories: ['Sub']
		});

		const count = await t.query(api.categories.getEvaluationCount, {
			categoryName: 'Empty Category'
		});

		expect(count).toBe(0);
	});

	it('returns count of evaluations for category', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Evaluated Category',
			subCategories: ['Sub']
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
				category: 'Evaluated Category',
				subCategory: 'Sub',
				details: 'Eval 1',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 10,
				category: 'Evaluated Category',
				subCategory: 'Sub',
				details: 'Eval 2',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const count = await t.query(api.categories.getEvaluationCount, {
			categoryName: 'Evaluated Category'
		});

		expect(count).toBe(2);
	});
});

describe('categories.getSubCategoryEvaluationCount', () => {
	it('returns count for specific subcategory', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Multi Sub Category',
			subCategories: ['SubA', 'SubB']
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
			studentId: 'S_SUBCAT_COUNT',
			grade: 10,
			status: 'Enrolled'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 5,
				category: 'Multi Sub Category',
				subCategory: 'SubA',
				details: 'Eval in SubA',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
			await ctx.db.insert('evaluations', {
				studentId: studentId,
				teacherId: teacherId,
				value: 10,
				category: 'Multi Sub Category',
				subCategory: 'SubB',
				details: 'Eval in SubB',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const countA = await t.query(api.categories.getSubCategoryEvaluationCount, {
			categoryName: 'Multi Sub Category',
			subCategory: 'SubA'
		});

		const countB = await t.query(api.categories.getSubCategoryEvaluationCount, {
			categoryName: 'Multi Sub Category',
			subCategory: 'SubB'
		});

		expect(countA).toBe(1);
		expect(countB).toBe(1);
	});
});

describe('categories edge cases', () => {
	it('creates multiple categories with unique names', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'First Category',
			subCategories: ['Sub1']
		});
		await t.mutation(api.categories.create, {
			name: 'Second Category',
			subCategories: ['Sub2']
		});
		await t.mutation(api.categories.create, {
			name: 'Third Category',
			subCategories: []
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(3);
		const names = categories.map((c: any) => c.name);
		expect(names).toContain('First Category');
		expect(names).toContain('Second Category');
		expect(names).toContain('Third Category');
	});

	it('handles categories with many subCategories', async () => {
		const t = convexTest(schema, modules);

		const manySubs = Array.from({ length: 10 }, (_, i) => `SubCategory_${i + 1}`);

		await t.mutation(api.categories.create, {
			name: 'Many Subs Category',
			subCategories: manySubs
		});

		const categories = await t.query(api.categories.list, {});
		expect(categories).toHaveLength(1);
		expect(categories[0].subCategories).toHaveLength(10);
	});

	it('updates only name, preserving subCategories', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Original Name',
			subCategories: ['Preserved Sub']
		});

		const category = (await t.query(api.categories.list, {}))[0];

		await t.mutation(api.categories.update, {
			id: category._id,
			name: 'New Name',
			subCategories: ['Preserved Sub']
		});

		const updated = (await t.query(api.categories.list, {}))[0];
		expect(updated.name).toBe('New Name');
		expect(updated.subCategories).toEqual(['Preserved Sub']);
	});

	it('replaces all subCategories with new set', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.categories.create, {
			name: 'Replace Subs',
			subCategories: ['Old Sub 1', 'Old Sub 2']
		});

		const category = (await t.query(api.categories.list, {}))[0];

		await t.mutation(api.categories.update, {
			id: category._id,
			name: 'Replace Subs',
			subCategories: ['New Sub 1', 'New Sub 2', 'New Sub 3']
		});

		const updated = (await t.query(api.categories.list, {}))[0];
		expect(updated.subCategories).toEqual(['New Sub 1', 'New Sub 2', 'New Sub 3']);
	});
});
