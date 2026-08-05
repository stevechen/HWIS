import { query, mutation, type QueryCtx } from './_generated/server';
import { v, type GenericId } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';
import type { Doc, Id } from './_generated/dataModel';

async function collectBackupData(ctx: QueryCtx) {
	const students = await ctx.db.query('students').collect();
	const evaluations = await ctx.db.query('evaluations').collect();
	const users = await ctx.db.query('users').collect();
	const categories = await ctx.db.query('point_categories').collect();
	const classes = await ctx.db.query('classes').collect();

	return {
		exportedAt: new Date().toISOString(),
		students,
		evaluations,
		users,
		categories,
		classes,
		houseEvents: await ctx.db.query('house_events').collect()
	};
}

export const exportData = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		return await collectBackupData(ctx);
	}
});

export const exportDataForCron = query({
	args: { cronSecret: v.string() },
	handler: async (ctx, args) => {
		const expectedSecret = process.env.CRON_SECRET;
		if (!expectedSecret || args.cronSecret !== expectedSecret) {
			throw new Error('Unauthorized');
		}
		return await collectBackupData(ctx);
	}
});

export const createBackup = mutation({
	args: { e2eTag: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const students = await ctx.db.query('students').collect();
		const evaluations = await ctx.db.query('evaluations').collect();
		const users = await ctx.db.query('users').collect();
		const categories = await ctx.db.query('point_categories').collect();
		const classes = await ctx.db.query('classes').collect();
		const houseEvents = await ctx.db.query('house_events').collect();

		const backup = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			students,
			evaluations,
			users,
			categories,
			classes,
			houseEvents
		};

		const backupId = await ctx.db.insert('backups', {
			filename: `backup-${Date.now()}.json`,
			data: backup as object,
			createdAt: Date.now(),
			e2eTag: args.e2eTag
		});

		return {
			backupId,
			message: `Created backup with ${students.length} students, ${evaluations.length} evaluations, ${classes.length} classes`
		};
	}
});

interface BackupRecord {
	_id: GenericId<'backups'>;
	_creationTime: number;
	filename: string;
	data: object;
	createdAt: number;
}

type BackupPayload = {
	students: Array<
		Pick<
			Doc<'students'>,
			'_id' | 'englishName' | 'chineseName' | 'studentId' | 'classId' | 'status' | 'note' | 'house'
		>
	>;
	evaluations: Array<
		Pick<
			Doc<'evaluations'>,
			| '_id'
			| 'studentId'
			| 'teacherId'
			| 'value'
			| 'categoryId'
			| 'details'
			| 'timestamp'
			| 'semesterId'
		>
	>;
	users: Array<Pick<Doc<'users'>, '_id' | 'authId' | 'name' | 'role' | 'status'>>;
	categories: Array<
		Pick<
			Doc<'point_categories'>,
			'_id' | 'name' | 'meritCriteria' | 'demeritCriteria' | 'casAlignment'
		>
	>;
	classes: Array<Pick<Doc<'classes'>, '_id' | 'grade' | 'class' | 'homeroomTeacherId'>>;
	houseEvents: Array<
		Pick<Doc<'house_events'>, 'title' | 'startDate' | 'endDate' | 'housePoints' | 'e2eTag'>
	>;
};

