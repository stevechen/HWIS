export async function enrichEvaluations(
	evaluations: any[],
	ctx: any
) {
	const studentIds = [...new Set(evaluations.map((e) => e.studentId).filter(Boolean))];
	const categoryIds = [...new Set(evaluations.map((e) => e.categoryId).filter(Boolean))];

	const [students, categories, classes] = await Promise.all([
		Promise.all(studentIds.map((id) => ctx.db.get(id))),
		Promise.all(categoryIds.map((id) => ctx.db.get(id))),
		ctx.db.query('classes').collect()
	]);

	const studentMap = new Map(
		students.filter(Boolean).map((s: any) => [s._id, s])
	);
	const categoryMap = new Map(
		categories.filter(Boolean).map((c: any) => [c._id, c])
	);
	const classMap = new Map(classes.map((c: any) => [c._id, c]));

	return evaluations.map((eval_: any) => {
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
