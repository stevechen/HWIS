import { describe, it, expect } from 'vitest';
import {
	matchFieldName,
	parseCsv,
	parseGradeAndClass,
	mapCsvRowToStudent
} from '$src/routes/admin/students/import-utils';

describe('matchFieldName', () => {
	it('maps student ID variants', () => {
		expect(matchFieldName('Student ID')).toBe('studentId');
		expect(matchFieldName('student id')).toBe('studentId');
		expect(matchFieldName('STUDENT_ID')).toBe('studentId');
		expect(matchFieldName('StudentId')).toBe('studentId');
		expect(matchFieldName('ID Student')).toBe('studentId');
	});

	it('maps English name variants', () => {
		expect(matchFieldName('English Name')).toBe('englishName');
		expect(matchFieldName('english name')).toBe('englishName');
		expect(matchFieldName('Name (English)')).toBe('englishName');
		expect(matchFieldName('ENGLISH_NAME')).toBe('englishName');
	});

	it('maps Chinese name variants', () => {
		expect(matchFieldName('Chinese Name')).toBe('chineseName');
		expect(matchFieldName('chinese name')).toBe('chineseName');
		expect(matchFieldName('Name (Chinese)')).toBe('chineseName');
		expect(matchFieldName('CHINESE_NAME')).toBe('chineseName');
	});

	it('maps house variants', () => {
		expect(matchFieldName('House')).toBe('house');
		expect(matchFieldName('house')).toBe('house');
		expect(matchFieldName('HOUSE')).toBe('house');
		expect(matchFieldName('House Name')).toBe('house');
	});

	it('maps status variants', () => {
		expect(matchFieldName('Status')).toBe('status');
		expect(matchFieldName('status')).toBe('status');
		expect(matchFieldName('STATUS')).toBe('status');
	});

	it('maps Grade-Class variants', () => {
		expect(matchFieldName('Grade')).toBe('gradeClass');
		expect(matchFieldName('grade')).toBe('gradeClass');
		expect(matchFieldName('Class')).toBe('gradeClass');
		expect(matchFieldName('Grade-Class')).toBe('gradeClass');
		expect(matchFieldName('GRADE')).toBe('gradeClass');
	});

	it('returns null for unrecognized headers', () => {
		expect(matchFieldName('Notes')).toBeNull();
		expect(matchFieldName('note')).toBeNull();
		expect(matchFieldName('Address')).toBeNull();
		expect(matchFieldName('Phone')).toBeNull();
		expect(matchFieldName('')).toBeNull();
	});
});

describe('parseCsv', () => {
	it('parses standard CSV with recognized headers', () => {
		const csv = `Student ID,English Name,Chinese Name,Grade-Class,House,Status
1234567,Alice Wang,王愛麗,9-1,Heracles,Enrolled
7654321,Bob Chen,陳博,10-2,Wukong,Not Enrolled`;

		const rows = parseCsv(csv);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			studentId: '1234567',
			englishName: 'Alice Wang',
			chineseName: '王愛麗',
			gradeClass: '9-1',
			house: 'Heracles',
			status: 'Enrolled'
		});
		expect(rows[1]).toEqual({
			studentId: '7654321',
			englishName: 'Bob Chen',
			chineseName: '陳博',
			gradeClass: '10-2',
			house: 'Wukong',
			status: 'Not Enrolled'
		});
	});

	it('ignores unrecognized columns like Notes', () => {
		const csv = `Student ID,English Name,Chinese Name,Grade-Class,Notes
1234567,Alice Wang,王愛麗,9-1,some note`;

		const rows = parseCsv(csv);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			studentId: '1234567',
			englishName: 'Alice Wang',
			chineseName: '王愛麗',
			gradeClass: '9-1'
		});
		expect(rows[0]).not.toHaveProperty('notes');
		expect(rows[0]).not.toHaveProperty('note');
	});

	it('handles different header orders', () => {
		const csv = `Grade-Class,Chinese Name,Student ID,English Name
9-1,王愛麗,1234567,Alice Wang`;

		const rows = parseCsv(csv);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			gradeClass: '9-1',
			chineseName: '王愛麗',
			studentId: '1234567',
			englishName: 'Alice Wang'
		});
	});

	it('handles BOM character in header', () => {
		const csv = '\ufeffStudent ID,English Name,Chinese Name\n1234567,Alice,王愛麗';

		const rows = parseCsv(csv);

		expect(rows).toHaveLength(1);
		expect(rows[0].studentId).toBe('1234567');
	});

	it('skips empty rows', () => {
		const csv = `Student ID,English Name
1234567,Alice

7654321,Bob`;

		const rows = parseCsv(csv);

		expect(rows).toHaveLength(2);
	});

	it('handles quoted fields with commas', () => {
		const csv = `Student ID,English Name,Chinese Name
1234567,"Alice, Wang",王愛麗`;

		const rows = parseCsv(csv);

		expect(rows).toHaveLength(1);
		expect(rows[0].englishName).toBe('Alice, Wang');
	});

	it('returns empty array for empty input', () => {
		expect(parseCsv('')).toEqual([]);
		expect(parseCsv('\n\n')).toEqual([]);
	});

	it('handles Windows line endings', () => {
		const csv = 'Student ID,English Name\r\n1234567,Alice\r\n7654321,Bob';

		const rows = parseCsv(csv);

		expect(rows).toHaveLength(2);
	});
});

