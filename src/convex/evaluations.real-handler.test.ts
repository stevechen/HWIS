import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

type TestCtx = ReturnType<typeof convexTest>;

async function seedStudent(t: TestCtx, studentIdCode: string): Promise<Id<'students'>> {
	const classId = await t.run((ctx) => ctx.db.insert('classes', { grade: 10, class: '1' }));
	return t.run((ctx) =>
		ctx.db.insert('students', {
			englishName: 'Seed Student',
			chineseName: '種子學生',
			studentId: studentIdCode,
			classId,
			status: 'Enrolled'
		})
	);
}

async function seedCategory(t: TestCtx, name = 'Test Category'): Promise<Id<'point_categories'>> {
	return t.run((ctx) => ctx.db.insert('point_categories', { name }));
}

async function seedEvaluation(
	t: TestCtx,
	args: { studentId: Id<'students'>; teacherId: Id<'users'>; categoryId: Id<'point_categories'> }
): Promise<Id<'evaluations'>> {
	return t.run((ctx) =>
		ctx.db.insert('evaluations', {
			studentId: args.studentId,
			teacherId: args.teacherId,
			value: 2,
			categoryId: args.categoryId,
			details: 'Seed evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		})
	);
}

describe('evaluations.create (real handler)', () => {
	beforeEach(() => {
		mockAuthUser({ authId: 'admin-1' });
	});
	afterEach(() => vi.restoreAllMocks());

	it('creates evaluations and audit logs for the authenticated user', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const studentId = await seedStudent(t, 'STU-CREATE-001');
		const categoryId = await seedCategory(t);

		const ids = await t.mutation(api.evaluations.create, {
			studentIds: [studentId],
			value: 3,
			categoryId,
			details: 'Great work',
			semesterId: '2025-H1'
		});

		expect(ids).toHaveLength(1);

		const evaluation = await t.run((ctx) => ctx.db.get(ids[0] as Id<'evaluations'>));
		expect(evaluation).toMatchObject({
			teacherId,
			studentId,
			value: 3,
			details: 'Great work'
		});

		const auditLogs = await t.run((ctx) => ctx.db.query('audit_logs').collect());
		expect(auditLogs).toHaveLength(1);
		expect(auditLogs[0]).toMatchObject({ action: 'create_evaluation', performerId: teacherId });
	});

	it('throws when the category does not exist', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const studentId = await seedStudent(t, 'STU-CREATE-002');
		// Use a real category ID, then delete it so the row no longer exists
		const categoryId = await seedCategory(t, 'To Delete');
		await t.run((ctx) => ctx.db.delete(categoryId));

		await expect(
			t.mutation(api.evaluations.create, {
				studentIds: [studentId],
				value: 1,
				categoryId,
				details: 'x',
				semesterId: '2025-H1'
			})
		).rejects.toThrow('does not exist');
	});
});

describe('evaluations.update (real handler)', () => {
	beforeEach(() => {
		mockAuthUser({ authId: 'admin-1' });
	});
	afterEach(() => vi.restoreAllMocks());

	it('updates own evaluation and writes an audit log', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const studentId = await seedStudent(t, 'STU-UPDATE-001');
		const categoryId = await seedCategory(t);
		const evaluationId = await seedEvaluation(t, { studentId, teacherId, categoryId });

		const result = await t.mutation(api.evaluations.update, {
			id: evaluationId,
			value: 5,
			details: 'Updated details'
		});

		expect(result).toEqual({ success: true });

		const evaluation = await t.run((ctx) => ctx.db.get(evaluationId));
		expect(evaluation).toMatchObject({ value: 5, details: 'Updated details' });

		const auditLogs = await t.run((ctx) => ctx.db.query('audit_logs').collect());
		expect(auditLogs).toHaveLength(1);
		expect(auditLogs[0].action).toBe('update_evaluation');
	});

	it('rejects editing an evaluation created by another teacher', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const otherTeacher = await seedUser(t, {
			authId: 'other-teacher',
			name: 'Other Teacher',
			role: 'teacher'
		});
		const studentId = await seedStudent(t, 'STU-UPDATE-002');
		const categoryId = await seedCategory(t);
		const evaluationId = await seedEvaluation(t, {
			studentId,
			teacherId: otherTeacher,
			categoryId
		});

		await expect(
			t.mutation(api.evaluations.update, {
				id: evaluationId,
				details: 'nope'
			})
		).rejects.toThrow('Not authorized to edit this evaluation');
	});

	it("allows an active Super to correct another teacher's evaluation", async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'super-1' });
		const superId = await seedUser(t, { authId: 'super-1', role: 'super' });
		const otherTeacher = await seedUser(t, {
			authId: 'other-teacher-super-test',
			role: 'teacher'
		});
		const studentId = await seedStudent(t, 'STU-UPDATE-SUPER-001');
		const categoryId = await seedCategory(t);
		const evaluationId = await seedEvaluation(t, {
			studentId,
			teacherId: otherTeacher,
			categoryId
		});

		const result = await t.mutation(api.evaluations.update, {
			id: evaluationId,
			details: 'Corrected by Super'
		});

		expect(result).toEqual({ success: true });
		expect(superId).toBeDefined();
		await expect(
			t.query(api.evaluations.getEvaluation, { id: evaluationId })
		).resolves.toMatchObject({
			details: 'Corrected by Super'
		});
	});
});

