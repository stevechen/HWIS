import { describe, it, expect } from 'vitest';
import {
	detectDelimiter,
	matchEslFieldName,
	parseEslRoster,
	validateRosterRow
} from '$src/routes/esl/admin/students/import-utils';

describe('matchEslFieldName', () => {
	it('maps school student ID header variants', () => {
		expect(matchEslFieldName('School Student ID')).toBe('schoolStudentId');
		expect(matchEslFieldName('student id')).toBe('schoolStudentId');
		expect(matchEslFieldName('STUDENT_ID')).toBe('schoolStudentId');
		expect(matchEslFieldName('學號')).toBe('schoolStudentId');
	});

	it('maps English and Chinese name variants', () => {
		expect(matchEslFieldName('English Name')).toBe('englishName');
		expect(matchEslFieldName('name (english)')).toBe('englishName');
		expect(matchEslFieldName('中文姓名')).toBe('chineseName');
		expect(matchEslFieldName('Chinese Name')).toBe('chineseName');
	});

	it('returns null for unrelated columns', () => {
		expect(matchEslFieldName('House')).toBeNull();
		expect(matchEslFieldName('')).toBeNull();
	});
});

describe('detectDelimiter', () => {
	it('detects a tab-separated paste', () => {
		expect(detectDelimiter('ID\tName\n1\tAlice')).toBe('\t');
	});

	it('detects a comma-separated export', () => {
		expect(detectDelimiter('ID,Name\n1,Alice')).toBe(',');
	});

	it('ignores delimiters inside a quoted header', () => {
		expect(detectDelimiter('"Last, First"\tName')).toBe('\t');
	});

	it('defaults to tab when the header has no delimiter', () => {
		expect(detectDelimiter('Name')).toBe('\t');
	});
});

describe('validateRosterRow', () => {
	it('accepts a complete row', () => {
		expect(
			validateRosterRow({ englishName: 'Alice', chineseName: '陳小美', schoolStudentId: '7001001' })
		).toBeNull();
	});

	it('rejects a missing English name', () => {
		expect(
			validateRosterRow({ englishName: ' ', chineseName: '陳小美', schoolStudentId: '7001001' })
		).toBe('English name is required');
	});

	it('rejects a missing Chinese name', () => {
		expect(
			validateRosterRow({ englishName: 'Alice', chineseName: '', schoolStudentId: '7001001' })
		).toBe('Chinese name is required');
	});

	it('rejects a school ID that is not 6 or 7 digits', () => {
		expect(
			validateRosterRow({ englishName: 'Alice', chineseName: '陳小美', schoolStudentId: '12345' })
		).toBe('School student ID must be a 6- or 7-digit number');
	});
});

describe('parseEslRoster', () => {
	it('parses a tab-separated paste with a UTF-8 BOM and CRLF', () => {
		const text =
			'﻿School Student ID\tEnglish Name\tChinese Name\r\n' +
			'7001001\tAlice Chan\t陳小美\r\n' +
			'8123456\tBob Lee\t李大文';

		const result = parseEslRoster(text);

		expect(result.students).toEqual([
			{ englishName: 'Alice Chan', chineseName: '陳小美', schoolStudentId: '7001001' },
			{ englishName: 'Bob Lee', chineseName: '李大文', schoolStudentId: '8123456' }
		]);
		expect(result.rejected).toHaveLength(0);
	});

	it('parses a comma-separated export', () => {
		const text = 'English Name,Chinese Name,Student ID\nAlice Chan,陳小美,7001001';

		const result = parseEslRoster(text);

		expect(result.students).toHaveLength(1);
		expect(result.students[0].schoolStudentId).toBe('7001001');
	});

	it('honours quoted cells containing the delimiter', () => {
		const text = 'English Name,Chinese Name,Student ID\n"Chan, Alice",陳小美,7001001';

		const result = parseEslRoster(text);

		expect(result.students[0].englishName).toBe('Chan, Alice');
	});

	it('reports invalid rows with their spreadsheet row number instead of dropping them', () => {
		const text = [
			'English Name\tChinese Name\tStudent ID',
			'Alice Chan\t陳小美\t7001001',
			'Broken Row\t陳小美\t123'
		].join('\n');

		const result = parseEslRoster(text);

		expect(result.students).toHaveLength(1);
		expect(result.rejected).toEqual([
			{
				rowNumber: 3,
				reason: 'School student ID must be a 6- or 7-digit number',
				raw: ['Broken Row', '陳小美', '123']
			}
		]);
	});

	it('lists headers it ignored so a pasted extra column is visible', () => {
		const text = 'English Name\tChinese Name\tStudent ID\tHouse\nAlice\t陳小美\t7001001\tHeracles';

		const result = parseEslRoster(text);

		expect(result.ignoredHeaders).toEqual(['House']);
		expect(result.students).toHaveLength(1);
	});

	it('skips the blank trailing line a spreadsheet export leaves behind', () => {
		const text = 'English Name\tChinese Name\tStudent ID\nAlice\t陳小美\t7001001\n';

		const result = parseEslRoster(text);

		expect(result.students).toHaveLength(1);
		expect(result.rejected).toHaveLength(0);
	});

	it('returns nothing for empty input', () => {
		expect(parseEslRoster('')).toEqual({ students: [], rejected: [], ignoredHeaders: [] });
	});
});
