import { describe, it, expect } from 'vite-plus/test';
import { convexTest, modules, mockAuthUser, seedUser, createStudentWithClass } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

describe('dataFactory.createEvaluationForStudent', () => {
	async function seedAdminAndStudent(
		t: Awaited<ReturnType<typeof convexTest>>,
		studentCode: string
	): Promise<string> {
		await seedUser(t, { authId: 'seed-admin', name: 'Seed Admin', role: 'admin' });
		mockAuthUser({ authId: 'seed-admin', name: 'Seed Admin', role: 'admin', status: 'active' });

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Test Student',
			chineseName: '測試',
			studentId: studentCode,
			grade: 10,
			classNum: '1',
			status: 'Enrolled',
			e2eTag: 'ev-tag'
		});
		return studentId;
	}

	it('creates an evaluation pointing at the seeded student', async () => {
		const t = await convexTest(schema, modules);
		const seededStudentId = await seedAdminAndStudent(t, 'EV1001');

		const evaluationId = await t.mutation(api.dataFactory.createEvaluationForStudent, {
			studentId: 'EV1001',
			e2eTag: 'ev-tag'
		});

		const evaluation = await t.run((ctx) => ctx.db.get(evaluationId));
		expect(evaluation?.studentId).toBe(seededStudentId);
		expect(evaluation?.e2eTag).toBe('ev-tag');
	});

	it('does not create an audit log for seeded evaluations', async () => {
		const t = await convexTest(schema, modules);
		await seedAdminAndStudent(t, 'EV1005');

		const evaluationId = await t.mutation(api.dataFactory.createEvaluationForStudent, {
			studentId: 'EV1005',
			e2eTag: 'ev-tag'
		});

		const auditLog = await t.run((ctx) =>
			ctx.db
				.query('audit_logs')
				.filter((q) =>
					q.and(
						q.eq(q.field('targetTable'), 'evaluations'),
						q.eq(q.field('targetId'), evaluationId.toString())
					)
				)
				.first()
		);
		expect(auditLog).toBeNull();
	});

	it('matches the seeded student even when many other students exist', async () => {
		const t = await convexTest(schema, modules);
		const seededStudentId = await seedAdminAndStudent(t, 'EV1002');
		for (let i = 0; i < 20; i += 1) {
			await createStudentWithClass(t, {
				englishName: `Other ${i}`,
				chineseName: '其他',
				studentId: `EV2${String(i).padStart(3, '0')}`,
				grade: 10,
				classNum: '1',
				status: 'Enrolled',
				e2eTag: 'ev-tag'
			});
		}

		const evaluationId = await t.mutation(api.dataFactory.createEvaluationForStudent, {
			studentId: 'EV1002',
			e2eTag: 'ev-tag'
		});

		const evaluation = await t.run((ctx) => ctx.db.get(evaluationId));
		expect(evaluation?.studentId).toBe(seededStudentId);
	});

	it('throws when no student matches the studentId', async () => {
		const t = await convexTest(schema, modules);
		await seedAdminAndStudent(t, 'EV1003');

		await expect(
			t.mutation(api.dataFactory.createEvaluationForStudent, {
				studentId: 'NOPE',
				e2eTag: 'ev-tag'
			})
		).rejects.toThrow('Student with ID "NOPE" not found');
	});

	it('rejects unauthenticated callers before touching the student lookup', async () => {
		const t = await convexTest(schema, modules);
		mockAuthUser(null);

		await expect(
			t.mutation(api.dataFactory.createEvaluationForStudent, {
				studentId: 'EV1004',
				e2eTag: 'ev-tag'
			})
		).rejects.toThrow('User not authenticated.');
	});
});

