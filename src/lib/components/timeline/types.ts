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
}
