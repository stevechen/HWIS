import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import { IMPORT_DISABLED_REASON } from '../shared/esl_import';

/**
 * Grade 9 in 2026-2027: a `113xxxx` ID is a student who entered in ROC 113, and
 * grade 9 is two years after intake, so the file's own arithmetic names the year
 * (see `deriveSchoolYear`).
 */
const YEAR = '2026-2027';
const GRADE = 9;
const OTHER_YEAR = '2025-2026';
const FROM = '2026-2027';
const TO = '2027-2028';

describe('advanceGrade', () => {
	async function asAdvancementAdmin() {
		const t = convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		return t;
	}

	/** A grade 7 cohort in the prior year, with a roster of `ids`. */
	async function seedG7(
		t: ReturnType<typeof convexTest>,
		level: string,
		classNumber: string,
		ids: string[]
	) {
		const { cohortId } = await t.mutation(api.esl.cohorts.create, {
			year: FROM,
			grade: 7,
			level,
			classNumber
		});
		for (const schoolStudentId of ids) {
			await t.run(async (ctx) => {
				await ctx.db.insert('esl_students', {
					cohortId,
					chineseName: '王芃頵',
					schoolStudentId,
					status: 'active',
					enrolledAt: 1
				});
			});
		}
		return cohortId;
	}

	/** The target year's cohorts for one grade, with the first one's roster. */
	async function targetGrade(t: ReturnType<typeof convexTest>, year: string, grade: number) {
		return t.run(async (ctx) => {
			// Scanned and filtered rather than read through by_year_grade: a
			// t.run context types custom indexes as system ones, and a test
			// database holds a handful of rows (the pattern other ESL tests use).
			const cohorts = (await ctx.db.query('esl_cohorts').collect()).filter(
				(c) => c.year === year && c.grade === grade
			);
			const students = (await ctx.db.query('esl_students').collect()).filter(
				(x) => x.cohortId === cohorts[0]!._id
			);
			return {
				cohorts: cohorts.map((c) => ({
					id: c._id,
					level: c.level,
					classNumber: c.classNumber
				})),
				students: students.map((s) => s.schoolStudentId).sort()
			};
		});
	}

	it('carries level, class number and roster into the next grade', async () => {
		const t = await asAdvancementAdmin();
		await seedG7(t, 'Basic', '1', ['1150001', '1150002']);

		const result = await t.mutation(api.esl.import.advanceGrade, {
			fromYear: FROM,
			toYear: TO,
			fromGrade: 7
		});

		expect(result.advanced).toBe(true);
		if (result.advanced !== true) throw new Error('expected an advance');
		expect(result.toGrade).toBe(8);
		expect(result.cohortsCreated).toBe(1);
		expect(result.studentsCarried).toBe(2);

		const after = await targetGrade(t, TO, 8);
		expect(after.cohorts).toHaveLength(1);
		expect(after.cohorts[0].level).toBe('Basic');
		expect(after.cohorts[0].classNumber).toBe('1');
		expect(after.students).toEqual(['1150001', '1150002']);
	});

	it('composes the classes that teach each carried cohort', async () => {
		// Through `cohorts.create`, so a G7/G8 cohort arrives with its CLIL and
		// Comm halves rather than with no classes at all.
		const t = await asAdvancementAdmin();
		await seedG7(t, 'Basic', '1', ['1150001']);

		await t.mutation(api.esl.import.advanceGrade, {
			fromYear: FROM,
			toYear: TO,
			fromGrade: 7
		});

		const types = await t.run(async (ctx) => {
			const cohort = (await ctx.db.query('esl_cohorts').collect()).find(
				(c) => c.year === TO && c.grade === 8
			)!;
			const classes = (await ctx.db.query('esl_classes').collect()).filter(
				(x) => x.cohortId === cohort._id
			);
			return classes.map((c) => c.type).sort();
		});

		expect(types).toEqual(['CLIL', 'Comm']);
	});

	it('leaves the prior year untouched', async () => {
		// A student has one row per year; last year's roster is history, which is
		// the reason the model is scoped by year at all.
		const t = await asAdvancementAdmin();
		const before = await seedG7(t, 'Basic', '1', ['1150001']);

		await t.mutation(api.esl.import.advanceGrade, {
			fromYear: FROM,
			toYear: TO,
			fromGrade: 7
		});

		const stillThere = await t.run(async (ctx) => {
			const roster = (await ctx.db.query('esl_students').collect()).filter(
				(x) => x.cohortId === before
			);
			const cohorts = (await ctx.db.query('esl_cohorts').collect()).filter(
				(x) => x.year === FROM && x.grade === 7
			);
			return { students: roster.length, cohorts: cohorts.length };
		});

		expect(stillThere).toEqual({ students: 1, cohorts: 1 });
	});

	it('is idempotent: a second run advances nothing', async () => {
		const t = await asAdvancementAdmin();
		await seedG7(t, 'Basic', '1', ['1150001']);
		const args = { fromYear: FROM, toYear: TO, fromGrade: 7 };

		await t.mutation(api.esl.import.advanceGrade, args);
		const second = await t.mutation(api.esl.import.advanceGrade, args);

		// Reported as a success that did less, not as a failure: the admin asked
		// for the year to be advanced and it already is.
		expect(second.advanced).toBe(false);
		if (second.advanced !== false) throw new Error('expected no second advance');
		expect(second.reason).toContain('nothing was written');

		const after = await targetGrade(t, TO, 8);
		expect(after.cohorts).toHaveLength(1);
		expect(after.students).toEqual(['1150001']);
	});

	it('refuses when the target year already has a roster it did not propose', async () => {
		const t = await asAdvancementAdmin();
		await seedG7(t, 'Basic', '1', ['1150001']);
		// The new year's grade 7 intake placed a Pre-Elementary class, which
		// carries into a grade 8 cohort this carry-forward never proposed.
		await t.mutation(api.esl.cohorts.create, {
			year: TO,
			grade: 8,
			level: 'Pre-Elementary',
			classNumber: '1'
		});

		await expect(
			t.mutation(api.esl.import.advanceGrade, { fromYear: FROM, toYear: TO, fromGrade: 7 })
		).rejects.toThrow(/shadow a real roster/);

		// Nothing was written: the refused advance left no half-built year.
		const after = await targetGrade(t, TO, 8);
		expect(after.cohorts).toHaveLength(1);
		expect(after.cohorts[0].level).toBe('Pre-Elementary');
	});

	it('carries nobody out of grade 9, and explains why', async () => {
		const t = await asAdvancementAdmin();
		const { cohortId } = await t.mutation(api.esl.cohorts.create, {
			year: FROM,
			grade: 9,
			level: 'Basic',
			classNumber: '1'
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('esl_students', {
				cohortId,
				chineseName: '王芃頵',
				schoolStudentId: '1130001',
				status: 'active',
				enrolledAt: 1
			});
		});

		const result = await t.mutation(api.esl.import.advanceGrade, {
			fromYear: FROM,
			toYear: TO,
			fromGrade: 9
		});

		expect(result.advanced).toBe(false);
		if (result.advanced !== false) throw new Error('expected no advance');
		expect(result.reason).toContain('separate scheme');
		// And the graduating roster is left where it is, as history.
		const after = await targetGrade(t, FROM, 9);
		expect(after.students).toEqual(['1130001']);
	});

	it('leaves a disabled student behind', async () => {
		const t = await asAdvancementAdmin();
		const { cohortId } = await t.mutation(api.esl.cohorts.create, {
			year: FROM,
			grade: 7,
			level: 'Basic',
			classNumber: '1'
		});
		await t.run(async (ctx) => {
			for (const [schoolStudentId, status] of [
				['1150001', 'active'],
				['1150002', 'disabled']
			] as const) {
				await ctx.db.insert('esl_students', {
					cohortId,
					chineseName: '王芃頵',
					schoolStudentId,
					status,
					enrolledAt: 1,
					...(status === 'disabled' ? { statusReason: 'Left the programme' } : {})
				});
			}
		});

		const result = await t.mutation(api.esl.import.advanceGrade, {
			fromYear: FROM,
			toYear: TO,
			fromGrade: 7
		});

		expect(result.advanced === true && result.studentsCarried).toBe(1);
		const after = await targetGrade(t, TO, 8);
		expect(after.students).toEqual(['1150001']);
	});

	it('refuses a year that is not YYYY-YYYY', async () => {
		const t = await asAdvancementAdmin();
		await expect(
			t.mutation(api.esl.import.advanceGrade, {
				fromYear: 'next year',
				toYear: TO,
				fromGrade: 7
			})
		).rejects.toThrow(/YYYY-YYYY/);
	});

	it('refuses an admin who is not an ESL admin', async () => {
		const t = convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		// Seeded directly rather than through `cohorts.create`, which is itself
		// admin-only — using it here would fail before the advance was reached,
		// and the test would pass for the wrong reason.
		await t.run(async (ctx) => {
			const cohortId = await ctx.db.insert('esl_cohorts', {
				year: FROM,
				grade: 7,
				level: 'Basic',
				classNumber: '1',
				status: 'active',
				createdAt: 1
			});
			await ctx.db.insert('esl_students', {
				cohortId,
				chineseName: '王芃頵',
				schoolStudentId: '1150001',
				status: 'active',
				enrolledAt: 1
			});
		});

		await expect(
			t.mutation(api.esl.import.advanceGrade, { fromYear: FROM, toYear: TO, fromGrade: 7 })
		).rejects.toThrow(/ESL admin access required/);
	});
});

