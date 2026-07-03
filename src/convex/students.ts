import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { requireAdminRole, getAuthenticatedUser } from './auth';
import type { MutationCtx } from './_generated/server';

// Validate studentId is a 6- or 7-digit number (skip for testToken)
function validateStudentId(studentId: string, testToken?: string): void {
	// Skip validation for test environment
	if (testToken) {
		return;
	}
	if (!/^\d{6,7}$/.test(studentId)) {
		throw new Error('Student ID must be a 6- or 7-digit number');
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

		// Enrich with teacher names
		const teacherIds = [
			...new Set(
				classRecords
					.filter(Boolean)
					.map((c) => c!.homeroomTeacherId)
					.filter((id): id is Id<'users'> => id !== undefined)
			)
		];
		const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
		const teacherMap = new Map(
			teachers.filter(Boolean).map((t) => [t!._id, t!.name || 'Unknown Teacher'])
		);

		const result = filtered.map((s) => {
			const classInfo = s.classId ? classMap.get(s.classId) || null : null;
			const homeroomTeacherName = classInfo?.homeroomTeacherId
				? teacherMap.get(classInfo.homeroomTeacherId) || null
				: null;
			return {
				...s,
				classInfo: classInfo ? { ...classInfo, homeroomTeacherName } : null
			};
		});

		return result.sort((a, b) => a.englishName.localeCompare(b.englishName));
	}
});

export const create = mutation({
	args: {
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(), // Must be 6- or 7-digit number
		grade: v.number(), // Grade (7-12) - will get or create class
		class: v.optional(v.string()), // Class number (e.g., "1", "2"), defaults to "1"
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		upsert: v.optional(v.boolean()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		// Validate studentId is a 6- or 7-digit number
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
		studentId: v.string(), // Must be 6- or 7-digit number
		grade: v.number(), // Grade (7-12) - will get or create class
		class: v.optional(v.string()), // Class name: "default", "IB", "1", "2", etc. - defaults to "default"
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		// Validate studentId is a 6- or 7-digit number
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

		const updateData: {
			englishName: string;
			chineseName: string;
			studentId: string;
			classId: Id<'classes'>;
			status: 'Enrolled' | 'Not Enrolled';
			note?: string;
		} = {
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
				studentId: v.string(), // Must be 6- or 7-digit number
				grade: v.number(), // Grade (7-12) - will get or create class
				class: v.optional(v.string()), // Class number (e.g., "1", "2"), defaults to "1"
				status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
				note: v.optional(v.string()),
				house: v.optional(
					v.union(
						v.literal('Heracles'),
						v.literal('Wukong'),
						v.literal('Ixbalam'),
						v.literal('Setna')
					)
				)
			})
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const results = [];

		for (const student of args.students) {
			try {
				// Validate studentId is a 6- or 7-digit number
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
						note: student.note ?? '',
						house: student.house
					});
					results.push({ studentId: student.studentId, success: true, action: 'updated' });
				} else {
					await ctx.db.insert('students', {
						englishName: student.englishName,
						chineseName: student.chineseName,
						studentId: student.studentId,
						classId,
						status: student.status,
						note: student.note ?? '',
						house: student.house
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
		await requireAdminRole(ctx, args.testToken);

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
		await requireAdminRole(ctx, args.testToken);

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

		// Validate studentId is a 6- or 7-digit number
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
		await requireAdminRole(ctx, args.testToken);

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
				studentId: v.string(), // Must be 6- or 7-digit number
				grade: v.number(),
				class: v.optional(v.string()),
				status: v.optional(v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))),
				note: v.optional(v.string()),
				house: v.optional(
					v.union(
						v.literal('Heracles'),
						v.literal('Wukong'),
						v.literal('Ixbalam'),
						v.literal('Setna')
					)
				)
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
			// Validate 6- or 7-digit format
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
			// If no explicit class provided, default to class "1" for the grade
			const className = student.class || '1';
			const classId = await getOrCreateClass(ctx, student.grade, className);

			// Default status to 'Enrolled' if not provided
			const status = student.status ?? 'Enrolled';

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
						status,
						note: student.note ?? '',
						house: student.house
					});
					results.created.push(student.studentId);
				} else {
					await ctx.db.patch(existing._id, {
						englishName: student.englishName,
						chineseName: student.chineseName,
						classId,
						status,
						note: student.note ?? '',
						house: student.house
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
					status,
					note: student.note ?? '',
					house: student.house
				});
				results.created.push(student.studentId);
			}
		}

		return results;
	}
});

