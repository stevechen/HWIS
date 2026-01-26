import { mutation } from '../_generated/server';
import { v } from 'convex/values';

// Copy getFridayOfWeek function since it's not exported
function getFridayOfWeek(timestamp: number): number {
	const date = new Date(timestamp);
	const day = date.getDay();
	const diff = date.getDate() - day + (day === 0 ? -6 : 1);
	const friday = new Date(date.setDate(diff));
	friday.setHours(0, 0, 0, 0);
	return friday.getTime();
}

// Weekly Reports Test Data Generator
// Creates realistic 5 weeks of evaluation data for testing

export const createWeeklyReportTestData = mutation({
	args: {},
	handler: async (ctx: any) => {
		const tag = 'weekly-reports-test';
		const semesterId = '2024-H2';

		// Helper function to generate unique identifiers
		function generateWeeklyTestIdentifier(suffix: string): string {
			const timestamp = Date.now().toString(36);
			const random = Math.random().toString(36).substring(2, 8);
			return `weekly-test-${timestamp}-${random}-${suffix}`;
		}

		// Week definitions (5 consecutive weeks)
		const weeks = [
			{
				weekNumber: 49,
				start: '2024-12-02',
				end: '2024-12-06',
				friday: new Date('2024-12-06T00:00:00Z').getTime(),
				intensity: 'light',
				evaluationCount: 12,
				studentCount: 3
			},
			{
				weekNumber: 50,
				start: '2024-12-09',
				end: '2024-12-13',
				friday: new Date('2024-12-13T00:00:00Z').getTime(),
				intensity: 'moderate',
				evaluationCount: 18,
				studentCount: 4
			},
			{
				weekNumber: 51,
				start: '2024-12-16',
				end: '2024-12-20',
				friday: new Date('2024-12-20T00:00:00Z').getTime(),
				intensity: 'heavy',
				evaluationCount: 25,
				studentCount: 5
			},
			{
				weekNumber: 2,
				start: '2025-01-06',
				end: '2025-01-10',
				friday: new Date('2025-01-10T00:00:00Z').getTime(),
				intensity: 'moderate',
				evaluationCount: 20,
				studentCount: 4
			},
			{
				weekNumber: 3,
				start: '2025-01-13',
				end: '2025-01-17',
				friday: new Date('2025-01-17T00:00:00Z').getTime(),
				intensity: 'light',
				evaluationCount: 15,
				studentCount: 3
			}
		];

		// Create 3 teachers with different evaluation patterns
		const teachers = [
			{
				authId: generateWeeklyTestIdentifier('teacher-academic'),
				name: 'Test Teacher Academic',
				focus: ['Academic', 'Creativity'],
				typicalPoints: [2, 3], // Higher points for academic work
				subCategories: ['Homework', 'Participation', 'Leadership', 'Designing & Creating']
			},
			{
				authId: generateWeeklyTestIdentifier('teacher-activity'),
				name: 'Test Teacher Activity',
				focus: ['Activity', 'Service'],
				typicalPoints: [1, 2], // Moderate points for activities
				subCategories: ['Sports', 'Club Participation', 'Volunteering', 'School Service']
			},
			{
				authId: generateWeeklyTestIdentifier('teacher-service'),
				name: 'Test Teacher Service',
				focus: ['Service', 'Other Issues'],
				typicalPoints: [1, 2, -1], // Mix of positive and corrective points
				subCategories: ['Volunteering', 'School Service', 'Behavior', 'Other']
			}
		];

		// Create teacher records
		const teacherIds: string[] = [];
		for (const teacher of teachers) {
			const teacherId = await ctx.db.insert('users', {
				authId: teacher.authId,
				role: 'teacher',
				status: 'active',
				e2eTag: tag
			});
			teacherIds.push(teacherId);
		}

		// Create students with realistic distribution
		const students = [
			{
				grade: 9,
				englishName: 'Alice Chen',
				chineseName: '陳愛麗',
				studentId: generateWeeklyTestIdentifier('STU-9A')
			},
			{
				grade: 9,
				englishName: 'Bob Wang',
				chineseName: '王小明',
				studentId: generateWeeklyTestIdentifier('STU-9B')
			},
			{
				grade: 10,
				englishName: 'Charlie Liu',
				chineseName: '劉小華',
				studentId: generateWeeklyTestIdentifier('STU-10A')
			},
			{
				grade: 10,
				englishName: 'Diana Zhang',
				chineseName: '張小美',
				studentId: generateWeeklyTestIdentifier('STU-10B')
			},
			{
				grade: 11,
				englishName: 'Edward Lin',
				chineseName: '林小傑',
				studentId: generateWeeklyTestIdentifier('STU-11A')
			}
		];

		// Create student records
		const studentIds: string[] = [];
		for (const student of students) {
			const studentId = await ctx.db.insert('students', {
				englishName: student.englishName,
				chineseName: student.chineseName,
				studentId: student.studentId,
				grade: student.grade,
				status: 'Enrolled',
				e2eTag: tag
			});
			studentIds.push(studentId);
		}

		// Use existing categories (avoid creation conflicts)
		const categoryMap = new Map();
		const existingCategories = await ctx.db.query('point_categories').collect();

		for (const existing of existingCategories) {
			categoryMap.set(existing.name, existing._id);
		}

		const categories = [
			{ name: 'Creativity', subCategories: ['Leadership', 'Designing & Creating'] },
			{ name: 'Activity', subCategories: ['Sports', 'Club Participation'] },
			{ name: 'Service', subCategories: ['Volunteering', 'School Service'] },
			{ name: 'Academic', subCategories: ['Homework', 'Participation'] },
			{ name: "Parents' Day", subCategories: [] },
			{ name: 'Other Issues', subCategories: ['Behavior', 'Other'] }
		];

		const categoryIds: string[] = [];
		for (const category of categories) {
			const categoryId =
				categoryMap.get(category.name) ||
				(await ctx.db.insert('point_categories', {
					name: category.name,
					subCategories: category.subCategories,
					e2eTag: tag
				}));
			categoryIds.push(categoryId);
		}

		// Generate evaluations for each week
		const createdEvaluations: any[] = [];

		for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
			const week = weeks[weekIndex];

			// Determine which students are active this week
			const activeStudents = studentIds.slice(0, week.studentCount);

			// Generate evaluations with teacher-specific patterns
			let evaluationIndex = 0;

			while (evaluationIndex < week.evaluationCount) {
				// Select student (rotate through active students)
				const studentIndex = evaluationIndex % activeStudents.length;
				const studentId = activeStudents[studentIndex];

				// Select teacher (rotate to distribute evaluations)
				const teacherIndex = Math.floor(evaluationIndex / 3) % teachers.length;
				const teacher = teachers[teacherIndex];
				const teacherId = teacherIds[teacherIndex];

				// Select category based on teacher focus
				const categoryIndex = teacherIndex % teacher.focus.length;
				const categoryName = teacher.focus[categoryIndex];

				// Get subcategory for this category
				const category = categories.find((c) => c.name === categoryName);
				if (!category) continue; // Skip if category not found
				const subCategories = category.subCategories || [];
				const subCategory =
					subCategories.length > 0
						? subCategories[Math.floor(Math.random() * subCategories.length)]
						: '';

				// Generate point value (realistic distribution)
				let pointValue: number;
				const rand = Math.random();
				if (rand < 0.7) {
					// 70% positive (1-2 points)
					pointValue =
						teacher.typicalPoints[Math.floor(Math.random() * teacher.typicalPoints.length)];
				} else if (rand < 0.9) {
					// 20% high positive (3 points)
					pointValue = 3;
				} else {
					// 10% negative (-1 to -2 points)
					pointValue = Math.random() < 0.5 ? -1 : -2;
				}

				// Generate timestamp within the week
				const weekStart = new Date(week.start + 'T00:00:00Z').getTime();
				const weekEnd = new Date(week.end + 'T23:59:59Z').getTime();
				const timestamp = weekStart + Math.random() * (weekEnd - weekStart);

				// Create evaluation
				const evaluationId = await ctx.db.insert('evaluations', {
					studentId,
					teacherId,
					value: pointValue,
					category: categoryName,
					subCategory,
					details: `${teacher.name} evaluation for ${category.name}${subCategory ? ' - ' + subCategory : ''}`,
					timestamp,
					semesterId,
					e2eTag: tag
				});

				createdEvaluations.push({
					id: evaluationId,
					week: week.weekNumber,
					friday: week.friday,
					studentId,
					teacherId,
					category: categoryName,
					value: pointValue,
					timestamp
				});

				evaluationIndex++;
			}
		}

		return {
			success: true,
			tag,
			weeks: weeks.length,
			teachers: teacherIds.length,
			students: studentIds.length,
			evaluations: createdEvaluations.length,
			summary: weeks.map((w) => ({
				weekNumber: w.weekNumber,
				fridayDate: w.friday,
				start: w.start,
				end: w.end,
				intensity: w.intensity,
				evaluations: w.evaluationCount,
				students: w.studentCount
			}))
		};
	}
});

