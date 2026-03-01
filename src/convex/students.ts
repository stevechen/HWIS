import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { requireAdminRole, getAuthenticatedUser } from './auth';
import type { MutationCtx } from './_generated/server';

// Validate studentId is a 7-digit number (skip for testToken)
function validateStudentId(studentId: string, testToken?: string): void {
	// Skip validation for test environment
	if (testToken) {
		return;
	}
	if (!/^\d{7}$/.test(studentId)) {
		throw new Error('Student ID must be a 7-digit number');
	}
}

// Get or create a class based on grade and class name
// className: "default", "IB", "1", "2", etc.
async function getOrCreateClass(
	ctx: MutationCtx,
	grade: number,
	className: string
): Promise<Id<'classes'>> {
	// Validate grade range
	if (grade < 7 || grade > 12) {
		throw new Error('Grade must be between 7 and 12');
	}

	// Check if class already exists
	const existingClass = await ctx.db
		.query('classes')
		.withIndex('by_grade_class', (q) => q.eq('grade', grade).eq('class', className))
		.first();

	if (existingClass) {
		return existingClass._id;
	}

	// Create new class
	return await ctx.db.insert('classes', {
		grade,
		class: className
	});
}

export const list = query({
	args: {
		search: v.optional(v.string()),
		status: v.optional(v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))),
		classId: v.optional(v.id('classes')),
		_trigger: v.optional(v.number()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return [];

		let students;
		if (args.classId !== undefined) {
			// Use index on classId
			students = await ctx.db
				.query('students')
				.withIndex('by_classId', (q) => q.eq('classId', args.classId!))
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

		// Enrich with class info from classes table
		const classIds = [
			...new Set(
				filtered.map((s) => s.classId).filter((id): id is Id<'classes'> => id !== undefined)
			)
		];
		const classRecords = await Promise.all(classIds.map((id) => ctx.db.get(id)));
		const classMap = new Map(classRecords.filter(Boolean).map((c) => [c!._id, c!]));

		const result = filtered.map((s) => ({
			...s,
			classInfo: s.classId ? classMap.get(s.classId) || null : null
		}));

		return result.sort((a, b) => a.englishName.localeCompare(b.englishName));
	}
});

