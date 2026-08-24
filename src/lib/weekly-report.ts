export type WeeklyReportSummary = {
	weekNumber: number;
	fridayDate: number;
	formattedDate: string;
	studentCount: number;
};

export type WeeklyReportStudent = {
	studentId: string;
	englishName: string;
	chineseName: string;
	grade: number;
	class?: string;
	pointsByCategory: Record<string, number>;
	totalPoints: number;
};

export type WeeklyReportSortColumn = 'id' | 'name' | 'grade';
export type WeeklyReportSortDirection = 'asc' | 'desc';

type WeeklyReportFilters = {
	id: string;
	name: string;
	grade: string;
	sortColumn: WeeklyReportSortColumn;
	sortDirection: WeeklyReportSortDirection;
};

export function getAvailableGrades(students: WeeklyReportStudent[]): number[] {
	return [...new Set(students.map((student) => student.grade))].sort((a, b) => a - b);
}

export function getCategoryColumns(students: WeeklyReportStudent[]): string[] {
	return [...new Set(students.flatMap((student) => Object.keys(student.pointsByCategory)))].sort();
}

export function filterAndSortWeeklyReportStudents(
	students: WeeklyReportStudent[],
	filters: WeeklyReportFilters
): WeeklyReportStudent[] {
	const idFilter = filters.id.trim().toLowerCase();
	const nameParts = filters.name
		.split(',')
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
	const grade = Number.parseInt(filters.grade, 10);

	const result = students.filter((student) => {
		if (idFilter && !student.studentId.toLowerCase().includes(idFilter)) return false;
		if (
			nameParts.length > 0 &&
			!nameParts.some(
				(part) =>
					student.englishName.toLowerCase().includes(part) || student.chineseName.includes(part)
			)
		) {
			return false;
		}
		if (filters.grade && !Number.isNaN(grade) && student.grade !== grade) return false;
		return true;
	});

	return [...result].sort((a, b) => {
		const comparison =
			filters.sortColumn === 'id'
				? a.studentId.localeCompare(b.studentId)
				: filters.sortColumn === 'name'
					? a.englishName.localeCompare(b.englishName)
					: a.grade - b.grade;
		return filters.sortDirection === 'asc' ? comparison : -comparison;
	});
}

function escapeCsvValue(value: string): string {
	return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toWeeklyReportCsv(students: WeeklyReportStudent[]): string {
	const categoryColumns = getCategoryColumns(students);
	const headers = [
		'Student ID',
		'English Name',
		'Chinese Name',
		'Grade',
		'Total Points',
		...categoryColumns
	];
	const rows = students.map((student) => [
		student.studentId,
		student.englishName,
		student.chineseName,
		student.grade.toString(),
		student.totalPoints.toString(),
		...categoryColumns.map((category) => (student.pointsByCategory[category] || 0).toString())
	]);

	return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}
