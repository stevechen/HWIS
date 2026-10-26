import { describe, it, expect, afterEach, vi } from 'vite-plus/test';
import { convexTest, modules, seedUser, mockAuthUser } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

describe('esl.staff.deleteUser', () => {
	afterEach(() => vi.restoreAllMocks());

	it('only super can delete an ESL staff user', async () => {
		const t = await convexTest(schema, modules);
		// Super actor
		await seedUser(t, {
			authId: 'super-auth',
			name: 'Super',
			role: 'super',
			status: 'active',
			departmentRoles: { esl: 'super' }
		});
		mockAuthUser({ authId: 'super-auth' });

		// Target staff
		const target = await seedUser(t, {
			authId: 'target-auth',
			name: 'Target',
			role: 'teacher',
			status: 'active',
			departmentRoles: { esl: 'teacher' }
		});

		const result = await t.mutation(api.esl.staff.deleteUser, { userId: target });
		expect(result).toMatchObject({ success: true, userId: target });

		// Verify deleted
		const deleted = await t.run((ctx) => ctx.db.get(target));
		expect(deleted).toBeNull();
	});

	it('rejects non-super actors', async () => {
		const t = await convexTest(schema, modules);
		await seedUser(t, {
			authId: 'admin-auth',
			name: 'Admin',
			role: 'admin',
			status: 'active',
			departmentRoles: { esl: 'admin' }
		});
		mockAuthUser({ authId: 'admin-auth' });

		const other = await seedUser(t, {
			authId: 'other-auth',
			name: 'Other',
			role: 'teacher',
			status: 'active',
			departmentRoles: { esl: 'teacher' }
		});

		await expect(t.mutation(api.esl.staff.deleteUser, { userId: other })).rejects.toThrow(
			/Only Super/
		);
	});

	it('rejects self-delete', async () => {
		const t = await convexTest(schema, modules);
		const self = await seedUser(t, {
			authId: 'self-auth',
			name: 'Self',
			role: 'super',
			status: 'active',
			departmentRoles: { esl: 'super' }
		});
		mockAuthUser({ authId: 'self-auth' });

		await expect(t.mutation(api.esl.staff.deleteUser, { userId: self })).rejects.toThrow(
			/You cannot delete yourself/
		);
	});
});
