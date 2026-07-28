interface StudentDoc {
	_id: string;
	englishName: string;
	chineseName: string;
	studentId: string;
	status: string;
	classId?: string;
}

interface CategoryDoc {
	_id: string;
	name: string;
}

interface ClassDoc {
	_id: string;
	grade: number;
	class: string;
}

interface EvaluationRow {
	studentId: string;
	categoryId: string;
	[_key: string]: unknown;
}

interface EnrichedField {
	englishName: string;
	chineseName: string;
	studentIdCode: string;
	status: string;
	grade: number;
	class: string | undefined;
	category: string;
}

type EnrichedRow = EvaluationRow & EnrichedField;

export async function enrichEvaluations(
	evaluations: EvaluationRow[],
	ctx: { db: { get: (id: string) => Promise<StudentDoc | CategoryDoc | ClassDoc | null>; query: (table: string) => { collect: () => Promise<any[]> } } }
): Promise<EnrichedRow[]> {
	const studentIds = [...new Set(evaluations.map((e) => e.studentId).filter(Boolean))];
	const categoryIds = [...new Set(evaluations.map((e) => e.categoryId).filter(Boolean))];

	const [students, categories, classes] = await Promise.all([
		Promise.all(studentIds.map((id) => ctx.db.get(id))),
		Promise.all(categoryIds.map((id) => ctx.db.get(id))),
		ctx.db.query('classes').collect()
	]);

	const studentMap = new Map(
		students.filter(Boolean).map((s: StudentDoc) => [s._id, s])
	);
	const categoryMap = new Map(
		categories.filter(Boolean).map((c: CategoryDoc) => [c._id, c])
	);
	const classMap = new Map(classes.map((c: ClassDoc) => [c._id, c]));

	return evaluations.map((eval_: EvaluationRow): EnrichedRow => {
		const student = studentMap.get(eval_.studentId);
		const category = categoryMap.get(eval_.categoryId);
		const classRecord = student?.classId ? classMap.get(student.classId) : null;
		return {
			...eval_,
			englishName: student?.englishName || 'Unknown Student',
			chineseName: student?.chineseName || '',
			studentIdCode: student?.studentId || 'N/A',
			status: student?.status || 'Not Enrolled',
			grade: classRecord?.grade ?? 0,
			class: classRecord?.class,
			category: category?.name || 'Unknown Category'
		};
	});
}
