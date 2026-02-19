import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest as rawConvexTest } from 'convex-test';
import { modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import { authComponent } from './auth';

type BetterAuthUser = {
	id?: string;
	_id?: string;
	email: string;
	name?: string;
};

describe('createUser.createUserByEmail', () => {
	const findManyMock = vi.fn<() => Promise<BetterAuthUser[]>>();

	beforeEach(() => {
		findManyMock.mockReset();

		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() =>
				Promise.resolve({
					findMany: findManyMock
				})) as never;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates a new Convex user from Better Auth user', async () => {
		const t = rawConvexTest(schema, modules);

		findManyMock.mockResolvedValue([
			{
				id: 'ba-user-1',
				email: 'teacher@example.com',
				name: 'Teacher One'
			}
		]);

		const result = await t.mutation(api.createUser.createUserByEmail, {
			email: 'teacher@example.com'
		});

		expect(result).toEqual({
			created: true,
			authId: 'ba-user-1'
		});

		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({
			authId: 'ba-user-1',
			name: 'Teacher One',
			role: 'teacher',
			status: 'active'
		});
	});

	it('updates existing Convex user when authId already exists', async () => {
		const t = rawConvexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'ba-user-2',
				name: 'Old Name',
				role: 'teacher',
				status: 'pending'
			});
		});

		findManyMock.mockResolvedValue([
			{
				id: 'ba-user-2',
				email: 'admin@example.com',
				name: 'Updated Name'
			}
		]);

		const result = await t.mutation(api.createUser.createUserByEmail, {
			email: 'admin@example.com',
			role: 'admin',
			status: 'active'
		});

		expect(result).toEqual({
			created: false,
			authId: 'ba-user-2'
		});

		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({
			authId: 'ba-user-2',
			name: 'Updated Name',
			role: 'admin',
			status: 'active'
		});
	});

	it('uses Better Auth _id when present', async () => {
		const t = rawConvexTest(schema, modules);

		findManyMock.mockResolvedValue([
			{
				id: 'fallback-id',
				_id: 'preferred-id',
				email: 'withid@example.com'
			}
		]);

		const result = await t.mutation(api.createUser.createUserByEmail, {
			email: 'withid@example.com'
		});

		expect(result).toEqual({
			created: true,
			authId: 'preferred-id'
		});
	});

	it('throws when Better Auth user is not found by email', async () => {
		const t = rawConvexTest(schema, modules);

		findManyMock.mockResolvedValue([{ id: 'ba-user-3', email: 'someone@example.com' }]);

		await expect(async () => {
			await t.mutation(api.createUser.createUserByEmail, {
				email: 'missing@example.com'
			});
		}).rejects.toThrowError('Better Auth user not found for email: missing@example.com');
	});
});