describe('parseGradeAndClass', () => {
	it('parses grade-class format', () => {
		expect(parseGradeAndClass('9-1')).toEqual({ grade: 9, class: '1' });
		expect(parseGradeAndClass('10-2')).toEqual({ grade: 10, class: '2' });
		expect(parseGradeAndClass('11-IB')).toEqual({ grade: 11, class: 'IB' });
	});

	it('parses plain grade with default class', () => {
		expect(parseGradeAndClass('9')).toEqual({ grade: 9, class: '1' });
		expect(parseGradeAndClass('12')).toEqual({ grade: 12, class: '1' });
	});

	it('defaults to grade 7 class 1 for empty input', () => {
		expect(parseGradeAndClass('')).toEqual({ grade: 7, class: '1' });
	});
});

describe('mapCsvRowToStudent', () => {
	it('maps a complete row to student shape', () => {
		const result = mapCsvRowToStudent({
			studentId: '1234567',
			englishName: 'Alice Wang',
			chineseName: '王愛麗',
			gradeClass: '9-1',
			house: 'Heracles',
			status: 'Enrolled'
		});

		expect(result).toEqual({
			englishName: 'Alice Wang',
			chineseName: '王愛麗',
			studentId: '1234567',
			grade: 9,
			class: '1',
			status: 'Enrolled',
			house: 'Heracles'
		});
	});

	it('does not include note field', () => {
		const result = mapCsvRowToStudent({
			studentId: '1234567',
			englishName: 'Alice',
			chineseName: '王愛麗',
			gradeClass: '9'
		});

		expect(result).not.toHaveProperty('note');
	});

	it('parses house field', () => {
		expect(
			mapCsvRowToStudent({
				studentId: '1',
				englishName: 'A',
				chineseName: 'B',
				gradeClass: '9',
				house: 'Heracles'
			}).house
		).toBe('Heracles');

		expect(
			mapCsvRowToStudent({
				studentId: '1',
				englishName: 'A',
				chineseName: 'B',
				gradeClass: '9',
				house: 'Wukong'
			}).house
		).toBe('Wukong');

		expect(
			mapCsvRowToStudent({
				studentId: '1',
				englishName: 'A',
				chineseName: 'B',
				gradeClass: '9',
				house: 'Setna'
			}).house
		).toBe('Setna');

		expect(
			mapCsvRowToStudent({
				studentId: '1',
				englishName: 'A',
				chineseName: 'B',
				gradeClass: '9',
				house: 'Ixbalam'
			}).house
		).toBe('Ixbalam');
	});

	it('handles missing house and status as undefined', () => {
		const result = mapCsvRowToStudent({
			studentId: '1234567',
			englishName: 'Alice',
			chineseName: '王愛麗',
			gradeClass: '9'
		});

		expect(result.status).toBeUndefined();
		expect(result.house).toBeUndefined();
	});
});
