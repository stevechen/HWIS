import { describe, it, expect, afterEach, vi } from 'vite-plus/test';
import { convexTest, modules, seedEslStaff, type ConvexTestInstance } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';

async function asEslAdmin(authId = 'esl-admin') {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin', name: 'Ada Admin' });
	return t;
}

async function createCohort(
	t: ConvexTestInstance,
	options: { grade?: number; level?: string; classNumber?: string; year?: string } = {}
) {
	return t.mutation(api.esl.cohorts.create, {
		year: options.year ?? '2025-2026',
		grade: options.grade ?? 7,
		level: options.level ?? 'Advanced',
		classNumber: options.classNumber ?? '1'
	});
}

async function addStudent(
	t: ConvexTestInstance,
	cohortId: Id<'esl_cohorts'>,
	options: {
		schoolStudentId: string;
		englishName?: string;
		chineseName?: string;
		chineseClass?: string;
		status?: 'active' | 'disabled';
	}
) {
	return t.run((ctx) =>
		ctx.db.insert('esl_students', {
			cohortId,
			schoolStudentId: options.schoolStudentId,
			englishName: options.englishName,
			chineseName: options.chineseName ?? '學生',
			chineseClass: options.chineseClass,
			status: options.status ?? 'active',
			enrolledAt: 1
		})
	);
}

/**
 * Two connected cohorts: A draws J101/J102 and B draws J101/J103, so they are
 * one band. Every test that needs a move to stay inside a band starts here.
 */
async function seedBandedPair(t: ConvexTestInstance) {
	const advanced = await createCohort(t, { level: 'Advanced', classNumber: '1' });
	const alice = await addStudent(t, advanced.cohortId, {
		schoolStudentId: '7001001',
		englishName: 'Alice Chan',
		chineseName: '陳小美',
		chineseClass: '01'
	});
	await addStudent(t, advanced.cohortId, {
		schoolStudentId: '7001002',
		englishName: 'Bob Lee',
		chineseName: '李大文',
		chineseClass: '02'
	});
	const basic = await createCohort(t, { level: 'Basic', classNumber: '2' });
	const carol = await addStudent(t, basic.cohortId, {
		schoolStudentId: '7001003',
		englishName: 'Carol Ho',
		chineseName: '何家明',
		chineseClass: '01'
	});
	await addStudent(t, basic.cohortId, {
		schoolStudentId: '7001004',
		englishName: 'Dan Wu',
		chineseName: '吳大文',
		chineseClass: '03'
	});
	return { advanced, basic, alice, carol };
}

