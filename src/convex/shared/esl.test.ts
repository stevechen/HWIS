import { describe, it, expect } from 'vitest';
import {
	ESL_GRADE10_MAX_CLASS_NUMBER,
	ESL_GRADE10_LEVELS,
	classTypesForCohort,
	cohortCode,
	cohortLabel,
	compareEslCohorts,
	defaultClassName,
	grade10BaseClass,
	grade10ClassName,
	isLevelledGrade,
	isSharedRosterGrade,
	isValidClassNumberForGrade,
	isValidGrade10ClassNumber,
	normalizeEslLevel,
	planLegacyGrade10Repair,
	planLegacyLevelRepair
} from './esl';

const G10 = { year: '2025-2026', grade: 10, classNumber: '01' } as const;
const G7 = { year: '2025-2026', grade: 7, level: 'Basic', classNumber: '1' } as const;

describe('ESL grade 10 class naming', () => {
	it('renders the school’s class names: H101A/H101B through H110A/H110B', () => {
		expect(grade10ClassName('01', 'H10A')).toBe('H101A');
		expect(grade10ClassName('01', 'H10B')).toBe('H101B');
		expect(grade10ClassName('02', 'H10A')).toBe('H102A');
		expect(grade10ClassName('10', 'H10A')).toBe('H110A');
		expect(grade10ClassName('10', 'H10B')).toBe('H110B');
	});

	it('pads single-digit base classes to two digits', () => {
		expect(grade10BaseClass('01')).toBe('01');
		expect(grade10BaseClass('1')).toBe('01');
		expect(grade10BaseClass('10')).toBe('10');
	});

	it('produces no level word in a grade 10 class name', () => {
		// The bug this guards: a grade 10 class once rendered as "H10 Basic 1".
		for (const classNumber of ['01', '05', '10', '12', '99']) {
			for (const level of ESL_GRADE10_LEVELS) {
				for (const type of classTypesForCohort({ grade: 10, level })) {
					expect(defaultClassName({ ...G10, classNumber, level }, type)).not.toMatch(
						/Basic|Intermediate|Advanced/
					);
				}
			}
		}
	});

	it('rejects a non-grade-10 type when naming a grade 10 class', () => {
		expect(() => grade10ClassName('01', 'G9')).toThrow('not a grade 10 class type');
	});
});

describe('ESL grade 10 levelling', () => {
	it('bounds grade 10 class numbers by Chinese class, the others by class number', () => {
		expect(isLevelledGrade(10)).toBe(false);
		expect([7, 8, 9].map(isLevelledGrade)).toEqual([true, true, true]);
	});

	it('gives each grade 10 level its own cohort, roster and single class', () => {
		// ADR-0023: A and B are ability levels holding different students, so they
		// are two cohorts rather than two classes over one roster. Keying the class
		// types on the grade alone is what merged them.
		expect(isSharedRosterGrade(10)).toBe(false);
		expect(classTypesForCohort({ grade: 10, level: 'A' })).toEqual(['H10A']);
		expect(classTypesForCohort({ grade: 10, level: 'B' })).toEqual(['H10B']);
		// G7/G8 still share one roster across their two lessons; G9 is single-classed.
		expect(isSharedRosterGrade(7)).toBe(true);
		expect(isSharedRosterGrade(8)).toBe(true);
		expect(isSharedRosterGrade(9)).toBe(false);
		expect(classTypesForCohort({ grade: 9 })).toEqual(['G9']);
	});

	it('refuses a grade 10 cohort with no level rather than guessing one', () => {
		// Guessing would put half a grade 10 roster in the wrong ability band, and
		// the counts would still add up.
		expect(() => classTypesForCohort({ grade: 10 })).toThrow('no ability level');
		expect(() => classTypesForCohort({ grade: 10, level: 'C' })).toThrow('no ability level');
	});

	it('labels a grade 10 cohort with its level, so H101 and H101A differ', () => {
		// Without the level the label named two different cohorts identically.
		expect(cohortLabel({ ...G10, level: 'A' })).toContain('H101A');
		expect(cohortLabel({ ...G10, level: 'B' })).toContain('H101B');
	});
});

