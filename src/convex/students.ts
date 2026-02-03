import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminRole, getAuthenticatedUser } from './auth';

export const list = query({
	args: {
		search: v.optional(v.string()),
		status: v.optional(v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))),
		grade: v.optional(v.number()),
		_trigger: v.optional(v.number()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return [];

		let students;
		if (args.grade !== undefined) {
			students = await ctx.db
				.query('students')
				.withIndex('by_grade', (q) => q.eq('grade', args.grade as number))
				.collect();
		} else if (args.status !== undefined) {
			students = await ctx.db
				.query('students')
				.withIndex('by_status', (q) => q.eq('status', args.status as 'Enrolled' | 'Not Enrolled'))
				.collect();
		} else {
			students = await ctx.db.query('students').collect();
		}

		const filtered = students.filter((s) => {
			if (args.status !== undefined && s.status !== args.status) return false;
			if (args.search) {
				const search = args.search.toLowerCase();
				const matchesSearch =
					s.englishName.toLowerCase().includes(search) ||
					s.chineseName.includes(search) ||
					s.studentId.toLowerCase().includes(search);
				if (!matchesSearch) return false;
			}
			return true;
		});

		return filtered.sort((a, b) => a.englishName.localeCompare(b.englishName));
	}
});

export const create = mutation({
	args: {
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(),
		grade: v.number(),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		upsert: v.optional(v.boolean()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const existing = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		if (existing) {
			if (args.upsert) {
				await ctx.db.patch(existing._id, {
					englishName: args.englishName,
					chineseName: args.chineseName,
					grade: args.grade,
					status: args.status,
					note: args.note ?? ''
				});
				return existing._id;
			}
			throw new Error('Student ID already exists');
		}

		if (args.grade < 7 || args.grade > 12) {
			throw new Error('Grade must be between 7 and 12');
		}

		const id = await ctx.db.insert('students', {
			englishName: args.englishName,
			chineseName: args.chineseName,
			studentId: args.studentId,
			grade: args.grade,
			status: args.status,
			note: args.note ?? ''
		});
		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('students'),
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(),
		grade: v.number(),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { id, testToken: _, ...updates } = args;

		const existing = await ctx.db.get(id);
		if (!existing) throw new Error('Student not found');

		if (args.studentId !== existing.studentId) {
			const duplicate = await ctx.db
				.query('students')
				.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
				.first();

			if (duplicate && duplicate._id !== id) throw new Error('Student ID already exists');
		}

		await ctx.db.patch(id, updates);
	}
});

export const remove = mutation({
	args: {
		id: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.id))
			.take(1);

		if (evaluations.length > 0) {
			throw new Error('Cannot delete student with existing evaluations');
		}

		await ctx.db.delete(args.id);
	}
});

export const removeWithCascade = mutation({
	args: {
		id: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const student = await ctx.db.get(args.id);
		if (!student) throw new Error('Student not found');

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.id))
			.collect();

		for (const evaluation of evaluations) {
			await ctx.db.delete(evaluation._id);
		}

		await ctx.db.delete(args.id);

		return {
			deletedStudent: student.englishName,
			deletedEvaluations: evaluations.length
		};
	}
});

export const changeStatus = mutation({
	args: {
		id: v.id('students'),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		await ctx.db.patch(args.id, { status: args.status });
	}
});

export const importFromExcel = mutation({
	args: {
		students: v.array(
			v.object({
				englishName: v.string(),
				chineseName: v.string(),
				studentId: v.string(),
				grade: v.number(),
				status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
				note: v.optional(v.string())
			})
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const results = [];

		for (const student of args.students) {
			try {
				const existing = await ctx.db
					.query('students')
					.withIndex('by_studentId', (q) => q.eq('studentId', student.studentId))
					.first();

				if (existing) {
					await ctx.db.patch(existing._id, student);
					results.push({ studentId: student.studentId, success: true, action: 'updated' });
				} else {
					await ctx.db.insert('students', student);
					results.push({ studentId: student.studentId, success: true, action: 'created' });
				}
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				results.push({ studentId: student.studentId, success: false, error });
			}
		}

		return results;
	}
});

export const seed = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const existing = await ctx.db.query('students').collect();
		if (existing.length > 0) return { message: 'Students already seeded', count: existing.length };

		const students = [
			{
				englishName: 'Alice Smith',
				chineseName: '史艾莉',
				studentId: 'S1001',
				grade: 9,
				status: 'Enrolled' as const,
				note: 'Top performer'
			},
			{
				englishName: 'Bob Jones',
				chineseName: '張博博',
				studentId: 'S1002',
				grade: 10,
				status: 'Enrolled' as const,
				note: ''
			},
			{
				englishName: 'Charlie Brown',
				chineseName: '布查理',
				studentId: 'S1003',
				grade: 11,
				status: 'Enrolled' as const,
				note: ''
			},
			{
				englishName: 'David Wilson',
				chineseName: '魏大維',
				studentId: 'S1004',
				grade: 12,
				status: 'Not Enrolled' as const,
				note: ''
			},
			{
				englishName: 'Eve Davis',
				chineseName: '戴伊芙',
				studentId: 'S1005',
				grade: 9,
				status: 'Not Enrolled' as const,
				note: ''
			}
		];

		for (const s of students) {
			await ctx.db.insert('students', s);
		}

		return { message: 'Seeded students', count: students.length };
	}
});