/** An ESL admin: the only role that may apply a roster. */
async function asAdmin(authId = 'esl-admin') {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin' });
	return t;
}

/** One staged row, as the workbook's cells would be sent. */
function row(
	schoolStudentId: string,
	group: string,
	over: { chineseName?: string; englishName?: string; chineseClass?: string } = {}
) {
	return {
		schoolStudentId,
		chineseName: over.chineseName ?? '王芃頵',
		...(over.englishName === undefined ? {} : { englishName: over.englishName }),
		// The `C Class` cell, sent as the school writes it. Grade 9 here, so
		// `J301` — stored as the number `01` (ADR-0025).
		chineseClass: over.chineseClass ?? 'J301',
		group
	};
}

function applyRoster(
	t: ReturnType<typeof convexTest>,
	rows: ReturnType<typeof row>[],
	over: { year?: string; grade?: number; approvedNameChanges?: string[] } = {}
) {
	return t.mutation(api.esl.import.applyRosterImport, {
		year: over.year ?? YEAR,
		grade: over.grade ?? GRADE,
		rows,
		...(over.approvedNameChanges ? { approvedNameChanges: over.approvedNameChanges } : {})
	});
}

/** Enrols a student through the public mutation, which requires a name. */
async function enrol(
	t: ReturnType<typeof convexTest>,
	cohortId: string,
	schoolStudentId: string,
	englishName = 'Yoyo Lin'
) {
	return t.mutation(api.esl.students.create, {
		cohortId,
		schoolStudentId,
		chineseClass: 'J301',
		chineseName: '王芃頵',
		englishName
	});
}

