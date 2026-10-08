import { describe, it, expect } from 'vitest';
import {
	advancementCohortKey,
	advancementTargetGrade,
	planYearAdvancement,
	type AdvancementCohort,
	type AdvancementStudent
} from './esl_advancement';

const FROM = '2026-2027';
const TO = '2027-2028';

function cohort(over: Partial<AdvancementCohort> & { id: string }): AdvancementCohort {
	return { year: FROM, grade: 7, level: 'Basic', classNumber: '1', ...over };
}

function student(over: Partial<AdvancementStudent> & { id: string }): AdvancementStudent {
	return {
		cohortId: 'c1',
		schoolStudentId: '1150001',
		chineseName: '王芃頵',
		englishName: 'Yoyo Lin',
		status: 'active',
		...over
	};
}

function plan(
	source: AdvancementCohort[],
	students: AdvancementStudent[] = [],
	target: AdvancementCohort[] = []
) {
	return planYearAdvancement({
		fromYear: FROM,
		toYear: TO,
		fromGrade: source[0]?.grade ?? 7,
		sourceCohorts: source,
		sourceStudents: students,
		targetCohorts: target
	});
}

describe('advancementTargetGrade', () => {
	it('carries the levelled grades up one grade each', () => {
		expect(advancementTargetGrade(7)).toBe(8);
		expect(advancementTargetGrade(8)).toBe(9);
	});

	it('carries nobody into grade 10', () => {
		// Grade 10's IDs are a separate scheme from grade 9's, so a graduating
		// student cannot be linked to their next-year record even in principle.
		expect(advancementTargetGrade(9)).toBeNull();
		expect(advancementTargetGrade(10)).toBeNull();
	});
});

describe('planYearAdvancement', () => {
	it('carries level and class number forward into the next grade', () => {
		const result = plan([
			cohort({ id: 'c1', level: 'Basic', classNumber: '1' }),
			cohort({ id: 'c2', level: 'Advanced', classNumber: '2' })
		]);

		expect(result.kind).toBe('advance');
		if (result.kind !== 'advance') throw new Error('expected an advance');
		expect(result.toGrade).toBe(8);
		expect(result.cohorts).toEqual([
			{
				fromCohortId: 'c1',
				key: `${TO}:8:Basic:1`,
				year: TO,
				grade: 8,
				level: 'Basic',
				classNumber: '1'
			},
			{
				fromCohortId: 'c2',
				key: `${TO}:8:Advanced:2`,
				year: TO,
				grade: 8,
				level: 'Advanced',
				classNumber: '2'
			}
		]);
	});

	it('carries a grade 7 into grade 8 and a grade 8 into grade 9', () => {
		expect(plan([cohort({ id: 'c1', grade: 7 })]).kind === 'advance').toBe(true);
		const g7 = plan([cohort({ id: 'c1', grade: 7 })]);
		expect(g7.kind === 'advance' && g7.toGrade).toBe(8);
		const g8 = plan([cohort({ id: 'c1', grade: 8 })]);
		expect(g8.kind === 'advance' && g8.toGrade).toBe(9);
	});

	it('carries Pre-Elementary forward rather than inventing it', () => {
		// Pre-Elementary is decided at the G7 intake and rides along as the cohort
		// advances; it is never newly created in G8 or G9.
		const result = plan([cohort({ id: 'c1', level: 'Pre-Elementary', classNumber: '1' })]);

		expect(result.kind === 'advance' && result.cohorts[0].level).toBe('Pre-Elementary');
	});

	it('carries active students into their new cohort', () => {
		const result = plan(
			[cohort({ id: 'c1' })],
			[student({ id: 's1', cohortId: 'c1' }), student({ id: 's2', cohortId: 'c1' })]
		);

		expect(result.kind).toBe('advance');
		if (result.kind !== 'advance') throw new Error('expected an advance');
		expect(result.students).toHaveLength(2);
		// Keyed by the new cohort's identity, which the applier resolves to an id.
		expect(result.students[0].cohortKey).toBe(`${TO}:8:Basic:1`);
		expect(result.students[0].schoolStudentId).toBe('1150001');
	});

	it('leaves a disabled student behind', () => {
		// A disabled row records someone who left the programme. Carrying them
		// forward would put a student the school said goodbye to into the roster.
		const result = plan(
			[cohort({ id: 'c1' })],
			[
				student({ id: 's1', cohortId: 'c1' }),
				student({ id: 's2', cohortId: 'c1', status: 'disabled' })
			]
		);

		expect(result.kind === 'advance' && result.students.map((s) => s.fromStudentId)).toEqual([
			's1'
		]);
	});

	it('carries nothing out of grade 9, and says why', () => {
		const result = plan([cohort({ id: 'c1', grade: 9, level: 'Basic' })]);

		expect(result.kind).toBe('nothing-to-carry');
		if (result.kind !== 'nothing-to-carry') throw new Error('expected nothing to carry');
		expect(result.reason).toContain('separate scheme');
	});

	it('carries nothing when the source year has no cohorts', () => {
		const result = plan([]);

		expect(result.kind).toBe('nothing-to-carry');
		if (result.kind !== 'nothing-to-carry') throw new Error('expected nothing to carry');
		expect(result.reason).toContain('nothing to carry');
	});

	it('is idempotent: re-running advances nothing and reports success', () => {
		// The re-run sees exactly the cohorts the first run created.
		const result = plan(
			[cohort({ id: 'c1' })],
			[],
			[cohort({ id: 'new1', year: TO, grade: 8, level: 'Basic', classNumber: '1' })]
		);

		expect(result.kind).toBe('already-advanced');
		if (result.kind !== 'already-advanced') throw new Error('expected already-advanced');
		expect(result.cohorts).toEqual(['new1']);
		expect(result.reason).toContain('nothing was written');
	});

	it('refuses when the target year holds a roster the carry-forward never proposed', () => {
		// A grade 7 intake placed a Pre-Elementary class in the new year, or a
		// file was already imported. Shadowing that is the one outcome worse than
		// not advancing.
		const result = plan(
			[cohort({ id: 'c1', level: 'Basic' })],
			[],
			[cohort({ id: 'new1', year: TO, grade: 8, level: 'Pre-Elementary', classNumber: '1' })]
		);

		expect(result.kind).toBe('refused');
		if (result.kind !== 'refused') throw new Error('expected a refusal');
		expect(result.reason).toContain('shadow a real roster');
	});

	it('refuses a half-advanced year rather than filling in the missing half', () => {
		const result = plan(
			[
				cohort({ id: 'c1', level: 'Basic', classNumber: '1' }),
				cohort({ id: 'c2', level: 'Advanced', classNumber: '1' })
			],
			[],
			[cohort({ id: 'new1', year: TO, grade: 8, level: 'Basic', classNumber: '1' })]
		);

		expect(result.kind).toBe('refused');
		if (result.kind !== 'refused') throw new Error('expected a refusal');
		expect(result.reason).toContain('half-advanced');
	});

	it('reads an absent level the same way a stored cohort does', () => {
		// Grade 10 has no level; a key reading `undefined` would not match the key
		// a stored cohort is built from, so a re-run would not see itself.
		expect(advancementCohortKey({ year: TO, grade: 9, classNumber: '01' })).toBe(`${TO}:9::01`);
		const result = plan(
			[cohort({ id: 'c1', grade: 8, level: undefined, classNumber: '1' })],
			[],
			[cohort({ id: 'new1', year: TO, grade: 9, level: undefined, classNumber: '1' })]
		);

		expect(result.kind).toBe('already-advanced');
	});
});