describe('ESL levelled class names', () => {
	it('names a grade 7/8 class grade, level, number, then lesson', () => {
		// The order the school uses. The lesson goes last because it is the only part
		// that differs between the two classes one cohort is taught by.
		expect(defaultClassName({ ...G7, level: 'Elementary' }, 'CLIL')).toBe('G7 Elementary 1 CLIL');
		expect(defaultClassName({ ...G7, level: 'Elementary' }, 'Comm')).toBe('G7 Elementary 1 Comm');
		expect(
			defaultClassName({ year: '2025-2026', grade: 8, level: 'Advanced', classNumber: '3' }, 'Comm')
		).toBe('G8 Advanced 3 Comm');
	});

	it('never spells the levelled grades as one "G7/8"', () => {
		// The bug this guards: names once read "G7/8 CLIL Basic 1", which names
		// neither grade on its own and does not match how the school writes them.
		for (const grade of [7, 8]) {
			for (const type of classTypesForCohort({ grade, level: 'Basic' })) {
				expect(defaultClassName({ ...G7, grade, classNumber: '2' }, type)).not.toContain('7/8');
			}
		}
	});

	it('leaves the lesson off a grade 9 class, which has only one', () => {
		// Grade 9's type is named after the grade, so appending it would give
		// "G9 Elementary 1 G9".
		expect(defaultClassName({ ...G7, grade: 9, level: 'Advanced', classNumber: '1' }, 'G9')).toBe(
			'G9 Advanced 1'
		);
	});
});

describe('ESL class numbers per grade', () => {
	it('accepts 1–7 for levelled grades, the range the school runs', () => {
		// The school runs up to seven classes per level (G8 has Intermediate 1–7
		// and Basic 1–7), so a narrower bound would reject real cohorts.
		for (const classNumber of ['1', '2', '3', '4', '5', '6', '7']) {
			expect(isValidClassNumberForGrade(7, classNumber)).toBe(true);
		}
	});

	it('rejects a class number outside the range a levelled grade runs', () => {
		expect(isValidClassNumberForGrade(7, '0')).toBe(false);
		expect(isValidClassNumberForGrade(7, '8')).toBe(false);
		expect(isValidClassNumberForGrade(7, '07')).toBe(false);
		expect(isValidClassNumberForGrade(7, '')).toBe(false);
	});

	it('accepts any base class within the name-format bound for grade 10', () => {
		// The school runs a different number of base classes each year, so the
		// valid set is a range, not a fixed list.
		for (const classNumber of ['1', '01', '9', '10', '12', '20', '99']) {
			expect(isValidGrade10ClassNumber(classNumber)).toBe(true);
		}
	});

	it('rejects a grade 10 base class outside the name-format bound', () => {
		expect(isValidGrade10ClassNumber('0')).toBe(false);
		expect(isValidGrade10ClassNumber(String(ESL_GRADE10_MAX_CLASS_NUMBER + 1))).toBe(false);
		expect(isValidGrade10ClassNumber('')).toBe(false);
		expect(isValidGrade10ClassNumber('abc')).toBe(false);
		expect(isValidGrade10ClassNumber('1.5')).toBe(false);
		expect(isValidGrade10ClassNumber('-1')).toBe(false);
	});

	it('names a base class beyond 10 without breaking the format', () => {
		expect(grade10ClassName('12', 'H10A')).toBe('H112A');
		expect(grade10ClassName('20', 'H10B')).toBe('H120B');
		expect(grade10ClassName(String(ESL_GRADE10_MAX_CLASS_NUMBER), 'H10A')).toBe('H199A');
	});
});