async function makeG9(
	t: ReturnType<typeof convexTest>,
	year = YEAR,
	level = 'Advanced',
	classNumber = '1'
) {
	const { cohortId } = await t.mutation(api.esl.cohorts.create, {
		year,
		grade: 9,
		level,
		classNumber
	});
	return cohortId;
}

/** The students of a cohort, including the disabled ones. */
async function rosterOf(t: ReturnType<typeof convexTest>, cohortId: string) {
	return t.query(api.esl.students.listByCohort, { cohortId, includeDisabled: true });
}

describe('esl roster import', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('applyRosterImport', () => {
		it('creates the cohorts the file needs and enrols the students in them', async () => {
			const t = await asAdmin();

			const result = await applyRoster(t, [
				row('1130001', 'G9 Advanced 1', { englishName: 'Yoyo Lin' }),
				row('1130002', 'G9 Advanced 1', { englishName: 'Ada Ho' }),
				row('1130003', 'G9 Basic 1', { englishName: 'Ben Chu' })
			]);

			expect(result.added).toBe(3);
			expect(result.cohortsCreated).toEqual(['9 Advanced 1', '9 Basic 1']);

			const cohorts = await t.query(api.esl.cohorts.list, { year: YEAR, grade: 9 });
			const advanced = cohorts.find((c: { level: string }) => c.level === 'Advanced');
			const roster = await rosterOf(t, advanced._id);
			expect(roster.map((s: { schoolStudentId: string }) => s.schoolStudentId).sort()).toEqual([
				'1130001',
				'1130002'
			]);
			// The roster reads by English name, so the name is checked on its own row.
			const yoyo = roster.find((s: { schoolStudentId: string }) => s.schoolStudentId === '1130001');
			expect(yoyo.englishName).toBe('Yoyo Lin');
		});

		it('stores no English name for a row that has none', async () => {
			// A G7 intake arrives before the names are filled in, so a whole grade
			// can arrive without one. Storing `''` instead would make the name read
			// as edited rather than added when a teacher types it in later.
			const t = await asAdmin();

			const result = await applyRoster(t, [row('1130001', 'G9 Advanced 1')]);

			expect(result.added).toBe(1);
			const cohorts = await t.query(api.esl.cohorts.list, { year: YEAR, grade: 9 });
			const roster = await rosterOf(t, cohorts[0]._id);
			expect(roster[0].englishName).toBeUndefined();
			expect(roster[0].chineseName).toBe('王芃頵');
		});

		it('reads an ID Excel stored as a float as the same student', async () => {
			// Measured: 40 G9 rows hold `1130501.0`. Read literally these are a
			// different string from the same student, so the file would enrol one
			// person twice — which the duplicate guard then refuses, as it should.
			const t = await asAdmin();

			await expect(
				applyRoster(t, [row('1130501.0', 'G9 Advanced 1'), row('1130501', 'G9 Advanced 1')])
			).rejects.toThrow(/1130501/);
			expect(await t.query(api.esl.cohorts.list, { year: YEAR, grade: 9 })).toEqual([]);
		});

		it('moves an existing student to the cohort the file names', async () => {
			const t = await asAdmin();
			const advanced1 = await makeG9(t, YEAR, 'Advanced', '1');
			const studentId = await enrol(t, advanced1, '1130001');
			const advanced2 = await makeG9(t, YEAR, 'Advanced', '2');

			const result = await applyRoster(t, [row('1130001', 'G9 Advanced 2')]);

			expect(result.moved).toBe(1);
			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student.cohortId).toBe(advanced2);
			// A move must not disturb the rest of the student's record.
			expect(student.englishName).toBe('Yoyo Lin');
			expect(student.status).toBe('active');
		});

		it('keeps a stored name when the file has none, and reports nothing', async () => {
			// A blank cell means the workbook has no opinion. Reporting it as a
			// rename would put an erasure in front of the admin, and approving it
			// would delete a name the school maintains elsewhere.
			const t = await asAdmin();
			const cohortId = await makeG9(t);
			await enrol(t, cohortId, '1130001', 'Yoyo Lin');

			const result = await applyRoster(t, [row('1130001', 'G9 Advanced 1')]);

			expect(result.renamed).toBe(0);
			expect(result.declinedRenames).toEqual([]);
			const students = await rosterOf(t, cohortId);
			expect(students[0].englishName).toBe('Yoyo Lin');
		});

		it('leaves a renamed student alone unless the admin approved that student', async () => {
			const t = await asAdmin();
			const cohortId = await makeG9(t);
			const studentId = await enrol(t, cohortId, '1130001', 'Yoyo Lin');

			const result = await applyRoster(t, [
				row('1130001', 'G9 Advanced 1', { englishName: 'Yoyo Lam' })
			]);

			expect(result.renamed).toBe(0);
			expect(result.declinedRenames).toEqual(['1130001']);
			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student.englishName).toBe('Yoyo Lin');
		});

		it('applies a rename the admin approved', async () => {
			const t = await asAdmin();
			const cohortId = await makeG9(t);
			const studentId = await enrol(t, cohortId, '1130001', 'Yoyo Lin');

			const result = await applyRoster(
				t,
				[row('1130001', 'G9 Advanced 1', { englishName: 'Yoyo Lam' })],
				{ approvedNameChanges: [studentId] }
			);

			expect(result.renamed).toBe(1);
			expect(result.declinedRenames).toEqual([]);
			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student.englishName).toBe('Yoyo Lam');
		});

		it('ignores an approval for a student the file did not rename', async () => {
			// The approval is intersected with the plan on the server, so a browser
			// cannot smuggle in a rename the dry run never showed.
			const t = await asAdmin();
			const cohortId = await makeG9(t);
			const studentId = await enrol(t, cohortId, '1130001', 'Yoyo Lin');

			const result = await applyRoster(
				t,
				[row('1130001', 'G9 Advanced 1', { englishName: 'Yoyo Lin' })],
				{ approvedNameChanges: [studentId] }
			);

			expect(result.renamed).toBe(0);
			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student.englishName).toBe('Yoyo Lin');
		});

		it('disables a student the file omits, recording why', async () => {
			const t = await asAdmin();
			const cohortId = await makeG9(t);
			const studentId = await enrol(t, cohortId, '1130002');

			const result = await applyRoster(t, [row('1130001', 'G9 Advanced 1')]);

			expect(result.disabled).toBe(1);
			const student = await t.query(api.esl.students.getById, { id: studentId });
			// Disabled rather than deleted: the row is this year's history.
			expect(student.status).toBe('disabled');
			expect(student.statusReason).toBe(IMPORT_DISABLED_REASON);
			expect(student.disabledAt).toBeGreaterThan(0);
		});

		it('leaves an already disabled student disabled once', async () => {
			// Re-importing must not restamp a student disabled by an earlier import,
			// or the reason they left stops being the reason they left.
			const t = await asAdmin();
			const cohortId = await makeG9(t);
			const studentId = await enrol(t, cohortId, '1130002');
			await t.mutation(api.esl.students.updateStatus, {
				id: studentId,
				status: 'disabled',
				statusReason: 'left the school'
			});

			const result = await applyRoster(t, [row('1130001', 'G9 Advanced 1')]);

			expect(result.disabled).toBe(0);
			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student.statusReason).toBe('left the school');
		});

		it('changes nothing when the same file is applied twice', async () => {
			// The property that makes the workflow safe in September without having to
			// know whether someone else has already run it.
			const t = await asAdmin();
			const cohortId = await makeG9(t);
			await enrol(t, cohortId, '1130001');
			const rows = [row('1130001', 'G9 Advanced 1'), row('1130009', 'G9 Advanced 1')];
			await applyRoster(t, rows);

			const second = await applyRoster(t, rows);

			expect(second).toMatchObject({ added: 0, moved: 0, renamed: 0, disabled: 0 });
			expect(second.unchanged).toBe(2);
			expect((await rosterOf(t, cohortId)).length).toBe(2);
		});

		it('leaves last year untouched', async () => {
			// A student's ID legitimately has one row per year, so this year's grade 8
			// is not last year's grade 7. Reaching across would disable half a school.
			const t = await asAdmin();
			const lastYear = await makeG9(t, OTHER_YEAR, 'Basic', '1');
			const lastYearId = await enrol(t, lastYear, '1130001');

			await applyRoster(t, [row('1130002', 'G9 Advanced 1')]);

			const student = await t.query(api.esl.students.getById, { id: lastYearId });
			expect(student.status).toBe('active');
			expect(student.cohortId).toBe(lastYear);
		});
	});
});