// House management exports
export const listByHouse = query({
	args: {
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user)
			return {
				houses: {} as Record<string, typeof studentsWithClass>,
				orphaned: [] as typeof studentsWithClass
			};

		// Fetch all students with their class info
		const students = await ctx.db.query('students').collect();

		// Enrich with class info
		const classIds = [
			...new Set(
				students.map((s) => s.classId).filter((id): id is Id<'classes'> => id !== undefined)
			)
		];
		const classRecords = await Promise.all(classIds.map((id) => ctx.db.get(id)));
		const classMap = new Map(classRecords.filter(Boolean).map((c) => [c!._id, c!]));

		const studentsWithClass = students.map((s) => {
			const classInfo = s.classId ? classMap.get(s.classId) || null : null;
			let classDisplay = '';
			if (classInfo) {
				// Handle special class names like the classes page does
				if (classInfo.class === 'default') {
					classDisplay = `${classInfo.grade}`;
				} else if (classInfo.class === 'IB') {
					classDisplay = `${classInfo.grade}-IB`;
				} else {
					classDisplay = `${classInfo.grade}-${classInfo.class}`;
				}
			}
			return {
				_id: s._id,
				englishName: s.englishName,
				chineseName: s.chineseName,
				studentId: s.studentId,
				status: s.status,
				house: s.house,
				classDisplay
			};
		});

		// Group by house
		const houses: Record<string, typeof studentsWithClass> = {
			Heracles: [],
			Wukong: [],
			Ixbalam: [],
			Setna: []
		};
		const orphaned: typeof studentsWithClass = [];

		for (const student of studentsWithClass) {
			if (student.house && houses[student.house]) {
				houses[student.house].push(student);
			} else {
				orphaned.push(student);
			}
		}

		// Sort each house's students by name
		for (const house of Object.keys(houses)) {
			houses[house].sort((a, b) => a.englishName.localeCompare(b.englishName));
		}
		orphaned.sort((a, b) => a.englishName.localeCompare(b.englishName));

		return { houses, orphaned };
	}
});

