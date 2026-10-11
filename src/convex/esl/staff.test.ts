import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedEslStaff, seedUser } from '../test.setup';
import { authComponent } from '../auth';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';

type TestDb = Awaited<ReturnType<typeof convexTest>>;

async function asEslAdmin(authId = 'esl-admin') {
	const t = await convexTest(schema, modules);
	const id = await seedEslStaff(t, { authId, eslRole: 'admin' });
	return { t, id };
}

async function asEslTeacher(authId = 'esl-teacher') {
	const t = await convexTest(schema, modules);
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
			const t = await convexTest(schema, modules);
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
			const t = await convexTest(schema, modules);
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
			).rejects.toThrow('You cannot change your own ESL role');
		});

		it('rejects demoting your own ESL admin role to teacher', async () => {
			const { t, id: self } = await asEslAdmin();

			await expect(
				t.mutation(api.esl.staff.setEslRole, { userId: self, eslRole: 'teacher' })
			).rejects.toThrow('You cannot change your own ESL role');
			expect(await storedRoles(t, self)).toEqual({ esl: 'admin' });
		});

		it('allows re-saving your own ESL admin role unchanged', async () => {
			const { t, id: self } = await asEslAdmin();

			await t.mutation(api.esl.staff.setEslRole, { userId: self, eslRole: 'admin' });

			expect(await storedRoles(t, self)).toEqual({ esl: 'admin' });
		});

		it("round-trips a super's explicit department slots on rewrite", async () => {
			const { t } = await asEslAdmin();
			const superId = await seedUser(t, {
				authId: 'super-hybrid',
				role: 'super',
				departmentRoles: { international: 'admin', esl: 'admin' }
			});

			await t.mutation(api.esl.staff.setEslRole, { userId: superId, eslRole: 'teacher' });

			expect(await storedRoles(t, superId)).toEqual({
				international: 'admin',
				esl: 'teacher'
			});
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

	describe('getProfile', () => {
		type ProfileClass = {
			_id: string;
			name: string;
			type: string;
			room: string | null;
			cohortLabel: string;
			cohortGrade: number;
			meetings: { day: string; period: number }[];
		};

		/** A G7 cohort's classes (CLIL first, then Comm), for teacher assignment. */
		async function createG7(t: TestDb, classNumber = '1', year = '2025-2026') {
			return t.mutation(api.esl.cohorts.create, {
				year,
				grade: 7,
				level: 'Basic',
				classNumber
			});
		}

		/** Meeting rows as the timetable stores them; the profile counts these. */
		async function seedMeetings(
			t: TestDb,
			classId: Id<'esl_classes'>,
			year: string,
			slots: { day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday'; period: number }[]
		) {
			for (const slot of slots) {
				await t.run((ctx) =>
					ctx.db.insert('esl_class_meetings', { classId, year, day: slot.day, period: slot.period })
				);
			}
		}

		function mockBetterAuth(users: { id: string; email: string }[]) {
			const adapterMock = { findMany: vi.fn().mockResolvedValue(users) };
			vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
				return (() => Promise.resolve(adapterMock)) as never;
			});
		}

		it('returns identity, email, classes with meetings, and years', async () => {
			const { t } = await asEslAdmin();
			const teacherId = await seedEslStaff(t, {
				authId: 'profile-teacher',
				name: 'Ms Chan',
				eslRole: 'teacher',
				signIn: false
			});
			mockBetterAuth([{ id: 'profile-teacher', email: 'chan@hwhs.tc.edu.tw' }]);
			const { classIds } = await createG7(t);
			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[0], teacherId });
			await t.mutation(api.esl.classes.setRoom, { classId: classIds[0], room: 'ESL A' });
			await seedMeetings(t, classIds[0], '2025-2026', [
				{ day: 'Monday', period: 1 },
				{ day: 'Wednesday', period: 2 },
				{ day: 'Friday', period: 3 }
			]);

			const profile = await t.query(api.esl.staff.getProfile, {
				userId: teacherId,
				year: '2025-2026'
			});

			expect(profile.name).toBe('Ms Chan');
			expect(profile.eslRole).toBe('teacher');
			expect(profile.status).toBe('active');
			expect(profile.email).toBe('chan@hwhs.tc.edu.tw');
			expect(profile.years).toContain('2025-2026');
			expect(profile.classes).toHaveLength(1);
			const cls = profile.classes[0] as ProfileClass;
			expect(cls.room).toBe('ESL A');
			expect(cls.cohortLabel).toBe('2025-2026 G7 Basic 1');
			expect(cls.meetings).toHaveLength(3);
		});

		it('counts periods across classes and sorts grade, class number, type', async () => {
			const { t } = await asEslAdmin();
			const teacherId = await seedEslStaff(t, {
				authId: 'busy-teacher',
				name: 'Mr Lin',
				eslRole: 'teacher',
				signIn: false
			});
			mockBetterAuth([]);
			// Two *different* cohorts so one teacher can legally hold both classes.
			const first = await createG7(t, '1');
			const second = await createG7(t, '2');
			await t.mutation(api.esl.classes.assignTeacher, { id: first.classIds[1], teacherId });
			await t.mutation(api.esl.classes.assignTeacher, { id: second.classIds[0], teacherId });
			await seedMeetings(t, first.classIds[1], '2025-2026', [
				{ day: 'Tuesday', period: 1 },
				{ day: 'Thursday', period: 1 }
			]);
			await seedMeetings(t, second.classIds[0], '2025-2026', [
				{ day: 'Monday', period: 1 },
				{ day: 'Wednesday', period: 1 },
				{ day: 'Friday', period: 1 }
			]);

			const profile = await t.query(api.esl.staff.getProfile, {
				userId: teacherId,
				year: '2025-2026'
			});

			expect(profile.classes).toHaveLength(2);
			const [comm, clil] = profile.classes as ProfileClass[];
			expect(comm.cohortLabel).toBe('2025-2026 G7 Basic 1');
			expect(comm.type).toBe('Comm');
			expect(comm.meetings).toHaveLength(2);
			expect(clil.cohortLabel).toBe('2025-2026 G7 Basic 2');
			expect(clil.type).toBe('CLIL');
			expect(clil.meetings).toHaveLength(3);
		});

		it('excludes archived classes and archived cohorts', async () => {
			const { t } = await asEslAdmin();
			const teacherId = await seedEslStaff(t, {
				authId: 'archived-teacher',
				eslRole: 'teacher',
				signIn: false
			});
			mockBetterAuth([]);
			// Three *different* cohorts: one teacher may not hold both classes of a
			// single cohort, so each case gets its own.
			const live = await createG7(t, '1');
			const archivedClass = await createG7(t, '2');
			const retired = await createG7(t, '3', '2024-2025');
			await t.mutation(api.esl.classes.assignTeacher, { id: live.classIds[0], teacherId });
			await t.mutation(api.esl.classes.assignTeacher, {
				id: archivedClass.classIds[0],
				teacherId
			});
			await t.mutation(api.esl.classes.assignTeacher, { id: retired.classIds[0], teacherId });
			await t.mutation(api.esl.classes.setStatus, {
				id: archivedClass.classIds[0],
				status: 'archived'
			});
			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });

			const profile = await t.query(api.esl.staff.getProfile, {
				userId: teacherId,
				year: '2025-2026'
			});

			// The archived class of the live year and the whole retired year are gone.
			expect(profile.classes.map((c: ProfileClass) => c._id)).toEqual([live.classIds[0]]);
			expect(profile.years).toContain('2024-2025');
			expect(profile.years).toContain('2025-2026');
		});

		it('leaves email absent without a linked auth identity', async () => {
			const { t } = await asEslAdmin();
			const teacherId = await seedEslStaff(t, {
				authId: 'orphan-teacher',
				eslRole: 'teacher',
				signIn: false
			});
			mockBetterAuth([]);

			const profile = await t.query(api.esl.staff.getProfile, {
				userId: teacherId,
				year: '2025-2026'
			});

			expect(profile.email).toBeUndefined();
		});

		it('resolves inactive accounts with their status badge value', async () => {
			const { t } = await asEslAdmin();
			const teacherId = await seedEslStaff(t, {
				authId: 'pending-teacher',
				eslRole: 'teacher',
				status: 'pending',
				signIn: false
			});
			mockBetterAuth([]);

			const profile = await t.query(api.esl.staff.getProfile, {
				userId: teacherId,
				year: '2025-2026'
			});

			expect(profile.status).toBe('pending');
			expect(profile.classes).toHaveLength(0);
		});

		it('rejects unknown users and student rows', async () => {
			const { t } = await asEslAdmin();
			const ghost = await t.run((ctx) => ctx.db.insert('users', { role: 'teacher' }));
			await t.run((ctx) => ctx.db.delete(ghost));
			const studentId = await seedUser(t, { authId: 'student', role: 'student' });

			await expect(
				t.query(api.esl.staff.getProfile, { userId: ghost, year: '2025-2026' })
			).rejects.toThrow('User not found');
			await expect(
				t.query(api.esl.staff.getProfile, { userId: studentId, year: '2025-2026' })
			).rejects.toThrow('Students cannot hold ESL roles');
		});

		it('rejects reads from non-admins and strangers', async () => {
			const { t: admin } = await asEslAdmin();
			const teacherId = await seedEslStaff(admin, { authId: 'target', signIn: false });
			const t = await asEslTeacher();

			await expect(
				t.query(api.esl.staff.getProfile, { userId: teacherId, year: '2025-2026' })
			).rejects.toThrow('Forbidden: ESL admin access required');

			mockAuthUser(null);
			await expect(
				t.query(api.esl.staff.getProfile, { userId: teacherId, year: '2025-2026' })
			).rejects.toThrow('Unauthorized');
		});
	});
});