describe('what it refuses', () => {
	it('refuses a file whose IDs indicate a different year', async () => {
		// Caught by arithmetic rather than by the admin noticing, because the
		// consequences of importing the wrong year are silent: a returning
		// student becomes a new one and half a cohort is disabled.
		const t = await asAdmin();

		await expect(
			applyRoster(t, [row('1130001', 'G9 Advanced 1')], { year: OTHER_YEAR })
		).rejects.toThrow(/indicate school year 2026-2027/);
		expect(await t.query(api.esl.cohorts.list, { year: OTHER_YEAR, grade: 9 })).toEqual([]);
	});

	it('refuses a workbook holding two years', async () => {
		const t = await asAdmin();

		await expect(
			applyRoster(t, [row('1130001', 'G9 Advanced 1'), row('1140001', 'G9 Advanced 1')])
		).rejects.toThrow(/two different school years/);
	});

	it('refuses the whole file when one row cannot be read', async () => {
		// The browser already showed the admin each row it could read, so a row
		// failing here means the payload is not the file they approved. Applying
		// the readable part would import a roster nobody saw.
		const t = await asAdmin();

		await expect(
			applyRoster(t, [
				row('1130001', 'G9 Advanced 1'),
				row('1130002', 'G9 Advanced 1', { chineseName: '   ' })
			])
		).rejects.toThrow(/rows could not be read/);
		expect(await t.query(api.esl.cohorts.list, { year: YEAR, grade: 9 })).toEqual([]);
	});

	it('refuses a row naming another grade, rather than filing it there', async () => {
		const t = await asAdmin();

		await expect(
			applyRoster(t, [row('1130001', 'G9 Advanced 1'), row('1140002', 'G8 Basic 1')])
		).rejects.toThrow(/is not a grade 9 group/);
	});

	it('refuses a student ID that appears twice', async () => {
		// Applying would enrol one of the two and disable the other, which is
		// how a student ends up removed from a school they attend.
		const t = await asAdmin();

		await expect(
			applyRoster(t, [row('1130001', 'G9 Advanced 1'), row('1130001', 'G9 Advanced 2')])
		).rejects.toThrow(/appear more than once in the file/);
	});

	it('applies a grade 10 file, whose IDs name the year it belongs to', async () => {
		// Grade 10's IDs name the school year itself rather than an intake, so the
		// year is derived from them and checked like any other grade's. Both rows
		// are `511xxx` — ROC 115 reversed, which is 2026-2027 — matching `YEAR`.
		const t = await asAdmin();
		const result = await applyRoster(
			t,
			[
				// Grade 10's homerooms are `H1nn`, and a G10 class draws from exactly
				// one of them — so both sections of H101 say `H101`.
				row('511024', 'H101A', { chineseClass: 'H101' }),
				row('511025', 'H101B', { chineseClass: 'H101' })
			],
			{
				grade: 10,
				year: YEAR
			}
		);

		expect(result.added).toBe(2);
		// Two cohorts, one per level: A and B are ability bands holding different
		// students, so they do not share a roster (ADR-0023). This was one cohort,
		// which merged the two bands while the counts still added up.
		const cohorts = await t.query(api.esl.cohorts.list, { year: YEAR, grade: 10 });
		expect(cohorts).toHaveLength(2);
		expect(cohorts.map((c: { classNumber: string }) => c.classNumber)).toEqual(['01', '01']);
		expect(cohorts.map((c: { level?: string }) => c.level).sort()).toEqual(['A', 'B']);
		// And each is taught by its own single class.
		for (const cohort of cohorts) {
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId: cohort._id });
			expect(classes, `${cohort.level} should have one class`).toHaveLength(1);
		}
	});

	it('refuses a grade 10 file whose IDs are for a different year', async () => {
		// The server-side half of the fix. Grade 10's IDs name the school year, so
		// the apply checks them the way it always checked the levelled grades. It
		// used to skip grade 10 entirely on the claim that its IDs name no year,
		// which left the browser prompt as the only guard on a whole roster.
		//
		// `411xxx` is ROC 114 reversed — 2025-2026 — but the import is confirmed for
		// 2026-2027.
		const t = await asAdmin();

		await expect(
			applyRoster(t, [row('411024', 'H101A', { chineseClass: 'H101' })], {
				grade: 10,
				year: YEAR
			})
		).rejects.toThrow(/indicate school year 2025-2026/);
	});

	it('refuses a school year that is not a year', async () => {
		const t = await asAdmin();

		await expect(
			applyRoster(t, [row('1130001', 'G9 Advanced 1')], { year: '2026' })
		).rejects.toThrow(/YYYY-YYYY/);
	});

	it('refuses an ESL teacher, who may read the roster but not apply one', async () => {
		const t = convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

		await expect(applyRoster(t, [row('1130001', 'G9 Advanced 1')])).rejects.toThrow();
	});
});