describe('dataFactory department-aware factories', () => {
	async function seeded() {
		const t = await convexTest(schema, modules);
		await seedUser(t, { authId: 'factory-admin', name: 'Factory Admin', role: 'admin' });
		mockAuthUser({
			authId: 'factory-admin',
			name: 'Factory Admin',
			role: 'admin',
			status: 'active'
		});
		return t;
	}

	it('createEslSemester writes an ESL semester and no HWIS rows', async () => {
		const t = await seeded();

		const semesterId = await t.mutation(api.dataFactory.createEslSemester, {
			year: '2025-2026',
			term: 'S1',
			startDate: '2025-08-25',
			e2eTag: 'esl-tag'
		});

		const semester = await t.run((ctx) => ctx.db.get(semesterId));
		expect(semester?.year).toBe('2025-2026');
		expect(semester?.e2eTag).toBe('esl-tag');

		const hwis = await t.run(async (ctx) => ({
			classes: await ctx.db.query('classes').collect(),
			students: await ctx.db.query('students').collect(),
			events: await ctx.db.query('house_events').collect()
		}));
		expect(hwis).toEqual({ classes: [], students: [], events: [] });
	});

	it('createEslCohort creates the cohort and its ESL classes only', async () => {
		const t = await seeded();

		const { cohortId, classIds } = await t.mutation(api.dataFactory.createEslCohort, {
			year: '2025-2026',
			grade: 7,
			level: 'A',
			classNumber: '1',
			e2eTag: 'esl-tag'
		});

		const classes = await t.run((ctx) => Promise.all(classIds.map((id) => ctx.db.get(id))));
		expect(classes.every((cls) => cls?.cohortId === cohortId)).toBe(true);
		expect(classes.map((cls) => cls?.type).sort()).toEqual(['CLIL', 'Comm']);

		const hwisClasses = await t.run((ctx) => ctx.db.query('classes').collect());
		expect(hwisClasses).toHaveLength(0);
	});

	it('createEslClass adds a class to a cohort without touching HWIS classes', async () => {
		const t = await seeded();
		const { cohortId } = await t.mutation(api.dataFactory.createEslCohort, {
			year: '2025-2026',
			grade: 9,
			classNumber: '1',
			e2eTag: 'esl-tag'
		});

		const classId = await t.mutation(api.dataFactory.createEslClass, {
			cohortId,
			type: 'G9',
			name: 'G9-1'
		});

		const cls = await t.run((ctx) => ctx.db.get(classId));
		expect(cls?.cohortId).toBe(cohortId);
		expect(cls?.name).toBe('G9-1');
		expect(await t.run((ctx) => ctx.db.query('classes').collect())).toHaveLength(0);
	});

	it('createEslStudent references the ESL cohort, not an HWIS class', async () => {
		const t = await seeded();
		const { cohortId } = await t.mutation(api.dataFactory.createEslCohort, {
			year: '2025-2026',
			grade: 7,
			level: 'A',
			classNumber: '1',
			e2eTag: 'esl-tag'
		});

		const studentId = await t.mutation(api.dataFactory.createEslStudent, {
			cohortId,
			englishName: 'Alice Chan',
			chineseName: '陳小美',
			schoolStudentId: '7001001',
			e2eTag: 'esl-tag'
		});

		const student = await t.run((ctx) => ctx.db.get(studentId));
		expect(student?.cohortId).toBe(cohortId);
		expect(student?.schoolStudentId).toBe('7001001');
		expect(await t.run((ctx) => ctx.db.query('students').collect())).toHaveLength(0);
	});

	it('createEslEvent writes an ESL event and no HWIS house event', async () => {
		const t = await seeded();
		const semesterId = await t.mutation(api.dataFactory.createEslSemester, {
			e2eTag: 'esl-tag'
		});

		const eventId = await t.mutation(api.dataFactory.createEslEvent, {
			semesterId,
			type: 'no_school',
			title: 'Moon Festival',
			date: '2025-10-06',
			e2eTag: 'esl-tag'
		});

		const event = await t.run((ctx) => ctx.db.get(eventId));
		expect(event?.title).toBe('Moon Festival');
		expect(event?.semesterId).toBe(semesterId);
		expect(await t.run((ctx) => ctx.db.query('house_events').collect())).toHaveLength(0);
	});

	it('createEslMeeting and createEslNote stay inside the ESL graph', async () => {
		const t = await seeded();
		const teacherId = await t.run(async (ctx) => {
			const users = await ctx.db.query('users').collect();
			return users[0]._id;
		});
		const { classIds } = await t.mutation(api.dataFactory.createEslCohort, {
			year: '2025-2026',
			grade: 7,
			level: 'A',
			classNumber: '1',
			e2eTag: 'esl-tag'
		});
		const [classId] = classIds;
		if (!classId) throw new Error('expected the cohort factory to create classes');

		const meetingId = await t.mutation(api.dataFactory.createEslMeeting, {
			classId,
			day: 'Tuesday',
			period: 3,
			e2eTag: 'esl-tag'
		});
		const noteId = await t.mutation(api.dataFactory.createEslNote, {
			classId,
			teacherId,
			date: '2025-09-02',
			text: 'Bring flashcards',
			e2eTag: 'esl-tag'
		});

		expect((await t.run((ctx) => ctx.db.get(meetingId)))?.day).toBe('Tuesday');
		expect((await t.run((ctx) => ctx.db.get(noteId)))?.text).toBe('Bring flashcards');
		expect(await t.run((ctx) => ctx.db.query('classes').collect())).toHaveLength(0);
		expect(await t.run((ctx) => ctx.db.query('students').collect())).toHaveLength(0);
	});

	it('createEslAvailability stays inside the ESL graph', async () => {
		const t = await seeded();
		const teacherId = await t.run(async (ctx) => {
			const users = await ctx.db.query('users').collect();
			return users[0]._id;
		});

		const availabilityId = await t.mutation(api.dataFactory.createEslAvailability, {
			teacherId,
			day: 'Friday',
			period: 8,
			e2eTag: 'esl-tag'
		});

		const row = await t.run((ctx) => ctx.db.get(availabilityId));
		expect(row?.period).toBe(8);
		expect(row?.e2eTag).toBe('esl-tag');
	});

	it('createTestUser accepts the departments a shared user belongs to', async () => {
		const t = await seeded();

		const eslUserId = await t.mutation(api.dataFactory.createTestUser, {
			authId: 'e2e_esl_staff',
			department: 'esl',
			departmentRole: 'teacher',
			e2eTag: 'esl-tag'
		});
		const hybridUserId = await t.mutation(api.dataFactory.createTestUser, {
			authId: 'e2e_hybrid_staff',
			department: 'both',
			departmentRole: 'admin',
			e2eTag: 'esl-tag'
		});

		expect((await t.run((ctx) => ctx.db.get(eslUserId)))?.departmentRoles).toEqual({
			esl: 'teacher'
		});
		expect((await t.run((ctx) => ctx.db.get(hybridUserId)))?.departmentRoles).toEqual({
			international: 'admin',
			esl: 'admin'
		});
	});

	it('createHwisClass and createStudentWithId write only HWIS tables', async () => {
		const t = await seeded();

		const classId = await t.mutation(api.dataFactory.createHwisClass, {
			grade: 10,
			class: '1',
			e2eTag: 'hwis-tag'
		});
		await t.mutation(api.dataFactory.createStudentWithId, {
			studentId: 'HW1001',
			grade: 10,
			class: '1',
			e2eTag: 'hwis-tag'
		});

		expect((await t.run((ctx) => ctx.db.get(classId)))?.grade).toBe(10);
		expect(await t.run((ctx) => ctx.db.query('students').collect())).toHaveLength(1);

		const esl = await t.run(async (ctx) => ({
			cohorts: await ctx.db.query('esl_cohorts').collect(),
			students: await ctx.db.query('esl_students').collect(),
			classes: await ctx.db.query('esl_classes').collect()
		}));
		expect(esl).toEqual({ cohorts: [], students: [], classes: [] });
	});
});