// Helper function to delete all tagged data
async function deleteByTag(ctx: any, table: string, tag: string): Promise<number> {
	const docs = await ctx.db.query(table).collect();
	const taggedDocs = docs.filter((doc: any) => doc.e2eTag === tag);

	for (const doc of taggedDocs) {
		await ctx.db.delete(table as any, doc._id);
	}

	return taggedDocs.length;
}

// Helper function to verify complete cleanup
async function verifyCompleteCleanup(ctx: any, tag: string): Promise<any[]> {
	const tables = ['evaluations', 'audit_logs', 'students', 'users', 'point_categories'];
	const remaining: any[] = [];

	for (const table of tables) {
		const docs = await ctx.db.query(table).collect();
		const tagged = docs.filter((doc: any) => doc.e2eTag === tag);
		remaining.push(...tagged);
	}

	return remaining;
}

export const cleanupWeeklyReportTestData = mutation({
	args: {},
	handler: async (ctx: any) => {
		const tag = 'weekly-reports-test';

		// Delete in foreign key dependency order
		const deletedEvaluations = await deleteByTag(ctx, 'evaluations', tag);
		const deletedAuditLogs = await deleteByTag(ctx, 'audit_logs', tag);
		const deletedStudents = await deleteByTag(ctx, 'students', tag);
		const deletedUsers = await deleteByTag(ctx, 'users', tag); // teachers
		const deletedCategories = await deleteByTag(ctx, 'point_categories', tag);

		// Verify complete cleanup
		const remaining = await verifyCompleteCleanup(ctx, tag);
		if (remaining.length > 0) {
			throw new Error(`Incomplete cleanup: ${remaining.length} items remain across tables`);
		}

		return {
			success: true,
			tag,
			deletedCounts: {
				evaluations: deletedEvaluations,
				audit_logs: deletedAuditLogs,
				students: deletedStudents,
				users: deletedUsers,
				point_categories: deletedCategories
			},
			remainingCount: remaining.length
		};
	}
});