describe('ESL cohort identity', () => {
	it('codes a grade 10 cohort by base class alone, with no level', () => {
		expect(cohortCode(G10)).toBe('G10-01');
		expect(cohortCode({ ...G10, classNumber: '10' })).toBe('G10-10');
	});

	it('codes a levelled cohort by level and number', () => {
		expect(cohortCode(G7)).toBe('G7-Basic-1');
	});

	it('gives distinct codes to every grade 10 base class in a year', () => {
		const classNumbers = ['01', '02', '10', '12', '20', '99'];
		const codes = classNumbers.map((classNumber) => cohortCode({ ...G10, classNumber }));
		expect(new Set(codes).size).toBe(classNumbers.length);
	});

	it('codes an unpadded and a padded base class as the same cohort', () => {
		// `2` and `02` must not create two cohorts for one base class.
		expect(cohortCode({ ...G10, classNumber: '2' })).toBe(
			cohortCode({ ...G10, classNumber: '02' })
		);
	});

	it('does not collide a grade 10 code with a levelled one', () => {
		expect(cohortCode(G10)).not.toBe(cohortCode(G7));
	});

	it('labels a grade 10 cohort by its base class', () => {
		expect(cohortLabel(G10)).toBe('2025-2026 G10 H101');
		expect(cohortLabel({ ...G10, classNumber: '10' })).toBe('2025-2026 G10 H110');
	});
});

describe('normalizeEslLevel', () => {
	it('accepts the official level names unchanged', () => {
		for (const level of ['Pre-Elementary', 'Elementary', 'Basic', 'Intermediate', 'Advanced']) {
			expect(normalizeEslLevel(level)).toBe(level);
		}
	});

	it('accepts the abbreviations the workbooks use', () => {
		// Measured from the G9 workbook: its sheets are abbreviated while the
		// ESL Group column carries the official name.
		expect(normalizeEslLevel('Pre-Ele')).toBe('Pre-Elementary');
		expect(normalizeEslLevel('Ele')).toBe('Elementary');
		expect(normalizeEslLevel('Int')).toBe('Intermediate');
		expect(normalizeEslLevel('Adv')).toBe('Advanced');
	});

	it('tolerates inconsistent casing and separators', () => {
		expect(normalizeEslLevel('elementary')).toBe('Elementary');
		expect(normalizeEslLevel('INTERMEDIATE')).toBe('Intermediate');
		expect(normalizeEslLevel('pre_ele')).toBe('Pre-Elementary');
	});

	it('does not strip a trailing class number from a whole group string', () => {
		// The G9 workbook contains one row reading `G9 Elementary1`. The caller
		// splits the class number off the group before normalising, so the
		// normaliser deliberately rejects a value that still carries digits —
		// silently accepting one would hide a mis-parse upstream.
		expect(normalizeEslLevel('Elementary1')).toBeNull();
	});

	it('returns null for a level it cannot resolve, rather than guessing', () => {
		// Guessing here would silently misfile a class into the wrong cohort.
		expect(normalizeEslLevel('Gifted')).toBeNull();
		expect(normalizeEslLevel('Advanced 1')).toBeNull();
		expect(normalizeEslLevel('')).toBeNull();
	});

	it('is idempotent, so normalising twice changes nothing', () => {
		const once = normalizeEslLevel('Int');
		expect(normalizeEslLevel(once as string)).toBe(once);
	});
});

describe('planLegacyLevelRepair', () => {
	it('rewrites a short level code onto the official name', () => {
		const plan = planLegacyLevelRepair([
			{ _id: 'c1', level: 'Int' },
			{ _id: 'c2', level: 'Adv' },
			{ _id: 'c3', level: 'Pre-Ele' },
			{ _id: 'c4', level: 'Ele' }
		]);

		expect(plan.cohorts).toEqual([
			{ id: 'c1', level: 'Intermediate' },
			{ id: 'c2', level: 'Advanced' },
			{ id: 'c3', level: 'Pre-Elementary' },
			{ id: 'c4', level: 'Elementary' }
		]);
	});

	it('leaves a cohort already on an official name alone', () => {
		const plan = planLegacyLevelRepair([
			{ _id: 'c1', level: 'Basic' },
			{ _id: 'c2', level: 'Intermediate' }
		]);

		expect(plan.cohorts).toEqual([]);
	});

	it('leaves a level-less cohort alone', () => {
		// Grade 10 is not levelled, so its cohorts have no level at all.
		expect(planLegacyLevelRepair([{ _id: 'c10' }]).cohorts).toEqual([]);
	});

	it('does not guess a level it cannot resolve', () => {
		// The mutation reports these as `unrecognised` rather than coercing them.
		expect(planLegacyLevelRepair([{ _id: 'c1', level: 'Gifted' }]).cohorts).toEqual([]);
	});
});

