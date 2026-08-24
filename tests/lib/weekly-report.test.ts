import { describe, expect, test } from 'vitest';
import {
	filterAndSortWeeklyReportStudents,
	getAvailableGrades,
	getCategoryColumns,
	toWeeklyReportCsv,
	type WeeklyReportStudent
} from '$lib/weekly-report';

const students: WeeklyReportStudent[] = [
	{
		studentId: 'S2',
		englishName: 'Bob',
		chineseName: '乙',
		grade: 11,
		pointsByCategory: { Kindness: 2, Effort: 1 },
		totalPoints: 3
	},
	{
		studentId: 'S1',
		englishName: 'Alice',
		chineseName: '甲',
		grade: 10,
		pointsByCategory: { Effort: 4 },
		totalPoints: 4
	}
];

describe('weekly report projections', () => {
	test('derives sorted grades and category columns', () => {
		expect(getAvailableGrades(students)).toEqual([10, 11]);
		expect(getCategoryColumns(students)).toEqual(['Effort', 'Kindness']);
	});

	test('filters names and sorts rows', () => {
		expect(
			filterAndSortWeeklyReportStudents(students, {
				id: '',
				name: 'alice',
				grade: '',
				sortColumn: 'name',
				sortDirection: 'asc'
			})
		).toEqual([students[1]]);
	});

	test('exports escaped and stable csv rows', () => {
		expect(
			toWeeklyReportCsv([
				{
					...students[0],
					englishName: 'Bob, Jr.'
				}
			])
		).toBe(
			'Student ID,English Name,Chinese Name,Grade,Total Points,Effort,Kindness\n' +
				'S2,"Bob, Jr.",乙,11,3,1,2'
		);
	});
});
