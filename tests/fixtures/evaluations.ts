import type { EvaluationEntry } from '$lib/components/timeline/types';

/**
 * Create a mock evaluation entry with sensible defaults
 */
export function createMockEvaluation(overrides: Partial<EvaluationEntry> = {}): EvaluationEntry {
	return {
		_id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		value: 5,
		category: 'Academic',
		categoryId: 'cat-academic-001',
		details: 'Excellent work on the assignment',
		timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
		teacherName: 'Ms. Johnson',
		teacherId: 'teacher-001',
		englishName: 'John Smith',
		grade: 10,
		studentId: 'student-001',
		studentIdCode: 'SE2024001',
		status: 'Enrolled',
		isAdmin: false,
		...overrides
	};
}

/**
 * Create a set of mock evaluations with varied data
 */
export function createMockEvaluationSet(): EvaluationEntry[] {
	const now = Date.now();
	return [
		createMockEvaluation({
			_id: 'eval-positive-1',
			value: 5,
			category: 'Academic',
			categoryId: 'cat-academic-001',
			timestamp: now - 1000 * 60 * 60 * 2, // 2 hours ago
			englishName: 'Alice Chen',
			studentIdCode: 'SE2024001',
			teacherName: 'Ms. Johnson',
			teacherId: 'teacher-001'
		}),
		createMockEvaluation({
			_id: 'eval-negative-1',
			value: -3,
			category: 'Behavior',
			categoryId: 'cat-behavior-001',
			timestamp: now - 1000 * 60 * 60 * 24, // 1 day ago
			englishName: 'Bob Wang',
			studentIdCode: 'SE2024002',
			teacherName: 'Mr. Smith',
			teacherId: 'teacher-002'
		}),
		createMockEvaluation({
			_id: 'eval-admin-1',
			value: 10,
			category: 'Special',
			categoryId: 'cat-special-001',
			timestamp: now - 1000 * 60 * 60 * 48, // 2 days ago
			isAdmin: true,
			teacherName: 'Admin User',
			teacherId: 'admin-001',
			englishName: 'Carol Lee',
			studentIdCode: 'SE2024003'
		}),
		createMockEvaluation({
			_id: 'eval-unenrolled-1',
			value: 2,
			category: 'Academic',
			categoryId: 'cat-academic-001',
			timestamp: now - 1000 * 60 * 60 * 72, // 3 days ago
			status: 'Not Enrolled',
			englishName: 'David Kim',
			studentIdCode: 'SE2024004',
			teacherName: 'Ms. Johnson',
			teacherId: 'teacher-001'
		})
	];
}

/**
 * Mock categories data
 */
export const mockCategories = [
	{
		_id: 'cat-academic-001',
		name: 'Academic'
	},
	{
		_id: 'cat-behavior-001',
		name: 'Behavior'
	},
	{
		_id: 'cat-special-001',
		name: 'Special'
	}
];

/**
 * Mock student data
 */
export const mockStudent = {
	_id: 'student-001',
	studentId: 'SE2024001',
	englishName: 'John Smith',
	chineseName: 'John Smith',
	grade: 10,
	classSection: 'A',
	status: 'Enrolled'
};

/**
 * Mock teacher user data
 */
export const mockTeacherUser = {
	_id: 'teacher-001',
	name: 'Ms. Johnson',
	email: 'johnson@school.edu',
	role: 'teacher'
};

/**
 * Mock admin user data
 */
export const mockAdminUser = {
	_id: 'admin-001',
	name: 'Admin User',
	email: 'admin@school.edu',
	role: 'admin'
};

/**
 * Create mock paginated response for infinite scroll testing
 */
export function createMockPaginatedResponse(
	evaluations: EvaluationEntry[],
	options: {
		isDone?: boolean;
		continueCursor?: string | null;
	} = {}
) {
	return {
		page: evaluations,
		isDone: options.isDone ?? false,
		continueCursor: options.continueCursor ?? 'cursor-1'
	};
}