export const restoreFromBackup = mutation({
	args: {
		backupId: v.id('backups')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const backup = (await ctx.db.get(args.backupId)) as BackupRecord | null;
		if (!backup) throw new Error('Backup not found');

		const data = backup.data as BackupPayload;

		const existingStudents = await ctx.db.query('students').collect();
		const existingEvaluations = await ctx.db.query('evaluations').collect();
		const existingCategories = await ctx.db.query('point_categories').collect();
		const existingClasses = await ctx.db.query('classes').collect();
		const existingHouseEvents = await ctx.db.query('house_events').collect();

		for (const s of existingStudents) await ctx.db.delete(s._id);
		for (const e of existingEvaluations) await ctx.db.delete(e._id);
		for (const c of existingCategories) await ctx.db.delete(c._id);
		for (const c of existingClasses) await ctx.db.delete(c._id);
		for (const e of existingHouseEvents) await ctx.db.delete(e._id);

		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			if (
				log.targetTable === 'students' ||
				log.targetTable === 'evaluations' ||
				log.targetTable === 'classes' ||
				log.targetTable === 'house_events' ||
				log.targetTable === 'point_categories'
			) {
				await ctx.db.delete(log._id);
			}
		}

		const classIdMapping = new Map<string, Id<'classes'>>();
		for (const cls of data.classes) {
			const existingClass = await ctx.db
				.query('classes')
				.withIndex('by_grade_class', (q) => q.eq('grade', cls.grade).eq('class', cls.class))
				.first();

			if (existingClass) {
				classIdMapping.set(cls._id, existingClass._id);
			} else {
				const newClassId = await ctx.db.insert('classes', {
					grade: cls.grade,
					class: cls.class,
					homeroomTeacherId: cls.homeroomTeacherId ?? undefined
				});
				classIdMapping.set(cls._id, newClassId);
			}
		}

		const userIdMapping = new Map<string, Id<'users'>>();
		for (const user of data.users) {
			const existingUser = user.authId
				? await ctx.db
						.query('users')
						.withIndex('by_authId', (q) => q.eq('authId', user.authId))
						.first()
				: null;

			if (existingUser) {
				await ctx.db.patch(existingUser._id, {
					name: user.name ?? undefined,
					role: user.role ?? existingUser.role,
					status: user.status ?? existingUser.status
				});
				userIdMapping.set(user._id, existingUser._id);
			} else {
				const newUserId = await ctx.db.insert('users', {
					authId: user.authId ?? undefined,
					name: user.name ?? undefined,
					role: user.role ?? 'teacher',
					status: user.status ?? 'active'
				});
				userIdMapping.set(user._id, newUserId);
			}
		}

		const categoryIdMapping = new Map<string, Id<'point_categories'>>();
		for (const category of data.categories) {
			const existingCategory = await ctx.db
				.query('point_categories')
				.filter((q) => q.eq(q.field('name'), category.name))
				.first();
			if (existingCategory) {
				await ctx.db.patch(existingCategory._id, {
					meritCriteria: category.meritCriteria,
					demeritCriteria: category.demeritCriteria,
					casAlignment: category.casAlignment
				});
				categoryIdMapping.set(category._id, existingCategory._id);
			} else {
				const newCategoryId = await ctx.db.insert('point_categories', {
					name: category.name,
					meritCriteria: category.meritCriteria,
					demeritCriteria: category.demeritCriteria,
					casAlignment: category.casAlignment
				});
				categoryIdMapping.set(category._id, newCategoryId);
			}
		}

		const studentIdMapping = new Map<string, Id<'students'>>();
		for (const student of data.students) {
			const newClassId = classIdMapping.get(student.classId);
			if (!newClassId) {
				throw new Error(`Class not found for student ${student.studentId}: ${student.classId}`);
			}

			const newStudentId = await ctx.db.insert('students', {
				englishName: student.englishName,
				chineseName: student.chineseName,
				studentId: student.studentId,
				classId: newClassId,
				status: student.status,
				note: student.note ?? '',
				house: student.house
			});
			studentIdMapping.set(student._id, newStudentId);
		}

		const skippedEvaluations: string[] = [];
		for (const evaluation of data.evaluations) {
			const newStudentId = studentIdMapping.get(evaluation.studentId);
			if (!newStudentId) {
				skippedEvaluations.push(
					`Evaluation ${evaluation._id}: student not found (${evaluation.studentId})`
				);
				continue;
			}

			const newTeacherId = userIdMapping.get(evaluation.teacherId);
			if (!newTeacherId) {
				skippedEvaluations.push(
					`Evaluation ${evaluation._id}: teacher not found (${evaluation.teacherId})`
				);
				continue;
			}

			const newCategoryId = categoryIdMapping.get(evaluation.categoryId);
			if (!newCategoryId) {
				skippedEvaluations.push(
					`Evaluation ${evaluation._id}: category not found (${evaluation.categoryId})`
				);
				continue;
			}

			await ctx.db.insert('evaluations', {
				studentId: newStudentId,
				teacherId: newTeacherId,
				value: evaluation.value,
				categoryId: newCategoryId,
				details: evaluation.details,
				timestamp: evaluation.timestamp,
				semesterId: evaluation.semesterId
			});
		}

		if (data.houseEvents) {
			for (const event of data.houseEvents) {
				await ctx.db.insert('house_events', {
					title: event.title,
					startDate: event.startDate,
					endDate: event.endDate,
					housePoints: event.housePoints,
					e2eTag: event.e2eTag
				});
			}
		}

		return {
			message: `Restored data: ${data.students.length} students, ${data.evaluations.length - skippedEvaluations.length} evaluations (${skippedEvaluations.length} skipped), ${data.users.length} users, ${data.categories.length} categories, ${data.classes.length} classes`,
			skippedEvaluations: skippedEvaluations.length > 0 ? skippedEvaluations : undefined
		};
	}
});

