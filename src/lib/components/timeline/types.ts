export interface EvaluationEntry {
	_id: string;
	value: number;
	category: string;
	subCategory?: string;
	details?: string;
	timestamp: number;
	teacherName?: string;
	isAdmin?: boolean;
	englishName?: string;
	grade?: number;
	studentId?: string;
	studentIdCode?: string; // The actual student ID code (e.g., SE2024001)
	teacherId?: string; // for ownership check
	status?: 'Enrolled' | 'Not Enrolled'; // Student enrollment status
}