describe('rosterSnapshot', () => {
	it('returns only the requested grade, in the shape the planner reads', async () => {
		const t = await asAdmin();
		const advanced = await makeG9(t, YEAR, 'Advanced', '1');
		const basic = await makeG9(t, YEAR, 'Basic', '1');
		await makeG9(t, OTHER_YEAR, 'Advanced', '1');
		const studentId = await enrol(t, advanced, '1130001');
		await enrol(t, basic, '1130002');

		const snapshot = await t.query(api.esl.import.rosterSnapshot, { year: YEAR, grade: 9 });

		expect(snapshot.cohorts.map((c: { id: string }) => c.id).sort()).toEqual(
			[advanced, basic].sort()
		);
		expect(snapshot.students).toHaveLength(2);
		expect(snapshot.students[0]).toMatchObject({
			schoolStudentId: expect.any(String),
			chineseName: expect.any(String),
			status: 'active'
		});
		expect(snapshot.students.map((s: { id: string }) => s.id)).toContain(studentId);
	});

	it('reports a student with no English name as having none', async () => {
		// Matches the optional schema field, so the browser's plan and the
		// server's see the same thing for a G7 intake with an empty column.
		const t = await asAdmin();
		const cohortId = await makeG9(t);
		const studentId = await enrol(t, cohortId, '1130001');
		await t.run(async (ctx) => {
			await ctx.db.patch(studentId, { englishName: undefined });
		});

		const snapshot = await t.query(api.esl.import.rosterSnapshot, { year: YEAR, grade: 9 });

		expect(snapshot.students[0].englishName).toBeUndefined();
	});

	it('lets a teacher read the snapshot', async () => {
		// The dry run is something a teacher may see; applying it is not.
		const t = convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

		expect(await t.query(api.esl.import.rosterSnapshot, { year: YEAR, grade: 9 })).toEqual({
			cohorts: [],
			students: []
		});
	});
});