describe('evaluations.remove (real handler)', () => {
	beforeEach(() => {
		mockAuthUser({ authId: 'admin-1' });
	});
	afterEach(() => vi.restoreAllMocks());

	it('removes own evaluation and writes an audit log', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const studentId = await seedStudent(t, 'STU-REMOVE-001');
		const categoryId = await seedCategory(t);
		const evaluationId = await seedEvaluation(t, { studentId, teacherId, categoryId });

		await t.mutation(api.evaluations.remove, { id: evaluationId });

		const evaluation = await t.run((ctx) => ctx.db.get(evaluationId));
		expect(evaluation).toBeNull();

		const auditLogs = await t.run((ctx) => ctx.db.query('audit_logs').collect());
		expect(auditLogs).toHaveLength(1);
		expect(auditLogs[0].action).toBe('delete_evaluation');
	});

	it('rejects removing another teachers evaluation', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const otherTeacher = await seedUser(t, {
			authId: 'other-teacher',
			name: 'Other Teacher',
			role: 'teacher'
		});
		const studentId = await seedStudent(t, 'STU-REMOVE-002');
		const categoryId = await seedCategory(t);
		const evaluationId = await seedEvaluation(t, {
			studentId,
			teacherId: otherTeacher,
			categoryId
		});

		await expect(t.mutation(api.evaluations.remove, { id: evaluationId })).rejects.toThrow(
			'Not authorized to delete this evaluation'
		);
	});

	it('throws when evaluation is locked (older than a week)', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const studentId = await seedStudent(t, 'STU-REMOVE-003');
		const categoryId = await seedCategory(t);

		const oldEvaluationId = await t.run((ctx) =>
			ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Old evaluation',
				timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
				semesterId: '2025-H1'
			})
		);

		await expect(t.mutation(api.evaluations.remove, { id: oldEvaluationId })).rejects.toThrow(
			'can no longer be deleted'
		);
	});
});

