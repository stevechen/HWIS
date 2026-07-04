import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminRole, getAuthenticatedUser } from './auth';
import type { Id } from './_generated/dataModel';

// Helper function to get display name for a class
// "1" -> "7-1", "IB" -> "7-IB"
export function getDisplayName(grade: number, className: string): string {
	if (className === 'IB') return `${grade}-IB`;
	return `${grade}-${className}`;
}

// Helper to check if a class is protected (1 or IB)
export function isProtectedClass(className: string): boolean {
	return className === '1' || className === 'IB';
}

export const list = query({
	args: {
		grade: v.optional(v.number()),
		includeStudents: v.optional(v.boolean()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return [];

		let classes;
		if (args.grade !== undefined) {
			classes = await ctx.db
				.query('classes')
				.withIndex('by_grade_class', (q) => q.eq('grade', args.grade as number))
				.collect();
		} else {
			classes = await ctx.db.query('classes').take(100);
		}

		// Enrich with teacher names and student counts
		const teacherIds = [...new Set(classes.map((c) => c.homeroomTeacherId).filter(Boolean))];
		const teachers = await Promise.all(teacherIds.map((id) => (id ? ctx.db.get(id) : null)));
		const teacherMap = new Map(
			teachers.filter(Boolean).map((t) => [t!._id, t!.name || 'Unknown Teacher'])
		);

		// Get all students grouped by classId
		const studentsByClass: Map<
			Id<'classes'>,
			{
				_id: Id<'students'>;
				name: string;
				studentId: string;
				status: 'Enrolled' | 'Not Enrolled';
			}[]
		> = new Map();
		if (args.includeStudents) {
			await requireAdminRole(ctx, args.testToken);
			const allStudents = await ctx.db.query('students').take(500);
			for (const student of allStudents) {
				if (student.classId) {
					if (!studentsByClass.has(student.classId)) {
						studentsByClass.set(student.classId, []);
					}
					studentsByClass.get(student.classId)!.push({
						_id: student._id,
						name: student.englishName,
						studentId: student.studentId,
						status: student.status
					});
				}
			}
		}

		return classes
			.map((c) => ({
				...c,
				homeroomTeacherName: c.homeroomTeacherId
					? teacherMap.get(c.homeroomTeacherId) || 'Unknown Teacher'
					: null,
				studentCount: studentsByClass.get(c._id)?.length || 0,
				students: studentsByClass.get(c._id) || []
			}))
			.sort((a, b) => {
				if (a.grade !== b.grade) return a.grade - b.grade;
				return a.class.localeCompare(b.class);
			});
	}
});

export const getStudentCount = query({
	args: {
		classId: v.id('classes'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const classRecord = await ctx.db.get(args.classId);
		if (!classRecord) return { count: 0, classInfo: null };

		// Use classId index to get students
		const students = await ctx.db
			.query('students')
			.withIndex('by_classId', (q) => q.eq('classId', args.classId))
			.collect();

		return {
			count: students.length,
			classInfo: {
				grade: classRecord.grade,
				class: classRecord.class
			}
		};
	}
});

export const getByGrade = query({
	args: {
		grade: v.number(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		return await ctx.db
			.query('classes')
			.withIndex('by_grade_class', (q) => q.eq('grade', args.grade))
			.collect();
	}
});

export const getByGradeAndClass = query({
	args: {
		grade: v.number(),
		class: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		return await ctx.db
			.query('classes')
			.withIndex('by_grade_class', (q) => q.eq('grade', args.grade).eq('class', args.class))
			.first();
	}
});

export const getByTeacher = query({
	args: {
		teacherId: v.id('users'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const classRecord = await ctx.db
			.query('classes')
			.withIndex('by_teacher', (q) => q.eq('homeroomTeacherId', args.teacherId))
			.first();

		if (!classRecord) return null;

		// Get teacher name
		const teacher = await ctx.db.get(args.teacherId);

		return {
			...classRecord,
			homeroomTeacherName: teacher?.name || 'Unknown Teacher'
		};
	}
});

export const create = mutation({
	args: {
		grade: v.number(),
		class: v.optional(v.string()), // Optional - if not provided, auto-increment
		homeroomTeacherId: v.optional(v.id('users')),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		if (args.grade < 7 || args.grade > 12) {
			throw new Error('Grade must be between 7 and 12');
		}

		let className = args.class;

		// If no class name provided, find the lowest available number
		if (!className) {
			const existingClasses = await ctx.db
				.query('classes')
				.withIndex('by_grade_class', (q) => q.eq('grade', args.grade))
				.collect();

			// Get all numeric class names (exclude "default" and "IB")
			const numericClasses = existingClasses
				.map((c) => c.class)
				.filter((c) => c !== 'default' && c !== 'IB')
				.map((c) => parseInt(c, 10))
				.filter((n) => !isNaN(n))
				.sort((a, b) => a - b);

			// Find the lowest missing number starting from 1
			let nextNumber = 1;
			for (const num of numericClasses) {
				if (num === nextNumber) {
					nextNumber++;
				} else if (num > nextNumber) {
					break;
				}
			}
			className = nextNumber.toString();
		}

		// Check for duplicate (same grade and class)
		const existing = await ctx.db
			.query('classes')
			.withIndex('by_grade_class', (q) => q.eq('grade', args.grade).eq('class', className))
			.first();

		if (existing) {
			throw new Error(`Class ${getDisplayName(args.grade, className)} already exists`);
		}

		const id = await ctx.db.insert('classes', {
			grade: args.grade,
			class: className,
			homeroomTeacherId: args.homeroomTeacherId ?? undefined
		});

		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('classes'),
		homeroomTeacherId: v.optional(v.id('users')),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error('Class not found');
		}

		await ctx.db.patch(args.id, {
			homeroomTeacherId: (args.homeroomTeacherId === null ? undefined : args.homeroomTeacherId) as
				| Id<'users'>
				| undefined
		});
	}
});

// Rename a class and migrate all students to the new class name
export const rename = mutation({
	args: {
		id: v.id('classes'),
		newClass: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error('Class not found');
		}

		const grade = existing.grade;

		// Check for duplicate in the same grade
		const duplicate = await ctx.db
			.query('classes')
			.withIndex('by_grade_class', (q) => q.eq('grade', grade).eq('class', args.newClass))
			.first();

		if (duplicate && duplicate._id !== args.id) {
			throw new Error(`Class ${grade}-${args.newClass} already exists`);
		}

		// Students are linked via classId, so renaming the class automatically updates all students
		// Just update the class record
		await ctx.db.patch(args.id, { class: args.newClass });

		return {
			studentsUpdated: 0 // No longer needed - students reference by ID
		};
	}
});

export const remove = mutation({
	args: {
		id: v.id('classes'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const classRecord = await ctx.db.get(args.id);
		if (!classRecord) {
			throw new Error('Class not found');
		}

		// Check if this is a protected class (1 or IB) - cannot be deleted
		if (isProtectedClass(classRecord.class)) {
			throw new Error(
				`Cannot delete protected class ${getDisplayName(classRecord.grade, classRecord.class)}: ${classRecord.class === '1' ? '1' : 'IB'} classes are required`
			);
		}

		// Check if any students are assigned to this class using classId index
		const studentsInClass = await ctx.db
			.query('students')
			.withIndex('by_classId', (q) => q.eq('classId', args.id))
			.take(1);

		if (studentsInClass.length > 0) {
			throw new Error(
				`Cannot delete class ${getDisplayName(classRecord.grade, classRecord.class)}: students are assigned to this class`
			);
		}

		await ctx.db.delete(args.id);
	}
});

export const seedDefaultClasses = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user || (user.role !== 'admin' && user.role !== 'super')) {
			return { message: 'Not authenticated, skipping seed', created: [] };
		}

		const grades = [7, 8, 9, 10, 11, 12];
		const created = [];

		for (const grade of grades) {
			// Create "1" class (displayed as "7-1", "8-1", etc.)
			const existing1 = await ctx.db
				.query('classes')
				.withIndex('by_grade_class', (q) => q.eq('grade', grade).eq('class', '1'))
				.first();

			if (!existing1) {
				await ctx.db.insert('classes', {
					grade,
					class: '1',
					homeroomTeacherId: undefined
				});
				created.push(`${grade}-1`);
			}

			// Create IB class (displayed as "7-IB", "8-IB", etc.)
			const existingIB = await ctx.db
				.query('classes')
				.withIndex('by_grade_class', (q) => q.eq('grade', grade).eq('class', 'IB'))
				.first();

			if (!existingIB) {
				await ctx.db.insert('classes', {
					grade,
					class: 'IB',
					homeroomTeacherId: undefined
				});
				created.push(`${grade}-IB`);
			}
		}

		return {
			message: `Created ${created.length} default classes`,
			classes: created
		};
	}
});