export const restoreFromBackupPayload = mutation({
	args: {
		backupData: v.any()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const data = args.backupData as BackupPayload;

		const existingStudents = await ctx.db.query('students').collect();
		const existingEvaluations = await ctx.db.query('evaluations').collect();
		const existingCategories = await ctx.db.query('point_categories').collect();
		const existingClasses = await ctx.db.query('classes').collect();
		const existingHouseEvents = await ctx.db.query('house_events').collect();

		for (const s of existingStudents) await ctx.db.delete(s._id);
		for (const e of existingEvaluations) await ctx.db.delete(e._id);
		for (const c of existingCategories) await ctx.db.delete(c._id);
		for (const c of existingClasses) await ctx.db.delete(c._id);
		for (const e of existingHouseEvents) await ctx.db.delete(e._id);

		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			if (
				log.targetTable === 'students' ||
				log.targetTable === 'evaluations' ||
				log.targetTable === 'classes' ||
				log.targetTable === 'house_events' ||
				log.targetTable === 'point_categories'
			) {
				await ctx.db.delete(log._id);
			}
		}

		const classIdMapping = new Map<string, Id<'classes'>>();
		for (const cls of data.classes) {
			const existingClass = await ctx.db
				.query('classes')
				.withIndex('by_grade_class', (q) => q.eq('grade', cls.grade).eq('class', cls.class))
				.first();

			if (existingClass) {
				classIdMapping.set(cls._id, existingClass._id);
			} else {
				const newClassId = await ctx.db.insert('classes', {
					grade: cls.grade,
					class: cls.class,
					homeroomTeacherId: cls.homeroomTeacherId ?? undefined
				});
				classIdMapping.set(cls._id, newClassId);
			}
		}

		const userIdMapping = new Map<string, Id<'users'>>();
		for (const user of data.users) {
			const existingUser = user.authId
				? await ctx.db
						.query('users')
						.withIndex('by_authId', (q) => q.eq('authId', user.authId))
						.first()
				: null;

			if (existingUser) {
				await ctx.db.patch(existingUser._id, {
					name: user.name ?? undefined,
					role: user.role ?? existingUser.role,
					status: user.status ?? existingUser.status
				});
				userIdMapping.set(user._id, existingUser._id);
			} else {
				const newUserId = await ctx.db.insert('users', {
					authId: user.authId ?? undefined,
					name: user.name ?? undefined,
					role: user.role ?? 'teacher',
					status: user.status ?? 'active'
				});
				userIdMapping.set(user._id, newUserId);
			}
		}

		const categoryIdMapping = new Map<string, Id<'point_categories'>>();
		for (const category of data.categories) {
			const existingCategory = await ctx.db
				.query('point_categories')
				.filter((q) => q.eq(q.field('name'), category.name))
				.first();
			if (existingCategory) {
				categoryIdMapping.set(category._id, existingCategory._id);
			} else {
				const newCategoryId = await ctx.db.insert('point_categories', {
					name: category.name,
					meritCriteria: category.meritCriteria,
					demeritCriteria: category.demeritCriteria,
					casAlignment: category.casAlignment
				});
				categoryIdMapping.set(category._id, newCategoryId);
			}
		}

		const studentIdMapping = new Map<string, Id<'students'>>();
		for (const student of data.students) {
			const newClassId = classIdMapping.get(student.classId);
			if (!newClassId) {
				throw new Error(`Class not found for student ${student.studentId}: ${student.classId}`);
			}

			const newStudentId = await ctx.db.insert('students', {
				englishName: student.englishName,
				chineseName: student.chineseName,
				studentId: student.studentId,
				classId: newClassId,
				status: student.status,
				note: student.note ?? '',
				house: student.house
			});
			studentIdMapping.set(student._id, newStudentId);
		}

		const skippedEvaluations: string[] = [];
		for (const evaluation of data.evaluations) {
			const newStudentId = studentIdMapping.get(evaluation.studentId);
			if (!newStudentId) {
				skippedEvaluations.push(
					`Evaluation ${evaluation._id}: student not found (${evaluation.studentId})`
				);
				continue;
			}

			const newTeacherId = userIdMapping.get(evaluation.teacherId);
			if (!newTeacherId) {
				skippedEvaluations.push(
					`Evaluation ${evaluation._id}: teacher not found (${evaluation.teacherId})`
				);
				continue;
			}

			const newCategoryId = categoryIdMapping.get(evaluation.categoryId);
			if (!newCategoryId) {
				skippedEvaluations.push(
					`Evaluation ${evaluation._id}: category not found (${evaluation.categoryId})`
				);
				continue;
			}

			await ctx.db.insert('evaluations', {
				studentId: newStudentId,
				teacherId: newTeacherId,
				value: evaluation.value,
				categoryId: newCategoryId,
				details: evaluation.details,
				timestamp: evaluation.timestamp,
				semesterId: evaluation.semesterId
			});
		}

		if (data.houseEvents) {
			for (const event of data.houseEvents) {
				await ctx.db.insert('house_events', {
					title: event.title,
					startDate: event.startDate,
					endDate: event.endDate,
					housePoints: event.housePoints ?? undefined,
					e2eTag: event.e2eTag
				});
			}
		}

		return {
			message: `Restored data: ${data.students.length} students, ${data.evaluations.length - skippedEvaluations.length} evaluations (${skippedEvaluations.length} skipped), ${data.users.length} users, ${data.categories.length} categories, ${data.classes.length} classes`,
			skippedEvaluations: skippedEvaluations.length > 0 ? skippedEvaluations : undefined
		};
	}
});

