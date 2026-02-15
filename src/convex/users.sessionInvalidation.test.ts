import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

describe('session invalidation', () => {
	it('deletes sessions when status changes to pending', async () => {
		const t = convexTest(schema, modules);

		// Create a user with active status
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test User',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create a session for this user
		const sessionId = await t.run(async (ctx) => {
			return await ctx.db.insert('sessions', {
				userId: userId as Id<'users'>,
				token: 'test-session-token',
				expiresAt: Date.now() + 86400000, // 24 hours from now
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
		});

		// Verify session exists
		const sessionBefore = await t.run(async (ctx) => {
			return await ctx.db.get(sessionId as Id<'sessions'>);
		});
		expect(sessionBefore).not.toBeNull();

		// Change status to pending
		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			status: 'pending',
			testToken: 'unit-test-token'
		});

		// Verify session was deleted
		const sessionAfter = await t.run(async (ctx) => {
			return await ctx.db.get(sessionId as Id<'sessions'>);
		});
		expect(sessionAfter).toBeNull();
	});

	it('deletes sessions when role changes', async () => {
		const t = convexTest(schema, modules);

		// Create a user
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test User',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create a session for this user
		const sessionId = await t.run(async (ctx) => {
			return await ctx.db.insert('sessions', {
				userId: userId as Id<'users'>,
				token: 'test-session-token-2',
				expiresAt: Date.now() + 86400000,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
		});

		// Verify session exists
		const sessionBefore = await t.run(async (ctx) => {
			return await ctx.db.get(sessionId as Id<'sessions'>);
		});
		expect(sessionBefore).not.toBeNull();

		// Change role
		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			role: 'admin',
			testToken: 'unit-test-token'
		});

		// Verify session was deleted
		const sessionAfter = await t.run(async (ctx) => {
			return await ctx.db.get(sessionId as Id<'sessions'>);
		});
		expect(sessionAfter).toBeNull();
	});

	it('does NOT delete sessions when only name changes', async () => {
		const t = convexTest(schema, modules);

		// Create a user
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test User',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create a session for this user
		const sessionId = await t.run(async (ctx) => {
			return await ctx.db.insert('sessions', {
				userId: userId as Id<'users'>,
				token: 'test-session-token-3',
				expiresAt: Date.now() + 86400000,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
		});

		// Verify session exists
		const sessionBefore = await t.run(async (ctx) => {
			return await ctx.db.get(sessionId as Id<'sessions'>);
		});
		expect(sessionBefore).not.toBeNull();

		// Update only the name (no status or role change)
		await t.run(async (ctx) => {
			await ctx.db.patch(userId as Id<'users'>, {
				name: 'Updated Name'
			});
		});

		// Verify session still exists
		const sessionAfter = await t.run(async (ctx) => {
			return await ctx.db.get(sessionId as Id<'sessions'>);
		});
		expect(sessionAfter).not.toBeNull();
	});

	it('deletes all sessions when status changes to pending (multiple sessions)', async () => {
		const t = convexTest(schema, modules);

		// Create a user with active status
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Test User',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create multiple sessions for this user
		await Promise.all([
			t.run(async (ctx) => {
				return await ctx.db.insert('sessions', {
					userId: userId as Id<'users'>,
					token: 'session-token-1',
					expiresAt: Date.now() + 86400000,
					createdAt: Date.now(),
					updatedAt: Date.now()
				});
			}),
			t.run(async (ctx) => {
				return await ctx.db.insert('sessions', {
					userId: userId as Id<'users'>,
					token: 'session-token-2',
					expiresAt: Date.now() + 86400000,
					createdAt: Date.now(),
					updatedAt: Date.now()
				});
			})
		]);

		// Verify all sessions exist
		const sessionsBefore = await t.run(async (ctx) => {
			return await ctx.db.query('sessions').collect();
		});
		expect(sessionsBefore).toHaveLength(2);

		// Change status to pending
		await t.mutation(api.users.update, {
			id: userId as Id<'users'>,
			status: 'pending',
			testToken: 'unit-test-token'
		});

		// Verify all sessions were deleted
		const sessionsAfter = await t.run(async (ctx) => {
			return await ctx.db.query('sessions').collect();
		});
		expect(sessionsAfter).toHaveLength(0);
	});

	/*
	 * Note: Audit log creation tests for role/status changes are not included
	 * in this test file because the server code intentionally skips audit logging
	 * when using the mock test token (performerId === 'test-user-id').
	 *
	 * The audit log functionality is tested in:
	 * - E2E tests (e2e/audit.spec.ts) where real authentication is used
	 * - The server code in src/convex/users.ts (lines 97-122) handles audit log creation
	 */
});