describe('evaluations.listRecent (real handler)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('returns only evaluations from the authenticated user', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'admin-1' });

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const otherTeacherId = await seedUser(t, {
			authId: 'teacher-2',
			name: 'Other Teacher',
			role: 'teacher'
		});
		const studentId = await seedStudent(t, 'STU-RECENT-001');
		const categoryId = await seedCategory(t, 'Recent Category');
		await seedEvaluation(t, { studentId, teacherId, categoryId });
		await seedEvaluation(t, { studentId, teacherId: otherTeacherId, categoryId });

		const result = await t.query(api.evaluations.listRecent, {});

		expect(result).toHaveLength(1);
		expect(result[0].teacherId).toBe(teacherId);
		expect(result[0].details).toBe('Seed evaluation');
		expect(result[0].category).toBe('Recent Category');
	});

	it('includes admin-authored evaluations for Not Enrolled students', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'admin-1' });

		const adminId = await seedUser(t, { authId: 'admin-1', name: 'Admin One', role: 'admin' });
		const classId = await t.run((ctx) => ctx.db.insert('classes', { grade: 10, class: '1' }));
		const unenrolledStudentId = await t.run((ctx) =>
			ctx.db.insert('students', {
				englishName: 'Unenrolled Student',
				chineseName: '未入學學生',
				studentId: 'STU-UNENROLLED-ADMIN-001',
				classId,
				status: 'Not Enrolled'
			})
		);

		const categoryId = await seedCategory(t);
		await seedEvaluation(t, { studentId: unenrolledStudentId, teacherId: adminId, categoryId });

		const result = await t.query(api.evaluations.listRecent, {});

		expect(result).toHaveLength(1);
		expect(result[0].teacherId).toBe(adminId);
	});

	it('returns empty list when not authenticated', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser(null);

		const result = await t.query(api.evaluations.listRecent, {});

		expect(result).toEqual({ evaluations: [], cursor: null });
	});

	it('filters out unenrolled students for non-admin users', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'teacher-1' });

		const teacherId = await seedUser(t, { authId: 'teacher-1', role: 'teacher' });
		const classId = await t.run((ctx) => ctx.db.insert('classes', { grade: 10, class: '1' }));

		const unenrolledStudentId = await t.run((ctx) =>
			ctx.db.insert('students', {
				englishName: 'Unenrolled Student',
				chineseName: '未入學學生',
				studentId: 'STU-UNENROLLED-001',
				classId,
				status: 'Not Enrolled'
			})
		);

		const categoryId = await seedCategory(t);
		await seedEvaluation(t, {
			studentId: unenrolledStudentId,
			teacherId,
			categoryId
		});

		const result = await t.query(api.evaluations.listRecent, {});

		expect(result).toHaveLength(0);
	});
});

describe('evaluations.getUserByAuthId (real handler)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('returns the matching user role and status', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'admin-1' });

		await seedUser(t, { authId: 'target-user', name: 'Target', role: 'teacher' });

		const result = await t.query(api.evaluations.getUserByAuthId, {
			authId: 'target-user'
		});

		expect(result).toEqual({ authId: 'target-user', role: 'teacher', status: 'active' });
	});

	it('returns null when not authenticated', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser(null);

		const result = await t.query(api.evaluations.getUserByAuthId, {
			authId: 'target-user'
		});

		expect(result).toBeNull();
	});
});

describe('evaluations.getStudentByStudentIdCode (real handler)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('returns student by studentId code for non-student users', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'admin-1' });
		await seedUser(t, { authId: 'admin-1', role: 'admin' });

		const studentId = await seedStudent(t, 'S1001');

		const result = await t.query(api.evaluations.getStudentByStudentIdCode, {
			studentIdCode: 'S1001'
		});

		expect(result?._id).toEqual(studentId);
		expect(result?.studentId).toBe('S1001');
	});

	it('throws when not authenticated', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser(null);

		await expect(
			t.query(api.evaluations.getStudentByStudentIdCode, {
				studentIdCode: 'S1001'
			})
		).rejects.toThrow('Unauthorized');
	});

	it('rejects pending staff from student lookup', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'pending-teacher' });
		await seedUser(t, { authId: 'pending-teacher', role: 'teacher', status: 'pending' });

		await expect(
			t.query(api.evaluations.getStudentByStudentIdCode, { studentIdCode: 'S1001' })
		).rejects.toThrow('Active staff access required');
	});
});

describe('evaluations.getStudentEvaluationsAll (real handler)', () => {
	beforeEach(() => {
		mockAuthUser({ authId: 'admin-1' });
	});
	afterEach(() => vi.restoreAllMocks());

	it('returns all evaluations for a student with teacher names', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const studentId = await seedStudent(t, 'STU-ALL-001');
		const categoryId = await seedCategory(t);
		await seedEvaluation(t, { studentId, teacherId, categoryId });

		const result = await t.query(api.evaluations.getStudentEvaluationsAll, { studentId });

		expect(result).toHaveLength(1);
		expect(result[0].teacherName).toBe('Admin One');
	});
});