describe('dataFactory.seedManyStudents', () => {
	async function seedAsAdmin(args: {
		count: number;
		grade: number;
		class?: string;
		e2eTag?: string;
	}) {
		const t = await convexTest(schema, modules);
		await seedUser(t, { authId: 'seed-admin', name: 'Seed Admin', role: 'admin' });
		mockAuthUser({ authId: 'seed-admin', name: 'Seed Admin', role: 'admin', status: 'active' });

		const result = await t.mutation(api.dataFactory.seedManyStudents, args);
		const students = await t.run((ctx) => ctx.db.query('students').collect());
		return { t, result, students };
	}

	it('seeds the requested number of tagged students with unique IDs', async () => {
		const { result, students } = await seedAsAdmin({ count: 150, grade: 10, e2eTag: 't1' });

		expect(result.count).toBe(150);
		expect(students).toHaveLength(150);
		expect(students.every((s) => s.e2eTag === 't1')).toBe(true);
		expect(students.every((s) => s.status === 'Enrolled')).toBe(true);
		expect(new Set(students.map((s) => s.studentId)).size).toBe(150);
	});

	it('places seeded students in the requested grade', async () => {
		const { t, students } = await seedAsAdmin({ count: 5, grade: 7, e2eTag: 't2' });

		const classIds = [...new Set(students.map((s) => s.classId))];
		const classes = await t.run((ctx) => Promise.all(classIds.map((id) => ctx.db.get(id))));
		expect(classes.every((c) => c?.grade === 7)).toBe(true);
	});
});
