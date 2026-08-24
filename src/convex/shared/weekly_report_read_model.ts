import type { GenericDatabaseReader } from 'convex/server';
import type { DataModel, Doc } from '../_generated/dataModel';
import { enrichEvaluations } from './enrichment';

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

export async function projectWeeklyReport(
	evaluations: Doc<'evaluations'>[],
	ctx: { db: GenericDatabaseReader<DataModel> }
): Promise<WeeklyReportStudent[]> {
	const enriched = await enrichEvaluations(evaluations, ctx);

	const studentPointsMap = new Map<string, WeeklyReportStudent>();

	for (const eval_ of enriched) {
		if (!eval_.englishName || eval_.englishName === 'Unknown Student') {
			continue;
		}

		const categoryName = eval_.category || 'Unknown Category';

		let studentData = studentPointsMap.get(eval_.studentIdCode);
		if (!studentData) {
			studentData = {
				studentId: eval_.studentIdCode,
				englishName: eval_.englishName,
				chineseName: eval_.chineseName,
				grade: eval_.grade,
				class: eval_.class,
				pointsByCategory: {},
				totalPoints: 0
			};
			studentPointsMap.set(eval_.studentIdCode, studentData);
		}

		if (!studentData.pointsByCategory[categoryName]) {
			studentData.pointsByCategory[categoryName] = 0;
		}
		studentData.pointsByCategory[categoryName] += eval_.value;
		studentData.totalPoints += eval_.value;
	}

	return Array.from(studentPointsMap.values()).sort((a, b) =>
		a.englishName.localeCompare(b.englishName)
	);
}