describe('esl student transfers', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('search', () => {
		it('matches school ID, names, homeroom and class label', async () => {
			const t = await asEslAdmin();
			const { advanced } = await seedBandedPair(t);

			for (const term of ['7001001', 'alice', '陳小美', 'J101', 'Advanced 1']) {
				const hits = await t.query(api.esl.transfers.search, {
					year: '2025-2026',
					query: term
				});
				expect(hits.map((hit: { schoolStudentId: string }) => hit.schoolStudentId)).toContain(
					'7001001'
				);
				expect(hits[0]).toMatchObject({
					cohortId: advanced.cohortId,
					homeroom: 'J101',
					grade: 7
				});
			}
		});

		it('puts an exact school ID first and ignores students outside the year', async () => {
			const t = await asEslAdmin();
			await seedBandedPair(t);
			const otherYear = await createCohort(t, { year: '2026-2027', level: 'Advanced' });
			await addStudent(t, otherYear.cohortId, {
				schoolStudentId: '700100199',
				chineseName: '陳小美',
				chineseClass: '01'
			});

			const hits = await t.query(api.esl.transfers.search, {
				year: '2025-2026',
				query: '7001001'
			});
			expect(hits[0]?.schoolStudentId).toBe('7001001');
			expect(
				hits.every((hit: { schoolStudentId: string }) => hit.schoolStudentId !== '700100199')
			).toBe(true);
		});

		it('returns nothing for an empty search', async () => {
			const t = await asEslAdmin();
			await seedBandedPair(t);
			expect(await t.query(api.esl.transfers.search, { year: '2025-2026', query: '  ' })).toEqual(
				[]
			);
		});
	});

	describe('transferLevel', () => {
		it('moves the student, records history and stays quiet inside a band', async () => {
			const t = await asEslAdmin();
			const { advanced, basic, alice } = await seedBandedPair(t);
			// A second J101 in the source keeps A and B connected after Alice moves.
			await addStudent(t, advanced.cohortId, {
				schoolStudentId: '7001008',
				chineseClass: '01'
			});

			const result = await t.mutation(api.esl.transfers.transferLevel, {
				studentId: alice,
				toCohortId: basic.cohortId,
				reason: 'Re-levelled after assessment'
			});
			expect(result).toEqual({ success: true, bandChanged: false });

			const student = await t.query(api.esl.students.getById, { id: alice });
			expect(student?.cohortId).toBe(basic.cohortId);

			const history = await t.query(api.esl.transfers.history, { year: '2025-2026' });
			expect(history).toHaveLength(1);
			expect(history[0]).toMatchObject({
				kind: 'level',
				studentName: 'Alice Chan',
				schoolStudentId: '7001001',
				fromCohort: expect.stringContaining('G7 Advanced 1'),
				toCohort: expect.stringContaining('G7 Basic 2'),
				fromChineseClass: 'J101',
				toChineseClass: 'J101',
				reason: 'Re-levelled after assessment',
				movedBy: 'Ada Admin'
			});
		});

		it('warns when the move removes the source cohort’s last link to the band', async () => {
			const t = await asEslAdmin();
			const { basic, alice } = await seedBandedPair(t);

			// Alice is Advanced's only J101, and J101 is the only homeroom it
			// shares with Basic. Moving her to Basic splits the band.
			const result = await t.mutation(api.esl.transfers.transferLevel, {
				studentId: alice,
				toCohortId: basic.cohortId
			});
			expect(result.bandChanged).toBe(true);
		});

		it('warns when the target cohort is in a different band', async () => {
			const t = await asEslAdmin();
			const { alice } = await seedBandedPair(t);
			const isolated = await createCohort(t, { level: 'Elementary', classNumber: '3' });
			await addStudent(t, isolated.cohortId, {
				schoolStudentId: '7001005',
				chineseClass: '09'
			});

			const result = await t.mutation(api.esl.transfers.transferLevel, {
				studentId: alice,
				toCohortId: isolated.cohortId
			});
			expect(result.bandChanged).toBe(true);
		});

		it('warns when the target band does not already draw from the student homeroom', async () => {
			const t = await asEslAdmin();
			const { alice } = await seedBandedPair(t);
			// A band connected by J104/J105 that does not include Alice's J101.
			const other = await createCohort(t, { level: 'Elementary', classNumber: '3' });
			await addStudent(t, other.cohortId, {
				schoolStudentId: '7001006',
				chineseClass: '04'
			});
			const otherNeighbour = await createCohort(t, { level: 'Intermediate', classNumber: '4' });
			await addStudent(t, otherNeighbour.cohortId, {
				schoolStudentId: '7001007',
				chineseClass: '04'
			});

			const result = await t.mutation(api.esl.transfers.transferLevel, {
				studentId: alice,
				toCohortId: other.cohortId
			});
			expect(result.bandChanged).toBe(true);
		});

		it('refuses a no-op, a cross-grade target, an archived target and an inactive student', async () => {
			const t = await asEslAdmin();
			const { advanced, basic, alice } = await seedBandedPair(t);

			await expect(
				t.mutation(api.esl.transfers.transferLevel, {
					studentId: alice,
					toCohortId: advanced.cohortId
				})
			).rejects.toThrow(/already in that class/);

			const g8 = await createCohort(t, { grade: 8, level: 'Advanced' });
			await expect(
				t.mutation(api.esl.transfers.transferLevel, {
					studentId: alice,
					toCohortId: g8.cohortId
				})
			).rejects.toThrow(/same grade/);

			const archived = await createCohort(t, { level: 'Elementary', classNumber: '7' });
			await t.run((ctx) => ctx.db.patch(archived.cohortId, { status: 'archived' as const }));
			await expect(
				t.mutation(api.esl.transfers.transferLevel, {
					studentId: alice,
					toCohortId: archived.cohortId
				})
			).rejects.toThrow(/archived/);

			await t.mutation(api.esl.students.updateStatus, {
				id: alice,
				status: 'disabled',
				statusReason: 'Left'
			});
			await expect(
				t.mutation(api.esl.transfers.transferLevel, {
					studentId: alice,
					toCohortId: basic.cohortId
				})
			).rejects.toThrow(/active student/);
		});
	});

	describe('transferHomeroom', () => {
		it('stores the two-digit homeroom and leaves a still-connected band unchanged', async () => {
			const t = await asEslAdmin();
			const { advanced, alice } = await seedBandedPair(t);
			// A second J101 in the source cohort keeps A and B connected after Alice
			// moves off J101.
			await addStudent(t, advanced.cohortId, {
				schoolStudentId: '7001008',
				chineseClass: '01'
			});

			const result = await t.mutation(api.esl.transfers.transferHomeroom, {
				studentId: alice,
				chineseClass: 'J104',
				reason: 'Homeroom correction'
			});
			expect(result).toEqual({ success: true, bandChanged: false });

			const student = await t.query(api.esl.students.getById, { id: alice });
			expect(student?.chineseClass).toBe('04');

			const history = await t.query(api.esl.transfers.history, { year: '2025-2026' });
			expect(history[0]).toMatchObject({
				kind: 'homeroom',
				fromChineseClass: 'J101',
				toChineseClass: 'J104',
				reason: 'Homeroom correction'
			});
		});

		it('warns when the correction breaks the cohort out of its band', async () => {
			const t = await asEslAdmin();
			const { alice } = await seedBandedPair(t);

			// Alice is the only J101 in Advanced; moving her off it disconnects the
			// two cohorts that were joined by J101.
			const result = await t.mutation(api.esl.transfers.transferHomeroom, {
				studentId: alice,
				chineseClass: 'J104'
			});
			expect(result.bandChanged).toBe(true);
		});

		it('refuses a homeroom from the wrong grade', async () => {
			const t = await asEslAdmin();
			const { alice } = await seedBandedPair(t);

			await expect(
				t.mutation(api.esl.transfers.transferHomeroom, {
					studentId: alice,
					chineseClass: 'J201'
				})
			).rejects.toThrow(/not a grade 7 Chinese class/);
		});
	});

	it('refuses transfers to an ESL teacher', async () => {
		const t = await asEslAdmin();
		const { alice, basic } = await seedBandedPair(t);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

		await expect(
			t.mutation(api.esl.transfers.transferLevel, {
				studentId: alice,
				toCohortId: basic.cohortId
			})
		).rejects.toThrow(/ESL admin access required/);
	});
});