export const clearAllData = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const students = await ctx.db.query('students').collect();
		const evaluations = await ctx.db.query('evaluations').collect();
		const categories = await ctx.db.query('point_categories').collect();
		const classes = await ctx.db.query('classes').collect();
		const houseEvents = await ctx.db.query('house_events').collect();

		for (const student of students) await ctx.db.delete(student._id);
		for (const evaluation of evaluations) await ctx.db.delete(evaluation._id);
		for (const category of categories) await ctx.db.delete(category._id);
		for (const cls of classes) await ctx.db.delete(cls._id);
		for (const event of houseEvents) await ctx.db.delete(event._id);

		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const log of auditLogs) {
			if (
				log.targetTable === 'students' ||
				log.targetTable === 'evaluations' ||
				log.targetTable === 'classes' ||
				log.targetTable === 'house_events'
			) {
				await ctx.db.delete(log._id);
			}
		}

		return { message: `Cleared data` };
	}
});

export const listBackups = query({
	args: {
		_trigger: v.optional(v.number())
	},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const backups = await ctx.db.query('backups').collect();
		return backups.sort((a, b) => b.createdAt - a.createdAt);
	}
});

export const deleteBackup = mutation({
	args: {
		backupId: v.id('backups')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		await ctx.db.delete(args.backupId);
		return { message: 'Backup deleted' };
	}
});

export const clearEvaluations = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const evaluations = await ctx.db.query('evaluations').collect();
		for (const evaluation of evaluations) {
			await ctx.db.delete(evaluation._id);
		}

		const auditLogs = await ctx.db.query('audit_logs').collect();
		let auditLogsCleared = 0;
		for (const log of auditLogs) {
			if (log.targetTable === 'evaluations') {
				await ctx.db.delete(log._id);
				auditLogsCleared++;
			}
		}

		return {
			message: `Cleared ${evaluations.length} evaluations and ${auditLogsCleared} audit logs`
		};
	}
});

