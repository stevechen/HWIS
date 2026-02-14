import type { EvaluationEntry } from '$lib/components/timeline/types';

// Transform API response to EvaluationEntry format
export function transformEvaluation(e: {
	_id: string;
	value: number;
	category: string;
	categoryId?: string;
	subCategory?: string;
	details?: string;
	timestamp: number;
	englishName?: string;
	grade?: number;
	studentId?: string;
	studentIdCode?: string;
	teacherName?: string;
	teacherId?: string;
	status?: 'Enrolled' | 'Not Enrolled';
	isAdmin?: boolean;
}): EvaluationEntry {
	return {
		_id: e._id,
		value: e.value,
		category: e.category,
		categoryId: e.categoryId,
		subCategory: e.subCategory,
		details: e.details,
		timestamp: e.timestamp,
		englishName: e.englishName,
		grade: e.grade,
		studentId: e.studentId,
		studentIdCode: e.studentIdCode,
		teacherName: e.teacherName,
		teacherId: e.teacherId,
		status: e.status,
		isAdmin: e.isAdmin
	};
}

// Sort evaluations by timestamp
export function sortEvaluations(
	evaluations: EvaluationEntry[],
	ascending: boolean
): EvaluationEntry[] {
	return [...evaluations].sort((a, b) =>
		ascending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
	);
}

// Multi-term filter matching (comma-separated search terms)
export function matchesMultiSearch(filter: string, value: string): boolean {
	if (!filter.trim()) return true;
	const searchTerms = filter
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (searchTerms.length === 0) return true;
	return searchTerms.some((term) => value.toLowerCase().includes(term));
}
