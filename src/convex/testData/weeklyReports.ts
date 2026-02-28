import { mutation } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

// Weekly Reports Test Data Generator
// Creates realistic 5 weeks of evaluation data for testing

export const createWeeklyReportTestData = mutation({
	args: { tag: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const tag = args.tag || 'weekly-reports-test';
		const semesterId = '2024-H2';

		// Helper function to generate unique identifiers
		function generateWeeklyTestIdentifier(suffix: string): string {
			const timestamp = Date.now().toString(36);
			const random = Math.random().toString(36).substring(2, 8);
			return `weekly-test-${timestamp}-${random}-${suffix}`;
		}

		// Week definitions (5 consecutive recent weeks, relative to now)
		const msPerDay = 24 * 60 * 60 * 1000;
		const today = new Date();
		const todayUtc = new Date(
			Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
		);
		const dayOfWeek = todayUtc.getUTCDay(); // 0=Sun, 5=Fri
		const daysSinceFriday = dayOfWeek >= 5 ? dayOfWeek - 5 : dayOfWeek + 2;
		const lastFriday = new Date(todayUtc.getTime() - daysSinceFriday * msPerDay);

		const intensityPattern = ['light', 'moderate', 'heavy', 'moderate', 'light'] as const;
		const evaluationCounts = [12, 18, 25, 20, 15];
		const studentCounts = [3, 4, 5, 4, 3];

		const weeks = Array.from({ length: 5 }, (_, index) => {
			const fridayDate = new Date(lastFriday.getTime() - index * 7 * msPerDay);
			const mondayDate = new Date(fridayDate.getTime() - 4 * msPerDay);
			const start = mondayDate.toISOString().slice(0, 10);
			const end = fridayDate.toISOString().slice(0, 10);

			return {
				weekNumber: index + 1,
				start,
				end,
				friday: fridayDate.getTime(),
				intensity: intensityPattern[index],
				evaluationCount: evaluationCounts[index],
				studentCount: studentCounts[index]
			};
		});

		// Create 3 teachers with different evaluation patterns
		const teachers = [
			{
				authId: generateWeeklyTestIdentifier('teacher-academic'),
				name: 'Test Teacher Academic',
				focus: ['Academic', 'Creativity'],
				typicalPoints: [2, 3] // Higher points for academic work
			},
			{
				authId: generateWeeklyTestIdentifier('teacher-activity'),
				name: 'Test Teacher Activity',
				focus: ['Activity', 'Service'],
				typicalPoints: [1, 2] // Moderate points for activities
			},
			{
				authId: generateWeeklyTestIdentifier('teacher-service'),
				name: 'Test Teacher Service',
				focus: ['Service', 'Other Issues'],
				typicalPoints: [1, 2, -1] // Mix of positive and corrective points
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

		// Create classes for test students
		const classIds: Record<number, Id<'classes'>> = {};
		for (const grade of [9, 10, 11]) {
			const classId = await ctx.db.insert('classes', {
				grade,
				class: '1'
			});
			classIds[grade] = classId;
		}

		// Create student records
		const studentIds: string[] = [];
		for (const student of students) {
			const studentId = await ctx.db.insert('students', {
				englishName: student.englishName,
				chineseName: student.chineseName,
				studentId: student.studentId,
				classId: classIds[student.grade],
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
			{ name: 'Creativity' },
			{ name: 'Activity' },
			{ name: 'Service' },
			{ name: 'Academic' },
			{ name: "Parents' Day" },
			{ name: 'Other Issues' }
		];

		const categoryIds: string[] = [];
		for (const category of categories) {
			const categoryId =
				categoryMap.get(category.name) ||
				(await ctx.db.insert('point_categories', {
					name: category.name,
					e2eTag: tag
				}));
			categoryIds.push(categoryId);
		}

		// Generate evaluations for each week
		const createdEvaluations: {
			id: string;
			week: number;
			friday: number;
			studentId: string;
			teacherId: string;
			categoryId: string;
			categoryName: string;
			value: number;
			timestamp: number;
		}[] = [];

		for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
			const week = weeks[weekIndex];

			// Determine which students are active this week
			const activeStudents = studentIds.slice(0, week.studentCount);

			// Generate evaluations with teacher-specific patterns
			let evaluationIndex = 0;

			while (evaluationIndex < week.evaluationCount) {
				// Select student (rotate through active students)
				const studentIndex = evaluationIndex % activeStudents.length;
				const studentId = activeStudents[studentIndex] as Id<'students'>;

				// Select teacher (rotate to distribute evaluations)
				const teacherIndex = Math.floor(evaluationIndex / 3) % teachers.length;
				const teacher = teachers[teacherIndex];
				const teacherId = teacherIds[teacherIndex] as Id<'users'>;

				// Select category based on teacher focus
				const categoryIndex = teacherIndex % teacher.focus.length;
				const categoryName = teacher.focus[categoryIndex];

				// Get category ID
				const categoryId =
					categoryMap.get(categoryName) ||
					categoryIds[categories.findIndex((c) => c.name === categoryName)];
				if (!categoryId) continue; // Skip if category not found

				const category = categories.find((c) => c.name === categoryName);
				if (!category) continue; // Skip if category not found

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

				// Generate timestamp within the week (use local timezone to match getFridayOfWeek)
				const weekStart = new Date(week.start + 'T00:00:00').getTime();
				const weekEnd = new Date(week.end + 'T23:59:59').getTime();
				const timestamp = weekStart + Math.random() * (weekEnd - weekStart);

				// Create evaluation
				const evaluationId = await ctx.db.insert('evaluations', {
					studentId,
					teacherId,
					value: pointValue,
					categoryId: categoryId as Id<'point_categories'>,
					details: `${teacher.name} evaluation for ${category.name}`,
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
					categoryId: categoryId,
					categoryName,
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

type E2ETable = 'evaluations' | 'audit_logs' | 'students' | 'users' | 'point_categories';
type TaggedDoc = { _id: Id<E2ETable>; e2eTag?: string };

// Helper function to delete all tagged data
async function deleteByTag(ctx: MutationCtx, table: E2ETable, tag: string): Promise<number> {
	const docs = await ctx.db.query(table).collect();
	const taggedDocs = docs.filter((doc) => (doc as TaggedDoc).e2eTag === tag);

	for (const doc of taggedDocs) {
		await ctx.db.delete(doc._id);
	}

	return taggedDocs.length;
}

// Helper function to verify complete cleanup
async function verifyCompleteCleanup(
	ctx: MutationCtx,
	tag: string
): Promise<Array<{ e2eTag: string }>> {
	const tables: E2ETable[] = ['evaluations', 'audit_logs', 'students', 'users', 'point_categories'];
	const remaining: Array<{ e2eTag: string }> = [];

	for (const table of tables) {
		const docs = await ctx.db.query(table).collect();
		const tagged = docs.filter((doc) => (doc as TaggedDoc).e2eTag === tag);
		remaining.push(...(tagged as Array<{ e2eTag: string }>));
	}

	return remaining;
}

export const cleanupWeeklyReportTestData = mutation({
	args: { tag: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const tag = args.tag || 'weekly-reports-test';

		// First, find all students with this tag
		const students = await ctx.db.query('students').collect();
		const taggedStudents = students.filter((s) => s.e2eTag === tag);
		const taggedStudentIds = new Set(taggedStudents.map((s) => s._id));

		// Delete evaluations that reference tagged students (even if evaluation doesn't have the tag)
		let deletedEvaluations = 0;
		const evaluations = await ctx.db.query('evaluations').collect();
		const evaluationIdsToDelete = new Set<Id<'evaluations'>>();
		for (const evaluation of evaluations) {
			if (taggedStudentIds.has(evaluation.studentId)) {
				evaluationIdsToDelete.add(evaluation._id);
			}
		}
		for (const evalId of evaluationIdsToDelete) {
			await ctx.db.delete(evalId);
			deletedEvaluations++;
		}

		// Delete audit logs that reference tagged students or deleted evaluations
		let deletedAuditLogs = 0;
		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const audit of auditLogs) {
			// Check if audit log references a tagged student or deleted evaluation
			// audit.targetTable can be 'evaluations', 'students', etc.
			// audit.targetId is the string ID of the affected record
			const matchesEvaluation = audit.targetTable === 'evaluations';
			const matchesStudent = audit.targetTable === 'students';

			let shouldDelete = false;
			if (matchesEvaluation && evaluationIdsToDelete.has(audit.targetId as Id<'evaluations'>)) {
				shouldDelete = true;
			} else if (matchesStudent && taggedStudentIds.has(audit.targetId as Id<'students'>)) {
				shouldDelete = true;
			}

			if (shouldDelete) {
				await ctx.db.delete(audit._id);
				deletedAuditLogs++;
			}
		}

		// Delete by tag for other tables
		const deletedStudents = await deleteByTag(ctx, 'students', tag);
		const deletedUsers = await deleteByTag(ctx, 'users', tag); // teachers
		const deletedCategories = await deleteByTag(ctx, 'point_categories', tag);

		// Verify complete cleanup
		const remaining = await verifyCompleteCleanup(ctx, tag);

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
