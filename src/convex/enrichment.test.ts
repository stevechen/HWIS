import { describe, expect, test } from 'vitest';
import { convexTest, modules } from './test.setup';
import schema from './schema';
import type { Doc } from './_generated/dataModel';

async function setupEvaluationData(t: ReturnType<typeof convexTest>) {
	const classId = await t.run(async (ctx) => {
		return await ctx.db.insert('classes', {
			grade: 10,
			class: '1'
		});
	});

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: '7001001',
			classId,
			status: 'Enrolled' as const,
			e2eTag: 'test'
		});
	});

	const categoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Creativity'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-test-auth-id',
			name: 'Test Teacher',
			role: 'teacher' as const,
			status: 'active' as const
		});
	});

	return { classId, studentId, categoryId, teacherId };
}

describe('enrichment helper', () => {
	test('enrichEvaluations resolves student names, category names, and class info', async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();

		const { studentId, categoryId, teacherId } = await setupEvaluationData(t);

		await t.run(async (ctx) => {
			return await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				categoryId,
				value: 1,
				details: 'Great work!',
				timestamp: now,
				semesterId: '2025-H1'
			});
		});

		let evaluations: Doc<'evaluations'>[] = [];
		await t.run(async (ctx) => {
			evaluations = await ctx.db.query('evaluations').collect();
		});

		const enrich = await import('./shared/enrichment');

		const result = await t.run(async (ctx) => {
			return await enrich.enrichEvaluations(evaluations, ctx);
		});

		expect(result).toHaveLength(1);
		expect(result[0].englishName).toBe('John Doe');
		expect(result[0].category).toBe('Creativity');
		expect(result[0].grade).toBe(10);
		expect(result[0].class).toBe('1');
	});

	test('enrichEvaluations handles multiple evaluations with different categories sorted by timestamp', async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();

		const { studentId, teacherId } = await setupEvaluationData(t);

		const cat1 = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Academics'
			});
		});

		const cat2 = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Sports'
			});
		});

		const earlier = now - 100000;
		const later = now;

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				categoryId: cat1,
				value: 1,
				details: 'Quiz',
				timestamp: earlier,
				semesterId: '2025-H1'
			});
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				categoryId: cat2,
				value: 2,
				details: 'Sport event',
				timestamp: later,
				semesterId: '2025-H1'
			});
		});

		let evaluations: Doc<'evaluations'>[] = [];
		await t.run(async (ctx) => {
			evaluations = await ctx.db.query('evaluations').order('desc').collect();
		});

		const enrich = await import('./shared/enrichment');

		const result = await t.run(async (ctx) => {
			return await enrich.enrichEvaluations(evaluations, ctx);
		});

		expect(result).toHaveLength(2);
		expect(result[0].category).toBe('Sports');
		expect(result[1].category).toBe('Academics');
		expect(result[0].studentReference).toBe('resolved');
		expect(result[0].categoryReference).toBe('resolved');
		expect(result[0].timestamp).toBeGreaterThanOrEqual(result[1].timestamp);
	});

	test('enrichEvaluations marks missing student and category references', async () => {
		const t = convexTest(schema, modules);
		const teacherId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				authId: 'missing-reference-teacher',
				name: 'Missing Reference Teacher',
				role: 'teacher',
				status: 'active'
			})
		);
		const { studentId, categoryId } = await setupEvaluationData(t);
		const evaluation = await t.run(async (ctx) => {
			const evaluationId = await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				categoryId,
				value: 1,
				details: 'Missing references',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
			await ctx.db.delete(studentId);
			await ctx.db.delete(categoryId);
			return ctx.db.get(evaluationId);
		});
		if (!evaluation) throw new Error('Evaluation was not created');

		const enrich = await import('./shared/enrichment');
		const result = await t.run(async (ctx) => enrich.enrichEvaluations([evaluation], ctx));

		expect(result[0].englishName).toBe('Unknown Student');
		expect(result[0].category).toBe('Unknown Category');
		expect(result[0].studentReference).toBe('missing');
		expect(result[0].categoryReference).toBe('missing');
	});
});