export const getById = query({
	args: {
		id: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return null;

		const student = await ctx.db.get(args.id);
		if (!student) return null;

		const evaluations = await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('studentId'), args.id))
			.collect();

		return { ...student, evaluationCount: evaluations.length };
	}
});

export const checkStudentIdExists = query({
	args: {
		studentId: v.string(),
		excludeId: v.optional(v.id('students')),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return { exists: false };

		let existing;
		if (args.excludeId) {
			existing = await ctx.db
				.query('students')
				.filter((q) =>
					q.and(q.eq(q.field('studentId'), args.studentId), q.neq(q.field('_id'), args.excludeId))
				)
				.first();
		} else {
			existing = await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), args.studentId))
				.first();
		}
		return { exists: !!existing };
	}
});

export const checkStudentHasEvaluations = query({
	args: {
		id: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return { hasEvaluations: false, count: 0 };

		const evaluations = await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('studentId'), args.id))
			.collect();

		return {
			hasEvaluations: evaluations.length > 0,
			count: evaluations.length
		};
	}
});

export const disableStudent = mutation({
	args: {
		id: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		await ctx.db.patch(args.id, { status: 'Not Enrolled' });
	}
});

export const bulkImportWithDuplicateCheck = mutation({
	args: {
		students: v.array(
			v.object({
				englishName: v.string(),
				chineseName: v.string(),
				studentId: v.string(),
				grade: v.number(),
				status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
				note: v.optional(v.string())
			})
		),
		mode: v.union(v.literal('halt'), v.literal('skip'), v.literal('update')),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const results = {
			created: [] as string[],
			updated: [] as string[],
			skipped: [] as string[],
			errors: [] as { studentId: string; reason: string }[]
		};

		const seenIds = new Set<string>();
		const batchDuplicates: { studentId: string; rowNumber: number }[] = [];

		args.students.forEach((student, index) => {
			if (seenIds.has(student.studentId)) {
				batchDuplicates.push({ studentId: student.studentId, rowNumber: index + 2 });
			}
			seenIds.add(student.studentId);
		});

		const databaseDuplicates: { studentId: string; existingName: string; newName: string }[] = [];

		for (const student of args.students) {
			const existing = await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), student.studentId))
				.first();

			if (existing) {
				databaseDuplicates.push({
					studentId: student.studentId,
					existingName: existing.englishName,
					newName: student.englishName
				});
			}
		}

		const allDuplicates = [
			...databaseDuplicates.map((d) => ({ ...d, rowNumber: undefined as number | undefined })),
			...batchDuplicates.map((d) => ({
				studentId: d.studentId,
				existingName: '',
				newName: '',
				rowNumber: d.rowNumber
			}))
		];

		if (args.mode === 'halt' && allDuplicates.length > 0) {
			return {
				success: false,
				error: 'duplicate_found',
				message: `Found ${allDuplicates.length} duplicate student ID(s)`,
				duplicates: databaseDuplicates.map((d) => ({
					studentId: d.studentId,
					existingStudent: d.existingName,
					newStudent: d.newName
				})),
				batchDuplicates: batchDuplicates.map((d) => ({
					studentId: d.studentId,
					rowNumber: d.rowNumber
				}))
			};
		}

		for (const student of args.students) {
			try {
				const existing = await ctx.db
					.query('students')
					.filter((q) => q.eq(q.field('studentId'), student.studentId))
					.first();

				if (existing) {
					if (args.mode === 'skip') {
						results.skipped.push(student.studentId);
					} else {
						await ctx.db.patch(existing._id, student);
						results.updated.push(student.studentId);
					}
				} else {
					await ctx.db.insert('students', student);
					results.created.push(student.studentId);
				}
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				results.errors.push({ studentId: student.studentId, reason: error });
			}
		}

		return {
			success: true,
			...results,
			summary: `Created: ${results.created.length}, Updated: ${results.updated.length}, Skipped: ${results.skipped.length}, Errors: ${results.errors.length}`
		};
	}
});

export const advanceGrades = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const students = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Enrolled'))
			.collect();

		const updates = [];

		for (const student of students) {
			if (student.grade < 12) {
				await ctx.db.patch(student._id, { grade: student.grade + 1 });
				updates.push(student.studentId);
			}
		}

		return { message: `Advanced grades for ${updates.length} students`, updated: updates };
	}
});

export const archiveOldStudents = mutation({
	args: {
		years: v.optional(v.number()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const cutoffYear = new Date().getFullYear() - (args.years || 1);

		const oldStudents = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Not Enrolled'))
			.collect();

		const toDelete = [];

		for (const student of oldStudents) {
			if (student.grade < cutoffYear - 2000 + 7) {
				toDelete.push(student);
			}
		}

		const exported = toDelete.map((s) => ({
			...s,
			archivedAt: Date.now()
		}));

		for (const student of toDelete) {
			await ctx.db.delete(student._id);
		}

		return {
			message: `Archived ${exported.length} old students`,
			archived: exported.map((s) => s.studentId)
		};
	}
});
