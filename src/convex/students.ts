import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
	args: {
		search: v.optional(v.string()),
		status: v.optional(
			v.union(v.literal('Enrolled'), v.literal('Not Enrolled'), v.literal('Graduated'))
		),
		grade: v.optional(v.number()),
		_trigger: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const students = await ctx.db.query('students').collect();

		return students
			.filter((s) => {
				if (args.status && s.status !== args.status) return false;
				if (args.grade && s.grade !== args.grade) return false;
				if (args.search) {
					const search = args.search.toLowerCase();
					const matchesSearch =
						s.englishName.toLowerCase().includes(search) ||
						s.chineseName.includes(search) ||
						s.studentId.toLowerCase().includes(search);
					if (!matchesSearch) return false;
				}
				return true;
			})
			.sort((a, b) => a.englishName.localeCompare(b.englishName));
	}
});

export const create = mutation({
	args: {
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(),
		grade: v.number(),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled'), v.literal('Graduated')),
		note: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('studentId'), args.studentId))
			.first();

		if (existing) {
			throw new Error('Student ID already exists');
		}

		return await ctx.db.insert('students', {
			englishName: args.englishName,
			chineseName: args.chineseName,
			studentId: args.studentId,
			grade: args.grade,
			status: args.status,
			note: args.note ?? ''
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('students'),
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(),
		grade: v.number(),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled'), v.literal('Graduated')),
		note: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;

		const existing = await ctx.db.get(id);
		if (!existing) throw new Error('Student not found');

		if (args.studentId !== existing.studentId) {
			const duplicate = await ctx.db
				.query('students')
				.filter((q) => q.and(q.eq(q.field('studentId'), args.studentId), q.neq(q.field('_id'), id)))
				.first();

			if (duplicate) throw new Error('Student ID already exists');
		}

		await ctx.db.patch(id, updates);
	}
});

export const remove = mutation({
	args: { id: v.id('students') },
	handler: async (ctx, args) => {
		const evaluations = await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('studentId'), args.id))
			.collect();

		if (evaluations.length > 0) {
			throw new Error('Cannot delete student with existing evaluations');
		}

		await ctx.db.delete(args.id);
	}
});

export const removeWithCascade = mutation({
	args: { id: v.id('students') },
	handler: async (ctx, args) => {
		const student = await ctx.db.get(args.id);
		if (!student) throw new Error('Student not found');

		// Get all evaluations for this student
		const evaluations = await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('studentId'), args.id))
			.collect();

		// Delete all evaluations
		for (const evaluation of evaluations) {
			await ctx.db.delete(evaluation._id);
		}

		// Delete the student
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
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled'), v.literal('Graduated'))
	},
	handler: async (ctx, args) => {
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
				status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled'), v.literal('Graduated')),
				note: v.optional(v.string())
			})
		)
	},
	handler: async (ctx, args) => {
		const results = [];

		for (const student of args.students) {
			try {
				const existing = await ctx.db
					.query('students')
					.filter((q) => q.eq(q.field('studentId'), student.studentId))
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
	args: {},
	handler: async (ctx) => {
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
				status: 'Graduated' as const,
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
	args: { id: v.id('students') },
	handler: async (ctx, args) => {
		const student = await ctx.db.get(args.id);
		if (!student) return null;

		const evaluations = await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('studentId'), args.id))
			.collect();

		return { ...student, evaluationCount: evaluations.length };
	}
});

export const checkStudentHasEvaluations = query({
	args: { id: v.id('students') },
	handler: async (ctx, args) => {
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
	args: { id: v.id('students') },
	handler: async (ctx, args) => {
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
				status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled'), v.literal('Graduated')),
				note: v.optional(v.string())
			})
		),
		mode: v.union(v.literal('halt'), v.literal('skip'), v.literal('update'))
	},
	handler: async (ctx, args) => {
		const results = {
			created: [] as string[],
			updated: [] as string[],
			skipped: [] as string[],
			errors: [] as { studentId: string; reason: string }[]
		};

		// Check all students first for duplicates
		const duplicates = [];

		for (const student of args.students) {
			const existing = await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), student.studentId))
				.first();

			if (existing) {
				duplicates.push({
					studentId: student.studentId,
					existingName: existing.englishName,
					newName: student.englishName
				});
			}
		}

		// If halt mode and duplicates found, return detailed error
		if (args.mode === 'halt' && duplicates.length > 0) {
			return {
				success: false,
				error: 'duplicate_found',
				message: `Found ${duplicates.length} duplicate student ID(s)`,
				duplicates: duplicates.map((d) => ({
					studentId: d.studentId,
					existingStudent: d.existingName,
					newStudent: d.newName
				}))
			};
		}

		// Process all students
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
	args: {},
	handler: async (ctx) => {
		const students = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Enrolled'))
			.collect();

		const updates = [];

		for (const student of students) {
			if (student.grade < 12) {
				await ctx.db.patch(student._id, { grade: student.grade + 1 });
				updates.push(student.studentId);
			} else {
				await ctx.db.patch(student._id, {
					status: 'Graduated',
					note: student.note
						? `${student.note} | Graduated ${new Date().getFullYear()}`
						: `Graduated ${new Date().getFullYear()}`
				});
				updates.push(`${student.studentId} (graduated)`);
			}
		}

		return { message: `Advanced grades for ${updates.length} students`, updated: updates };
	}
});

export const archiveOldGraduates = mutation({
	args: { years: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const cutoffYear = new Date().getFullYear() - (args.years || 1);

		const graduates = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Graduated'))
			.collect();

		const toDelete = [];

		for (const student of graduates) {
			const match = student.note?.match(/Graduated (\d{4})/);
			if (match) {
				const gradYear = parseInt(match[1]);
				if (gradYear < cutoffYear) {
					toDelete.push(student);
				}
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
			message: `Archived ${exported.length} old graduates`,
			archived: exported.map((s) => s.studentId)
		};
	}
});