export const bulkAssignHouses = mutation({
	args: {
		assignments: v.array(
			v.object({
				englishName: v.string(),
				house: v.union(
					v.literal('Heracles'),
					v.literal('Wukong'),
					v.literal('Ixbalam'),
					v.literal('Setna')
				)
			})
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const allStudents = await ctx.db.query('students').collect();
		const studentsByName = new Map<string, (typeof allStudents)[number]>();
		for (const s of allStudents) {
			const key = s.englishName.trim().toLowerCase();
			if (studentsByName.has(key)) {
				console.warn(`Duplicate name: ${s.englishName}`);
			}
			studentsByName.set(key, s);
		}

		let assigned = 0;
		for (const { englishName, house } of args.assignments) {
			const student = studentsByName.get(englishName.trim().toLowerCase());
			if (!student) {
				console.warn(`Student not found: ${englishName}`);
				continue;
			}
			await ctx.db.patch(student._id, { house });
			assigned++;
		}

		return { assigned, total: args.assignments.length };
	}
});

export const assignHouse = mutation({
	args: {
		studentId: v.id('students'),
		house: v.optional(
			v.union(v.literal('Heracles'), v.literal('Wukong'), v.literal('Ixbalam'), v.literal('Setna'))
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const student = await ctx.db.get(args.studentId);
		if (!student) throw new Error('Student not found');

		await ctx.db.patch(args.studentId, { house: args.house });
	}
});

// Houses competition page - get statistics for all houses
export const getHouseStats = query({
	args: {
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return null;

		const HOUSES = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;

		// Fetch all students with houses
		const students = await ctx.db.query('students').collect();
		const studentsWithHouses = students.filter((s) => s.house && HOUSES.includes(s.house));
		const studentIds = studentsWithHouses.map((s) => s._id);

		// Get all evaluations for these students
		const allEvaluations = await ctx.db.query('evaluations').collect();
		const evaluations = allEvaluations.filter((e) => studentIds.includes(e.studentId));

		// Get all house events
		const allEvents = await ctx.db.query('house_events').collect();

		// Get all categories
		const categories = await ctx.db.query('point_categories').collect();
		const categoryMap = new Map(categories.map((c) => [c._id, c]));

		// Type for student points data
		type StudentPointsData = {
			studentId: string;
			house: string;
			englishName: string;
			chineseName: string;
			totalPoints: number;
			positivePoints: number;
			negativePoints: number;
			pointsByCategory: Record<string, number>;
			recentTotalPoints: number;
			recentPositivePoints: number;
			recentNegativePoints: number;
			recentPointsByCategory: Record<string, number>;
		};

		// Build student points map
		const studentPointsMap = new Map<string, StudentPointsData>();

		// Get timestamp for 30 days ago
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

		// Initialize students with houses
		for (const student of studentsWithHouses) {
			studentPointsMap.set(student._id, {
				studentId: student.studentId,
				house: student.house!,
				englishName: student.englishName,
				chineseName: student.chineseName,
				totalPoints: 0,
				positivePoints: 0,
				negativePoints: 0,
				pointsByCategory: {},
				recentTotalPoints: 0,
				recentPositivePoints: 0,
				recentNegativePoints: 0,
				recentPointsByCategory: {}
			});
		}

		// Process evaluations
		for (const eval_ of evaluations) {
			const studentData = studentPointsMap.get(eval_.studentId);
			if (!studentData) continue;

			const category = categoryMap.get(eval_.categoryId);
			const categoryName = category?.name || 'Unknown';

			// All-time stats
			if (!studentData.pointsByCategory[categoryName]) {
				studentData.pointsByCategory[categoryName] = 0;
			}
			studentData.pointsByCategory[categoryName] += eval_.value;
			studentData.totalPoints += eval_.value;

			if (eval_.value > 0) {
				studentData.positivePoints += eval_.value;
			} else if (eval_.value < 0) {
				studentData.negativePoints += eval_.value; // This is negative
			}

			// Recent stats (last 30 days)
			const isRecent = eval_.timestamp && eval_.timestamp >= thirtyDaysAgo;
			if (isRecent) {
				if (!studentData.recentPointsByCategory[categoryName]) {
					studentData.recentPointsByCategory[categoryName] = 0;
				}
				studentData.recentPointsByCategory[categoryName] += eval_.value;
				studentData.recentTotalPoints += eval_.value;

				if (eval_.value > 0) {
					studentData.recentPositivePoints += eval_.value;
				} else if (eval_.value < 0) {
					studentData.recentNegativePoints += eval_.value;
				}
			}
		}

		// Build house stats
		const houseStats: Record<
			string,
			{
				totalPoints: number;
				recentTotalPoints: number;
				studentCount: number;
				pointsByCategory: Record<string, number>;
				recentPointsByCategory: Record<string, number>;
				topContributors: { studentId: string; englishName: string; totalPoints: number }[];
				topContributorsRecent: { studentId: string; englishName: string; totalPoints: number }[];
				growthOpportunities: { studentId: string; englishName: string; pointsLost: number }[];
				growthOpportunitiesRecent: { studentId: string; englishName: string; pointsLost: number }[];
			}
		> = {};

		// Initialize houses
		for (const house of HOUSES) {
			houseStats[house] = {
				totalPoints: 0,
				recentTotalPoints: 0,
				studentCount: 0,
				pointsByCategory: {},
				recentPointsByCategory: {},
				topContributors: [],
				topContributorsRecent: [],
				growthOpportunities: [],
				growthOpportunitiesRecent: []
			};
		}

		// Aggregate by house
		for (const [, studentData] of studentPointsMap) {
			const stats = houseStats[studentData.house];
			if (!stats) continue;

			stats.totalPoints += studentData.totalPoints;
			stats.recentTotalPoints += studentData.recentTotalPoints;
			stats.studentCount++;

			// Aggregate points by category
			for (const [cat, points] of Object.entries(studentData.pointsByCategory)) {
				if (!stats.pointsByCategory[cat]) {
					stats.pointsByCategory[cat] = 0;
				}
				stats.pointsByCategory[cat] += points;
			}

			// Aggregate recent points by category
			for (const [cat, points] of Object.entries(studentData.recentPointsByCategory)) {
				if (!stats.recentPointsByCategory[cat]) {
					stats.recentPointsByCategory[cat] = 0;
				}
				stats.recentPointsByCategory[cat] += points;
			}
		}

		// Add house event points to house totals
		const EVENTS_CATEGORY = 'Events';
		for (const event of allEvents) {
			if (!event.housePoints) continue;

			for (const [houseName, points] of Object.entries(event.housePoints)) {
				const stats = houseStats[houseName];
				if (!stats) continue;

				stats.totalPoints += points;
				if (!stats.pointsByCategory[EVENTS_CATEGORY]) {
					stats.pointsByCategory[EVENTS_CATEGORY] = 0;
				}
				stats.pointsByCategory[EVENTS_CATEGORY] += points;

				// If the event overlaps the last 30 days, also count it as recent
				if (event.endDate >= thirtyDaysAgo) {
					stats.recentTotalPoints += points;
					if (!stats.recentPointsByCategory[EVENTS_CATEGORY]) {
						stats.recentPointsByCategory[EVENTS_CATEGORY] = 0;
					}
					stats.recentPointsByCategory[EVENTS_CATEGORY] += points;
				}
			}
		}

		// Get top contributors and growth opportunities per house
		const studentsByHouse: Record<string, StudentPointsData[]> = {
			Heracles: [],
			Wukong: [],
			Ixbalam: [],
			Setna: []
		};

		for (const [, studentData] of studentPointsMap) {
			if (studentsByHouse[studentData.house]) {
				studentsByHouse[studentData.house].push(studentData);
			}
		}

		for (const house of HOUSES) {
			const houseStudents = studentsByHouse[house];

			// Top contributors - All Time (by net points: positive - negative)
			houseStats[house].topContributors = houseStudents
				.filter((s) => s.totalPoints > 0)
				.sort((a, b) => b.totalPoints - a.totalPoints)
				.slice(0, 6)
				.map((s) => ({
					studentId: s.studentId,
					englishName: s.englishName,
					totalPoints: s.totalPoints
				}));

			// Top contributors - Most Recent (last 30 days)
			houseStats[house].topContributorsRecent = houseStudents
				.filter((s) => s.recentTotalPoints > 0)
				.sort((a, b) => b.recentTotalPoints - a.recentTotalPoints)
				.slice(0, 6)
				.map((s) => ({
					studentId: s.studentId,
					englishName: s.englishName,
					totalPoints: s.recentTotalPoints
				}));

			// Growth opportunities - All Time (students with negative points)
			houseStats[house].growthOpportunities = houseStudents
				.filter((s) => s.negativePoints < 0)
				.sort((a, b) => a.negativePoints - b.negativePoints)
				.slice(0, 6)
				.map((s) => ({
					studentId: s.studentId,
					englishName: s.englishName,
					pointsLost: Math.abs(s.negativePoints)
				}));

			// Growth opportunities - Most Recent (last 30 days)
			houseStats[house].growthOpportunitiesRecent = houseStudents
				.filter((s) => s.recentNegativePoints < 0)
				.sort((a, b) => a.recentNegativePoints - b.recentNegativePoints)
				.slice(0, 6)
				.map((s) => ({
					studentId: s.studentId,
					englishName: s.englishName,
					pointsLost: Math.abs(s.recentNegativePoints)
				}));
		}

		// Get all unique categories
		const allCategories = [...new Set(categories.map((c) => c.name))];

		// Calculate ranking
		const ranking = [...HOUSES].sort(
			(a, b) => houseStats[b].totalPoints - houseStats[a].totalPoints
		);

		// Calculate recent ranking (last 30 days)
		const recentRanking = [...HOUSES].sort(
			(a, b) => houseStats[b].recentTotalPoints - houseStats[a].recentTotalPoints
		);

		// Build final result
		const result = HOUSES.map((house) => ({
			house,
			totalPoints: houseStats[house].totalPoints,
			recentTotalPoints: houseStats[house].recentTotalPoints,
			studentCount: houseStats[house].studentCount,
			pointsByCategory: houseStats[house].pointsByCategory,
			recentPointsByCategory: houseStats[house].recentPointsByCategory,
			topContributors: houseStats[house].topContributors,
			topContributorsRecent: houseStats[house].topContributorsRecent,
			growthOpportunities: houseStats[house].growthOpportunities,
			growthOpportunitiesRecent: houseStats[house].growthOpportunitiesRecent,
			rank: ranking.indexOf(house) + 1,
			recentRank: recentRanking.indexOf(house) + 1
		}));

		return {
			houses: result,
			ranking,
			recentRanking,
			categories: allCategories
		};
	}
});
