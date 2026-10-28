import { describe, it, expect } from 'vite-plus/test';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

describe('students.list - unauthenticated regression', () => {
	it('returns empty array when called without auth', async () => {
		const t = await convexTest(schema, modules);
		const students = await t.query(api.students.list, {});
		expect(students).toEqual([]);
	});
});

describe('categories.list - unauthenticated regression', () => {
	it('returns empty array when called without auth', async () => {
		const t = await convexTest(schema, modules);
		const categories = await t.query(api.categories.list, {});
		expect(categories).toEqual([]);
	});
});