export const advanceGradesAndClearEvaluations = mutation({
	args: { e2eTag: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const students = await ctx.db.query('students').collect();
		const evaluations = await ctx.db.query('evaluations').collect();
		const users = await ctx.db.query('users').collect();
		const categories = await ctx.db.query('point_categories').collect();
		const classes = await ctx.db.query('classes').collect();
		const houseEvents = await ctx.db.query('house_events').collect();

		const backup = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			students,
			evaluations,
			users,
			categories,
			classes,
			houseEvents
		};

		await ctx.db.insert('backups', {
			filename: `backup-${Date.now()}.json`,
			data: backup as object,
			createdAt: Date.now(),
			e2eTag: args.e2eTag
		});

		const allEvaluations = await ctx.db.query('evaluations').collect();
		for (const evaluation of allEvaluations) {
			await ctx.db.delete(evaluation._id);
		}

		const auditLogs = await ctx.db.query('audit_logs').collect();
		let auditLogsCleared = 0;
		for (const log of auditLogs) {
			if (log.targetTable === 'evaluations') {
				await ctx.db.delete(log._id);
				auditLogsCleared++;
			}
		}

		// Delete all house events for the new academic year
		const allHouseEvents = await ctx.db.query('house_events').collect();
		for (const event of allHouseEvents) {
			await ctx.db.delete(event._id);
		}

		// Get classes to determine grade 12 students
		const allClasses = await ctx.db.query('classes').collect();
		const classMap = new Map(allClasses.map((c) => [c._id, c]));

		const allStudents = await ctx.db.query('students').collect();
		const grade12Students = allStudents.filter((s) => {
			if (s.classId) {
				const cls = classMap.get(s.classId);
				return cls && cls.grade === 12;
			}
			return false;
		});
		for (const student of grade12Students) {
			await ctx.db.delete(student._id);
		}

		const notEnrolledStudents = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Not Enrolled'))
			.collect();
		for (const student of notEnrolledStudents) {
			await ctx.db.delete(student._id);
		}

		const enrolledStudents = await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('status'), 'Enrolled'))
			.collect();

		// Lookup of (grade:className) -> classId from INITIAL classes.
		// We reuse existing classes; if a class doesn't exist at the next grade,
		// we create it ONCE and reuse it for all students from that section.
		const classLookup = new Map<string, Id<'classes'>>();
		for (const c of allClasses) {
			classLookup.set(`${c.grade}:${c.class}`, c._id);
		}

		let gradesAdvanced = 0;
		for (const student of enrolledStudents) {
			if (student.classId) {
				const cls = classMap.get(student.classId);
				if (cls && cls.grade >= 7 && cls.grade <= 11) {
					const nextGrade = cls.grade + 1;
					const nextClassName = cls.class;
					const key = `${nextGrade}:${nextClassName}`;
					let nextClassId = classLookup.get(key);
					if (!nextClassId) {
						nextClassId = await ctx.db.insert('classes', {
							grade: nextGrade,
							class: nextClassName
						});
						classLookup.set(key, nextClassId);
					}
					await ctx.db.patch(student._id, { classId: nextClassId });
					gradesAdvanced++;
				}
			}
		}

		// Clear homeroom teacher assignments on all classes — they change yearly
		// and admins prefer to reassign them each year after grade migration.
		const allClassesAfterAdvance = await ctx.db.query('classes').collect();
		for (const cls of allClassesAfterAdvance) {
			if (cls.homeroomTeacherId !== undefined) {
				await ctx.db.patch(cls._id, { homeroomTeacherId: undefined });
			}
		}

		// Remove empty classes (no student references them), but never remove
		// IB classes at grades 11 and 12 — those are kept for future planning.
		const remainingStudents = await ctx.db.query('students').collect();
		const usedClassIds = new Set(remainingStudents.map((s) => s.classId));
		const postAdvanceClasses = await ctx.db.query('classes').collect();
		let emptyClassesDeleted = 0;
		for (const cls of postAdvanceClasses) {
			if (usedClassIds.has(cls._id)) continue;
			if (cls.class === 'IB' && (cls.grade === 11 || cls.grade === 12)) continue;
			await ctx.db.delete(cls._id);
			emptyClassesDeleted++;
		}

		return {
			message: `Advanced grades for ${gradesAdvanced} students, deleted ${grade12Students.length} grade 12 students, deleted ${notEnrolledStudents.length} not enrolled students, cleared ${allEvaluations.length} evaluations and ${auditLogsCleared} audit logs, deleted ${allHouseEvents.length} events, deleted ${emptyClassesDeleted} empty classes`
		};
	}
});