describe('planLegacyGrade10Repair', () => {
	// `convex-test` enforces validators on insert, so the pre-correction row
	// cannot be created through a mutation — the repair is therefore tested as
	// the pure planner it is, and the mutation is a thin applier over it.
	const LEGACY_COHORT = {
		_id: 'cohort_1',
		grade: 10,
		classNumber: '1',
		level: 'Adv'
	};
	const LEGACY_CLASS = {
		_id: 'class_1',
		cohortId: 'cohort_1',
		type: 'H10',
		name: 'H10 Adv 1'
	};

	it('drops the level from a grade 10 cohort and pads its base class', () => {
		const plan = planLegacyGrade10Repair([LEGACY_COHORT], []);

		expect(plan.cohorts).toEqual([{ id: 'cohort_1', level: undefined, classNumber: '01' }]);
	});

	it('rewrites a legacy H10 class to the A section with the new name', () => {
		const plan = planLegacyGrade10Repair([LEGACY_COHORT], [LEGACY_CLASS]);

		expect(plan.classes).toEqual([{ id: 'class_1', type: 'H10A', name: 'H101A' }]);
	});

	it('leaves a levelled cohort and its CLIL/Comm classes alone', () => {
		const plan = planLegacyGrade10Repair(
			[{ _id: 'c7', grade: 7, classNumber: '1', level: 'Basic' }],
			[
				{ _id: 'cl', cohortId: 'c7', type: 'CLIL', name: 'G7 Basic 1 CLIL' },
				{ _id: 'cm', cohortId: 'c7', type: 'Comm', name: 'G7 Basic 1 Comm' }
			]
		);

		expect(plan.cohorts).toEqual([]);
		expect(plan.classes).toEqual([]);
	});

	it('plans nothing for rows already in the new shape', () => {
		const plan = planLegacyGrade10Repair(
			[{ _id: 'c10', grade: 10, classNumber: '01' }],
			[
				{ _id: 'a', cohortId: 'c10', type: 'H10A', name: 'H101A' },
				{ _id: 'b', cohortId: 'c10', type: 'H10B', name: 'H101B' }
			]
		);

		expect(plan.cohorts).toEqual([]);
		expect(plan.classes).toEqual([]);
	});

	it('keeps an unreferenced legacy class name rather than inventing one', () => {
		// A class whose cohort is missing cannot be renamed, so its name is
		// preserved and only the type is corrected.
		const plan = planLegacyGrade10Repair([], [LEGACY_CLASS]);

		expect(plan.classes).toEqual([{ id: 'class_1', type: 'H10A', name: 'H10 Adv 1' }]);
	});
});

describe('compareEslCohorts', () => {
	it('orders grade 10 cohorts numerically by base class', () => {
		const sorted = [
			{ ...G10, classNumber: '10' },
			{ ...G10, classNumber: '02' },
			{ ...G10, classNumber: '01' }
		].sort(compareEslCohorts);

		expect(sorted.map((c) => c.classNumber)).toEqual(['01', '02', '10']);
	});

	it('still orders levelled cohorts by level difficulty, then number', () => {
		const sorted = [
			{ year: '2025-2026', grade: 7, level: 'Intermediate', classNumber: '1' },
			{ year: '2025-2026', grade: 7, level: 'Basic', classNumber: '2' },
			{ year: '2025-2026', grade: 7, level: 'Basic', classNumber: '1' }
		].sort(compareEslCohorts);

		expect(sorted.map((c) => `${c.level}${c.classNumber}`)).toEqual([
			'Basic1',
			'Basic2',
			'Intermediate1'
		]);
	});

	it('sorts grade before level, so a level-less grade 10 cohort sorts last', () => {
		const sorted = [G10, G7].sort(compareEslCohorts);
		expect(sorted[0].grade).toBe(7);
	});
});