describe('evaluations.listAllEvaluations (real handler)', () => {
	beforeEach(() => {
		mockAuthUser({ authId: 'admin-1' });
	});
	afterEach(() => vi.restoreAllMocks());

	it('returns evaluations and hides unenrolled students by default', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const categoryId = await seedCategory(t);
		const classId = await t.run((ctx) => ctx.db.insert('classes', { grade: 10, class: '1' }));

		const enrolledStudentId = await t.run((ctx) =>
			ctx.db.insert('students', {
				englishName: 'Enrolled Student',
				chineseName: '在學學生',
				studentId: 'STU-LIST-001',
				classId,
				status: 'Enrolled'
			})
		);
		const unenrolledStudentId = await t.run((ctx) =>
			ctx.db.insert('students', {
				englishName: 'Not Enrolled Student',
				chineseName: '未入學學生',
				studentId: 'STU-LIST-002',
				classId,
				status: 'Not Enrolled'
			})
		);

		await seedEvaluation(t, { studentId: enrolledStudentId, teacherId, categoryId });
		await seedEvaluation(t, { studentId: unenrolledStudentId, teacherId, categoryId });

		const result = await t.query(api.evaluations.listAllEvaluations, {});

		expect(result).toHaveLength(1);
		expect(result[0].studentId).toBe(enrolledStudentId.toString());
	});

	it('includes unenrolled students when showUnenrolled is true', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const categoryId = await seedCategory(t);
		const classId = await t.run((ctx) => ctx.db.insert('classes', { grade: 10, class: '1' }));
		const unenrolledStudentId = await t.run((ctx) =>
			ctx.db.insert('students', {
				englishName: 'Not Enrolled Student',
				chineseName: '未入學學生',
				studentId: 'STU-LIST-003',
				classId,
				status: 'Not Enrolled'
			})
		);
		await seedEvaluation(t, { studentId: unenrolledStudentId, teacherId, categoryId });

		const result = await t.query(api.evaluations.listAllEvaluations, {
			showUnenrolled: true
		});

		expect(result).toHaveLength(1);
	});
});

describe('evaluations.getWeeklyReportDetail (real handler)', () => {
	beforeEach(() => {
		mockAuthUser({ authId: 'admin-1' });
	});
	afterEach(() => vi.restoreAllMocks());

	it('aggregates per-student points within the week', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'admin-1', name: 'Admin One' });
		const studentId = await seedStudent(t, 'STU-WEEKLY-001');
		const categoryId = await seedCategory(t, 'Participation');

		// fridayDate is the Monday of the week; eval timestamps must be strictly after it
		const monday = Date.now() - 100000;

		await t.run((ctx) =>
			ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 2,
				categoryId,
				details: 'First',
				timestamp: monday + 1000,
				semesterId: '2025-H1'
			})
		);
		await t.run((ctx) =>
			ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 3,
				categoryId,
				details: 'Second',
				timestamp: monday + 2000,
				semesterId: '2025-H1'
			})
		);

		const result = await t.query(api.evaluations.getWeeklyReportDetail, {
			fridayDate: monday
		});

		expect(result).toHaveLength(1);
		expect(result[0].studentId).toBe('STU-WEEKLY-001');
		expect(result[0].totalPoints).toBe(5);
		expect(result[0].pointsByCategory).toEqual({ Participation: 5 });
	});
});

describe('evaluation read authorization (real handlers)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('rejects pending teachers from teacher history reads', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'pending-teacher' });
		await seedUser(t, { authId: 'pending-teacher', role: 'teacher', status: 'pending' });
		const studentId = await seedStudent(t, 'PENDING-READ-001');

		await expect(
			t.query(api.evaluations.getStudentEvaluationsByTeacher, { studentId })
		).rejects.toThrow('Active staff access required');
	});

	it('hides evaluations from inactive admins', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'inactive-admin' });
		const adminId = await seedUser(t, {
			authId: 'inactive-admin',
			role: 'admin',
			status: 'pending'
		});
		const studentId = await seedStudent(t, 'INACTIVE-READ-001');
		const categoryId = await seedCategory(t);
		const evaluationId = await seedEvaluation(t, {
			studentId,
			teacherId: adminId,
			categoryId
		});

		const result = await t.query(api.evaluations.getEvaluation, { id: evaluationId });

		expect(result).toBeNull();
	});
});

