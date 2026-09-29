import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedEslStaff, seedUser } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';

type TestDb = Awaited<ReturnType<typeof convexTest>>;

async function asEslAdmin(authId = 'esl-admin') {
	const t = convexTest(schema, modules);
	const id = await seedEslStaff(t, { authId, eslRole: 'admin' });
	return { t, id };
}

async function asEslTeacher(authId = 'esl-teacher') {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'teacher' });
	return t;
}

/** The `departmentRoles` column as stored, so tests assert on raw truth. */
function storedRoles(t: TestDb, userId: Id<'users'>) {
	return t.run(async (ctx) => {
		const user = await ctx.db.get(userId);
		return user?.departmentRoles;
	});
}

describe('esl staff', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('list', () => {
		it('resolves the effective ESL role of each staff member', async () => {
			const { t } = await asEslAdmin();
			const intlId = await seedUser(t, {
				authId: 'intl-teacher',
				name: 'Intl Only',
				role: 'teacher',
				departmentRoles: { international: 'teacher' }
			});

			const staff = await t.query(api.esl.staff.list, {});

			const admin = staff.find((s: { eslRole: string | null }) => s.eslRole === 'admin');
			expect(admin?.name).toBe('Test User');
			const intl = staff.find((s: { _id: string }) => s._id === intlId);
			expect(intl?.eslRole).toBeNull();
			expect(intl?.internationalRole).toBe('teacher');
		});

		it('falls back to the legacy International role when no ESL column is set', async () => {
			const { t } = await asEslAdmin();
			const legacyId = await seedUser(t, { authId: 'legacy', role: 'teacher' });

			const staff = await t.query(api.esl.staff.list, {});

			const legacy = staff.find((s: { _id: string }) => s._id === legacyId);
			expect(legacy?.eslRole).toBeNull();
			expect(legacy?.internationalRole).toBe('teacher');
		});

		it('excludes students', async () => {
			const { t } = await asEslAdmin();
			await seedUser(t, { authId: 'student-row', role: 'student' });

			const staff = await t.query(api.esl.staff.list, {});

			expect(staff.every((s: { role: string }) => s.role !== 'student')).toBe(true);
		});

		it('rejects a read from an ESL teacher', async () => {
			const t = await asEslTeacher();

			await expect(t.query(api.esl.staff.list, {})).rejects.toThrow(
				'Forbidden: ESL admin access required'
			);
		});

		it('rejects a read from an International-only admin', async () => {
			const t = convexTest(schema, modules);
			await seedUser(t, {
				authId: 'intl-admin',
				role: 'admin',
				status: 'active',
				departmentRoles: { international: 'admin' }
			});
			mockAuthUser({ authId: 'intl-admin' });

			await expect(t.query(api.esl.staff.list, {})).rejects.toThrow(
				'Forbidden: ESL admin access required'
			);
		});
	});

	describe('listAssignable', () => {
		it('returns active staff for class teacher assignment', async () => {
			const t = await asEslTeacher();

			const staff = await t.query(api.esl.staff.listAssignable, {});

			expect(staff.some((s: { name: string }) => s.name === 'Test User')).toBe(true);
		});

		it('includes staff who have no ESL assignment', async () => {
			const t = await asEslTeacher();
			const intlId = await seedUser(t, {
				authId: 'intl-only',
				role: 'teacher',
				departmentRoles: { international: 'teacher' }
			});

			const staff = await t.query(api.esl.staff.listAssignable, {});

			expect(staff.some((s: { _id: string }) => s._id === intlId)).toBe(true);
		});

		it('omits pending staff and students', async () => {
			const t = await asEslTeacher();
			const pendingId = await seedUser(t, { authId: 'pending', status: 'pending' });
			const studentId = await seedUser(t, { authId: 'student', role: 'student' });

			const staff = await t.query(api.esl.staff.listAssignable, {});

			expect(staff.some((s: { _id: string }) => s._id === pendingId)).toBe(false);
			expect(staff.some((s: { _id: string }) => s._id === studentId)).toBe(false);
		});

		it('rejects a read from an International-only teacher', async () => {
			const t = convexTest(schema, modules);
			await seedUser(t, { authId: 'intl', role: 'teacher' });
			mockAuthUser({ authId: 'intl' });

			await expect(t.query(api.esl.staff.listAssignable, {})).rejects.toThrow(
				'Forbidden: ESL staff access required'
			);
		});
	});

	describe('setEslRole', () => {
		it('assigns the ESL teacher role', async () => {
			const { t } = await asEslAdmin();
			const targetId = await seedUser(t, {
				authId: 'new-teacher',
				role: 'teacher',
				departmentRoles: { international: 'teacher' }
			});

			await t.mutation(api.esl.staff.setEslRole, { userId: targetId, eslRole: 'teacher' });

			expect(await storedRoles(t, targetId)).toEqual({
				international: 'teacher',
				esl: 'teacher'
			});
		});

		it('assigns the ESL admin role', async () => {
			const { t } = await asEslAdmin();
			const targetId = await seedUser(t, { authId: 'new-admin', role: 'teacher' });

			await t.mutation(api.esl.staff.setEslRole, { userId: targetId, eslRole: 'admin' });

			expect((await storedRoles(t, targetId))?.esl).toBe('admin');
		});

		it('materialises the legacy International fallback instead of dropping it', async () => {
			const { t } = await asEslAdmin();
			// No departmentRoles column: the effective role is the legacy International one.
			const targetId = await seedUser(t, { authId: 'legacy', role: 'teacher' });

			await t.mutation(api.esl.staff.setEslRole, { userId: targetId, eslRole: 'teacher' });

			expect(await storedRoles(t, targetId)).toEqual({
				international: 'teacher',
				esl: 'teacher'
			});
		});

		it('removes only the ESL assignment when passed null', async () => {
			const { t } = await asEslAdmin();
			const targetId = await seedUser(t, {
				authId: 'hybrid',
				role: 'teacher',
				departmentRoles: { international: 'admin', esl: 'teacher' }
			});

			await t.mutation(api.esl.staff.setEslRole, { userId: targetId, eslRole: null });

			expect(await storedRoles(t, targetId)).toEqual({ international: 'admin' });
		});

		it('clears the whole column for an ESL-only user leaving the department', async () => {
			const { t } = await asEslAdmin();
			const targetId = await seedUser(t, {
				authId: 'esl-only',
				role: 'teacher',
				departmentRoles: { esl: 'teacher' }
			});

			await t.mutation(api.esl.staff.setEslRole, { userId: targetId, eslRole: null });

			// Convex reads a cleared optional field back as `null`.
			expect(await storedRoles(t, targetId)).toBeNull();
		});

		it('rejects a write from an ESL teacher', async () => {
			const { t: admin } = await asEslAdmin();
			const targetId = await seedUser(admin, { authId: 'target', role: 'teacher' });
			const t = await asEslTeacher();

			await expect(
				t.mutation(api.esl.staff.setEslRole, { userId: targetId, eslRole: 'teacher' })
			).rejects.toThrow('Forbidden: ESL admin access required');
		});

		it('rejects removing your own ESL admin role', async () => {
			const { t, id: self } = await asEslAdmin();

			await expect(
				t.mutation(api.esl.staff.setEslRole, { userId: self, eslRole: null })
			).rejects.toThrow('You cannot remove your own ESL admin role');
		});

		it('refuses to promote a student row', async () => {
			const { t } = await asEslAdmin();
			const studentId = await seedUser(t, { authId: 'student', role: 'student' });

			await expect(
				t.mutation(api.esl.staff.setEslRole, { userId: studentId, eslRole: 'teacher' })
			).rejects.toThrow('Students cannot hold ESL roles');
		});

		it('refuses an unknown user', async () => {
			const { t } = await asEslAdmin();
			const ghost = await t.run((ctx) => ctx.db.insert('users', { role: 'teacher' }));
			await t.run((ctx) => ctx.db.delete(ghost));

			await expect(
				t.mutation(api.esl.staff.setEslRole, { userId: ghost, eslRole: 'teacher' })
			).rejects.toThrow('User not found');
		});
	});
});
