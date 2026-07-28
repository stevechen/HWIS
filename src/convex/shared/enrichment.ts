import type { Doc, Id } from '../_generated/dataModel';
import type { GenericDatabaseReader } from 'convex/server';
import type { DataModel } from '../_generated/dataModel';

export type EnrichedEvaluation = {
	_id: Id<'evaluations'>;
	studentId: Id<'students'>;
	teacherId: Id<'users'>;
	value: number;
	categoryId: Id<'point_categories'>;
	details: string;
	timestamp: number;
	semesterId: string;
	englishName: string;
	chineseName: string;
	studentIdCode: string;
	status: 'Enrolled' | 'Not Enrolled';
	grade: number;
	class?: string;
	category: string;
};

export async function enrichEvaluations(
	evaluations: Doc<'evaluations'>[],
	ctx: { db: GenericDatabaseReader<DataModel> }
): Promise<EnrichedEvaluation[]> {
	const studentIds = [...new Set(evaluations.map((e) => e.studentId).filter(Boolean))];
	const categoryIds = [...new Set(evaluations.map((e) => e.categoryId).filter(Boolean))];

	const [students, categories, classes] = await Promise.all([
		Promise.all(studentIds.map((id) => ctx.db.get(id))),
		Promise.all(categoryIds.map((id) => ctx.db.get(id))),
		ctx.db.query('classes').collect()
	]);

	const studentMap = new Map(
		students.filter((s): s is Doc<'students'> => Boolean(s)).map((s) => [s._id, s])
	);
	const categoryMap = new Map(
		categories.filter((c): c is Doc<'point_categories'> => Boolean(c)).map((c) => [c._id, c])
	);
	const classMap = new Map(classes.map((c) => [c._id, c]));

	return evaluations.map((eval_) => {
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