export const create = mutation({
	args: {
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(), // Must be 7-digit number
		grade: v.number(), // Grade (7-12) - will get or create class
		class: v.optional(v.string()), // Class number (e.g., "1", "2"), defaults to "1"
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		upsert: v.optional(v.boolean()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		// Validate studentId is a 7-digit number
		validateStudentId(args.studentId, args.testToken);

		// Get or create class based on grade and class name
		// "default", "IB", "1", "2", etc. - defaults to "default" class
		const className = args.class || 'default';
		const classId = await getOrCreateClass(ctx, args.grade, className);

		const existing = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		if (existing) {
			if (args.upsert) {
				await ctx.db.patch(existing._id, {
					englishName: args.englishName,
					chineseName: args.chineseName,
					classId,
					status: args.status,
					note: args.note ?? ''
				});
				return existing._id;
			}
			throw new Error('Student ID already exists');
		}

		const id = await ctx.db.insert('students', {
			englishName: args.englishName,
			chineseName: args.chineseName,
			studentId: args.studentId,
			classId,
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
		studentId: v.string(), // Must be 7-digit number
		grade: v.number(), // Grade (7-12) - will get or create class
		class: v.optional(v.string()), // Class name: "default", "IB", "1", "2", etc. - defaults to "default"
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		// Validate studentId is a 7-digit number
		validateStudentId(args.studentId, args.testToken);

		// Get or create class based on grade and class name
		// "default", "IB", "1", "2", etc. - defaults to "default" class
		const className = args.class || 'default';
		const classId = await getOrCreateClass(ctx, args.grade, className);

		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error('Student not found');

		if (args.studentId !== existing.studentId) {
			const duplicate = await ctx.db
				.query('students')
				.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
				.first();

			if (duplicate && duplicate._id !== args.id) throw new Error('Student ID already exists');
		}

		const updateData: Record<string, unknown> = {
			englishName: args.englishName,
			chineseName: args.chineseName,
			studentId: args.studentId,
			classId,
			status: args.status
		};

		if (args.note !== undefined) {
			updateData.note = args.note ?? '';
		}

		await ctx.db.patch(args.id, updateData);
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
				studentId: v.string(), // Must be 7-digit number
				grade: v.number(), // Grade (7-12) - will get or create class
				class: v.optional(v.string()), // Class number (e.g., "1", "2"), defaults to "1"
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
				// Validate studentId is a 7-digit number
				validateStudentId(student.studentId, args.testToken);

				// Get or create class based on grade and class name
				// "default", "IB", "1", "2", etc. - defaults to "default" class
				const className = student.class || 'default';
				const classId = await getOrCreateClass(ctx, student.grade, className);

				const existing = await ctx.db
					.query('students')
					.withIndex('by_studentId', (q) => q.eq('studentId', student.studentId))
					.first();

				if (existing) {
					await ctx.db.patch(existing._id, {
						englishName: student.englishName,
						chineseName: student.chineseName,
						classId,
						status: student.status,
						note: student.note ?? ''
					});
					results.push({ studentId: student.studentId, success: true, action: 'updated' });
				} else {
					await ctx.db.insert('students', {
						englishName: student.englishName,
						chineseName: student.chineseName,
						studentId: student.studentId,
						classId,
						status: student.status,
						note: student.note ?? ''
					});
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

		// First, seed default classes
		const grades = [7, 8, 9, 10, 11, 12];
		const classCounts = ['1', '2', '3'];
		const classIdMap = new Map<string, Id<'classes'>>();

		for (const grade of grades) {
			for (const classNum of classCounts) {
				// Check if already exists
				const existingClass = await ctx.db
					.query('classes')
					.withIndex('by_grade_class', (q) => q.eq('grade', grade).eq('class', classNum))
					.first();

				if (!existingClass) {
					const id = await ctx.db.insert('classes', {
						grade,
						class: classNum
					});
					classIdMap.set(`${grade}-${classNum}`, id);
				} else {
					classIdMap.set(`${grade}-${classNum}`, existingClass._id);
				}
			}
		}

		// Seed students with 7-digit IDs
		const students = [
			{
				englishName: 'Alice Smith',
				chineseName: '史艾莉',
				studentId: '7001001', // 7-digit: 7(grade)001(sequence)
				classId: classIdMap.get('9-1')!,
				status: 'Enrolled' as const,
				note: 'Top performer'
			},
			{
				englishName: 'Bob Jones',
				chineseName: '張博博',
				studentId: '8002002', // 8(grade)002(sequence)
				classId: classIdMap.get('10-2')!,
				status: 'Enrolled' as const,
				note: ''
			},
			{
				englishName: 'Charlie Brown',
				chineseName: '布查理',
				studentId: '9003003', // 9(grade)003(sequence)
				classId: classIdMap.get('11-3')!,
				status: 'Enrolled' as const,
				note: ''
			},
			{
				englishName: 'David Wilson',
				chineseName: '魏大維',
				studentId: '1001004', // 10(grade)004(sequence)
				classId: classIdMap.get('12-1')!,
				status: 'Not Enrolled' as const,
				note: ''
			},
			{
				englishName: 'Eve Davis',
				chineseName: '戴伊芙',
				studentId: '1102005', // 11(grade)005(sequence)
				classId: classIdMap.get('9-2')!,
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

// Get student by studentId code (used for student authentication)
export const getByStudentId = query({
	args: {
		studentId: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		return student;
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

		// Validate studentId is a 7-digit number
		try {
			validateStudentId(args.studentId, args.testToken);
		} catch {
			return { exists: false };
		}

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
				studentId: v.string(), // Must be 7-digit number
				grade: v.number(),
				class: v.optional(v.string()),
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
			// Validate 7-digit format
			try {
				validateStudentId(student.studentId, args.testToken);
			} catch (e) {
				const error = e instanceof Error ? e.message : 'Invalid student ID format';
				results.errors.push({ studentId: student.studentId, reason: error });
				return;
			}

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

		if (args.mode === 'halt' && (batchDuplicates.length > 0 || databaseDuplicates.length > 0)) {
			let errorMessage = '';
			if (batchDuplicates.length > 0) {
				errorMessage += `Duplicate student IDs in import: ${batchDuplicates.map((d) => d.studentId).join(', ')}. `;
			}
			if (databaseDuplicates.length > 0) {
				errorMessage += `Student IDs already exist in database: ${databaseDuplicates.map((d) => d.studentId).join(', ')}. `;
			}
			throw new Error(errorMessage.trim());
		}

		if (args.mode === 'skip') {
			const skipIds = new Set(batchDuplicates.map((d) => d.studentId));
			for (const d of databaseDuplicates) {
				skipIds.add(d.studentId);
			}
			results.skipped = Array.from(skipIds);
		}

		const processedStudentIds = new Set<string>();

		for (const student of args.students) {
			// Skip if already errored
			if (results.errors.some((e) => e.studentId === student.studentId)) {
				continue;
			}

			// Skip duplicates in skip mode
			if (args.mode === 'skip' && results.skipped.includes(student.studentId)) {
				continue;
			}

			// Get or create class
			// "default", "IB", "1", "2", etc. - defaults to "default" class
			const className = student.class || 'default';
			const classId = await getOrCreateClass(ctx, student.grade, className);

			// Skip duplicates in update mode (only update existing)
			if (args.mode === 'update') {
				const existing = await ctx.db
					.query('students')
					.filter((q) => q.eq(q.field('studentId'), student.studentId))
					.first();

				if (!existing) {
					processedStudentIds.add(student.studentId);
					await ctx.db.insert('students', {
						englishName: student.englishName,
						chineseName: student.chineseName,
						studentId: student.studentId,
						classId,
						status: student.status,
						note: student.note ?? ''
					});
					results.created.push(student.studentId);
				} else {
					await ctx.db.patch(existing._id, {
						englishName: student.englishName,
						chineseName: student.chineseName,
						classId,
						status: student.status,
						note: student.note ?? ''
					});
					results.updated.push(student.studentId);
				}
			} else {
				// For halt and skip modes
				const isBatchDuplicate = batchDuplicates.some((d) => d.studentId === student.studentId);
				const isDbDuplicate = databaseDuplicates.some((d) => d.studentId === student.studentId);

				if (isBatchDuplicate || isDbDuplicate) {
					results.skipped.push(student.studentId);
					continue;
				}

				processedStudentIds.add(student.studentId);
				await ctx.db.insert('students', {
					englishName: student.englishName,
					chineseName: student.chineseName,
					studentId: student.studentId,
					classId,
					status: student.status,
					note: student.note ?? ''
				});
				results.created.push(student.studentId);
			}
		}

		return results;
	}
});
