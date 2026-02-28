export interface EvaluationEntry {
	_id: string;
	value: number;
	category?: string; // Category name (optional, may not be present in all queries)
	categoryId?: string; // Category ID for updates
	details?: string;
	timestamp: number;
	teacherName?: string;
	isAdmin?: boolean;
	englishName?: string;
	grade?: number;
	class?: string; // NEW - class identifier (e.g., "1", "2", "3")
	isIB?: boolean; // NEW - IB student flag
	studentId?: string;
	studentIdCode?: string; // The actual student ID code (e.g., SE2024001)
	teacherId?: string; // for ownership check
	status?: 'Enrolled' | 'Not Enrolled'; // Student enrollment status
}