describe('evaluations.getStudentEvaluationsAllByTeacher (real handler)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('returns evaluations from ALL teachers for the student, not just the viewer', async () => {
		const t = convexTest(schema, modules);

		mockAuthUser({ authId: 'teacher-viewer', role: 'teacher' });
		const viewerTeacherId = await seedUser(t, { authId: 'teacher-viewer', role: 'teacher' });
		const otherTeacherId = await seedUser(t, {
			authId: 'other-teacher-x',
			name: 'Other Teacher',
			role: 'teacher'
		});
		const studentId = await seedStudent(t, 'STU-XTEACHER-001');
		const categoryId = await seedCategory(t);
		await seedEvaluation(t, { studentId, teacherId: viewerTeacherId, categoryId });
		await seedEvaluation(t, { studentId, teacherId: otherTeacherId, categoryId });

		const result = await t.query(api.evaluations.getStudentEvaluationsAllByTeacher, { studentId });

		// Both teachers' evaluations are visible to a teacher in the cross-teacher scope.
		expect(result).toHaveLength(2);
		const names = result.map((e: { teacherName: string }) => e.teacherName).sort();
		expect(names).toContain('Other Teacher');
		expect(names).toHaveLength(2);
	});

	it('throws for non-teacher staff', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'admin-1' });
		await seedUser(t, { authId: 'admin-1', role: 'admin' });
		const studentId = await seedStudent(t, 'STU-XTEACHER-002');

		await expect(
			t.query(api.evaluations.getStudentEvaluationsAllByTeacher, { studentId })
		).rejects.toThrow();
	});

	it('throws for students', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'student-1', email: 's999001@std.hwhs.tc.edu.tw' });
		const studentId = await seedStudent(t, 'STU-XTEACHER-003');

		await expect(
			t.query(api.evaluations.getStudentEvaluationsAllByTeacher, { studentId })
		).rejects.toThrow();
	});
});

describe('evaluations.getStudentEvaluationsAnonymous (real handler)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('returns anonymous evaluations for the Enrolled student matched by email', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await seedUser(t, { authId: 'teacher-1', role: 'teacher' });
		const studentId = await seedStudent(t, '999001');
		const categoryId = await seedCategory(t);

		// Authenticated via a student-domain Google email; no users profile row exists
		mockAuthUser({ authId: 'student-1', email: 's999001@std.hwhs.tc.edu.tw' });

		await seedEvaluation(t, { studentId, teacherId, categoryId });

		const result = await t.query(api.evaluations.getStudentEvaluationsAnonymous, {});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ value: 2, details: 'Seed evaluation' });
		expect(result[0]).not.toHaveProperty('teacherId');
		expect(result[0]).not.toHaveProperty('teacherName');
	});

	it('returns no evaluations for a Not Enrolled student record', async () => {
		const t = convexTest(schema, modules);

		const studentId = await seedStudent(t, '999002');
		await t.run((ctx) => ctx.db.patch(studentId, { status: 'Not Enrolled' }));

		mockAuthUser({ authId: 'student-2', email: 's999002@std.hwhs.tc.edu.tw' });

		const result = await t.query(api.evaluations.getStudentEvaluationsAnonymous, {});

		expect(result).toEqual([]);
	});

	it('returns no evaluations when the email matches no student record', async () => {
		const t = convexTest(schema, modules);

		mockAuthUser({ authId: 'student-3', email: 's999999@std.hwhs.tc.edu.tw' });

		const result = await t.query(api.evaluations.getStudentEvaluationsAnonymous, {});

		expect(result).toEqual([]);
	});

	it('throws for non-student users', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser({ authId: 'admin-1' });
		await seedUser(t, { authId: 'admin-1', role: 'admin' });

		await expect(t.query(api.evaluations.getStudentEvaluationsAnonymous, {})).rejects.toThrow(
			'Only students can access this endpoint'
		);
	});
});