export const getById = query({
	args: {
		id: v.id('classes'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const classRecord = await ctx.db.get(args.id);
		if (!classRecord) return null;

		// Get teacher name if exists
		let teacherName = null;
		if (classRecord.homeroomTeacherId) {
			const teacher = await ctx.db.get(classRecord.homeroomTeacherId);
			teacherName = teacher?.name || 'Unknown Teacher';
		}

		return {
			...classRecord,
			homeroomTeacherName: teacherName
		};
	}
});

// Assign a student to this class (for yearly migration or mid-year transfers)
export const assignStudent = mutation({
	args: {
		studentId: v.id('students'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const student = await ctx.db.get(args.studentId);
		if (!student) {
			throw new Error('Student not found');
		}

		// Find the class for this student's grade
		// For now, we need the classId to be passed - this mutation is called from the class page
		// Actually, let's not use this - students should be assigned via the student edit form
		// This mutation is kept for future use if needed
		throw new Error('Use student edit form to assign class');
	}
});

// Get all students in a class (useful for checking class assignments)
export const getStudents = query({
	args: {
		id: v.id('classes'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const classRecord = await ctx.db.get(args.id);
		if (!classRecord) return [];

		// Get students by classId
		const students = await ctx.db
			.query('students')
			.withIndex('by_classId', (q) => q.eq('classId', args.id))
			.collect();

		return students;
	}
});

// Move a student to a different class (same grade only)
export const moveStudent = mutation({
	args: {
		studentId: v.id('students'),
		targetClassId: v.id('classes'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		// Get student
		const student = await ctx.db.get(args.studentId);
		if (!student) {
			throw new Error('Student not found');
		}

		// Get target class
		const targetClass = await ctx.db.get(args.targetClassId);
		if (!targetClass) {
			throw new Error('Class not found');
		}

		// Get current class to check grade
		const currentClass = await ctx.db.get(student.classId);
		if (!currentClass) {
			throw new Error('Current class not found');
		}

		// Only allow moving within same grade
		if (currentClass.grade !== targetClass.grade) {
			throw new Error('Cannot move student to different grade');
		}

		// Update student's classId
		await ctx.db.patch(args.studentId, {
			classId: args.targetClassId
		});

		return {
			success: true,
			studentId: args.studentId,
			fromClassId: student.classId,
			toClassId: args.targetClassId
		};
	}
});
