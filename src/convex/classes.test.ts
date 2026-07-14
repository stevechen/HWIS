import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

describe('classes', () => {
	describe('create', () => {
		it('should create a new class successfully', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			expect(classId).toBeDefined();

			const createdClass = await t.query(api.classes.getById, {
				id: classId
			});

			expect(createdClass).toMatchObject({
				grade: 7,
				class: '1'
			});
			expect(createdClass?.homeroomTeacherId).toBeUndefined();
		});

		it('should prevent creating duplicate classes (same grade + class)', async () => {
			const t = convexTest(schema, modules);

			// Create first class
			await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			// Try to create duplicate - should throw error
			await expect(
				t.mutation(api.classes.create, {
					grade: 7,
					class: '1'
				})
			).rejects.toThrow('Class 7-1 already exists');
		});

		it('should allow same class name in different grades', async () => {
			const t = convexTest(schema, modules);

			// Create class in grade 7
			const class1Id = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			// Create same class name in grade 8 - should succeed
			const class2Id = await t.mutation(api.classes.create, {
				grade: 8,
				class: '1'
			});

			expect(class1Id).not.toBe(class2Id);

			// Verify both exist
			const classes = await t.query(api.classes.list, {});

			expect(classes).toHaveLength(2);
			expect(
				classes.map((c: { grade: number; class: string }) => ({ grade: c.grade, class: c.class }))
			).toContainEqual({ grade: 7, class: '1' });
			expect(
				classes.map((c: { grade: number; class: string }) => ({ grade: c.grade, class: c.class }))
			).toContainEqual({ grade: 8, class: '1' });
		});

		it('should reject invalid grade values', async () => {
			const t = convexTest(schema, modules);

			await expect(
				t.mutation(api.classes.create, {
					grade: 6,
					class: '1'
				})
			).rejects.toThrow('Grade must be between 7 and 12');

			await expect(
				t.mutation(api.classes.create, {
					grade: 13,
					class: '1'
				})
			).rejects.toThrow('Grade must be between 7 and 12');
		});

		it('should create class with homeroom teacher', async () => {
			const t = convexTest(schema, modules);

			// Create a teacher first
			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-1',
					name: 'Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			const classId = await t.mutation(api.classes.create, {
				grade: 9,
				class: '2',
				homeroomTeacherId: teacherId
			});

			const createdClass = await t.query(api.classes.getById, {
				id: classId
			});

			expect(createdClass).toMatchObject({
				grade: 9,
				class: '2',
				homeroomTeacherId: teacherId,
				homeroomTeacherName: 'Test Teacher'
			});
		});
	});

	describe('list', () => {
		it('should list all classes sorted by grade then class', async () => {
			const t = convexTest(schema, modules);

			// Create classes in non-sorted order
			await t.mutation(api.classes.create, {
				grade: 10,
				class: '2'
			});
			await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});
			await t.mutation(api.classes.create, {
				grade: 10,
				class: '1'
			});

			const classes = await t.query(api.classes.list, {});

			expect(classes).toHaveLength(3);
			expect(classes[0]).toMatchObject({ grade: 7, class: '1' });
			expect(classes[1]).toMatchObject({ grade: 10, class: '1' });
			expect(classes[2]).toMatchObject({ grade: 10, class: '2' });
		});

		it('should filter classes by grade', async () => {
			const t = convexTest(schema, modules);

			await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});
			await t.mutation(api.classes.create, {
				grade: 8,
				class: '1'
			});
			await t.mutation(api.classes.create, {
				grade: 7,
				class: '2'
			});

			const grade7Classes = await t.query(api.classes.list, {
				grade: 7
			});

			expect(grade7Classes).toHaveLength(2);
			expect(grade7Classes.every((c: { grade: number }) => c.grade === 7)).toBe(true);
		});
	});

	describe('rename', () => {
		it('should rename a class successfully', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			await t.mutation(api.classes.rename, {
				id: classId,
				newClass: 'A'
			});

			const updatedClass = await t.query(api.classes.getById, {
				id: classId
			});

			expect(updatedClass).toMatchObject({
				grade: 7,
				class: 'A'
			});
		});

		it('should prevent renaming to an existing class name in same grade', async () => {
			const t = convexTest(schema, modules);

			// Create two classes
			const classId1 = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});
			await t.mutation(api.classes.create, {
				grade: 7,
				class: '2'
			});

			// Try to rename class 1 to class 2
			await expect(
				t.mutation(api.classes.rename, {
					id: classId1,
					newClass: '2'
				})
			).rejects.toThrow('Class 7-2 already exists');
		});

		it('should allow renaming to same class name in different grade', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});
			await t.mutation(api.classes.create, {
				grade: 8,
				class: 'A'
			});

			// Rename 7-1 to 7-A (which exists in grade 8, but that's ok)
			await t.mutation(api.classes.rename, {
				id: classId,
				newClass: 'A'
			});

			const updatedClass = await t.query(api.classes.getById, {
				id: classId
			});

			expect(updatedClass?.class).toBe('A');
		});
	});

	describe('remove', () => {
		it('should delete a class with no students', async () => {
			const t = convexTest(schema, modules);

			// Use non-protected class name "A" for testing deletion
			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});

			await t.mutation(api.classes.remove, {
				id: classId
			});

			const deletedClass = await t.query(api.classes.getById, {
				id: classId
			});

			expect(deletedClass).toBeNull();
		});

		it('should prevent deleting a class with enrolled students', async () => {
			const t = convexTest(schema, modules);

			// Use non-protected class name "A" for testing deletion
			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});

			// Create a student in this class
			await t.run(async (ctx) => {
				await ctx.db.insert('students', {
					englishName: 'Test Student',
					chineseName: '測試學生',
					studentId: '1234567',
					classId: classId,
					status: 'Enrolled'
				});
			});

			await expect(
				t.mutation(api.classes.remove, {
					id: classId
				})
			).rejects.toThrow(/Cannot delete class.*students are assigned/);
		});
	});

	describe('getByGradeAndClass', () => {
		it('should find class by grade and class name', async () => {
			const t = convexTest(schema, modules);

			await t.mutation(api.classes.create, {
				grade: 9,
				class: '3'
			});

			const found = await t.query(api.classes.getByGradeAndClass, {
				grade: 9,
				class: '3'
			});

			expect(found).toMatchObject({
				grade: 9,
				class: '3'
			});
		});

		it('should return null for non-existent class', async () => {
			const t = convexTest(schema, modules);

			const found = await t.query(api.classes.getByGradeAndClass, {
				grade: 99,
				class: 'Z'
			});

			expect(found).toBeNull();
		});
	});

	describe('seedDefaultClasses', () => {
		it('should create default classes for all grades', async () => {
			const t = convexTest(schema, modules);

			const result = await t.mutation(api.classes.seedDefaultClasses, {});

			expect(result.created?.length ?? result.classes?.length).toBe(8); // 6 grades × "1" + 2 grades (11,12) × "IB"
			expect(result.message).toContain('8');

			// Verify classes exist
			const classes = await t.query(api.classes.list, {});

			expect(classes).toHaveLength(8);
		});

		it('should not duplicate existing classes', async () => {
			const t = convexTest(schema, modules);

			// Create a non-protected class manually
			await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});

			// Seed defaults - should skip existing
			const result = await t.mutation(api.classes.seedDefaultClasses, {});

			expect(result.created?.length ?? result.classes?.length).toBe(8); // 6 × "1" + 2 × "IB" (grades 11-12)

			const classes = await t.query(api.classes.list, {});

			expect(classes).toHaveLength(9); // 8 defaults + 1 manually created
		});
	});

	describe('getById', () => {
		it('should return class by ID', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 8,
				class: '2'
			});

			const found = await t.query(api.classes.getById, {
				id: classId
			});

			expect(found).toMatchObject({
				_id: classId,
				grade: 8,
				class: '2'
			});
		});

		it('should include teacher name if assigned', async () => {
			const t = convexTest(schema, modules);

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-1',
					name: 'Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			const classId = await t.mutation(api.classes.create, {
				grade: 9,
				class: '1',
				homeroomTeacherId: teacherId
			});

			const found = await t.query(api.classes.getById, {
				id: classId
			});

			expect(found).toMatchObject({
				grade: 9,
				class: '1',
				homeroomTeacherId: teacherId,
				homeroomTeacherName: 'Test Teacher'
			});
		});

		it('should return null for non-existent ID', async () => {
			const t = convexTest(schema, modules);

			// Create and then delete a class to get a valid but non-existent ID
			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});

			// Delete the class
			await t.mutation(api.classes.remove, { id: classId });

			// Now query the deleted class
			const found = await t.query(api.classes.getById, {
				id: classId as Id<'classes'>
			});

			expect(found).toBeNull();
		});
	});

	describe('getByTeacher', () => {
		it('should return class for teacher', async () => {
			const t = convexTest(schema, modules);

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-1',
					name: 'Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1',
				homeroomTeacherId: teacherId
			});

			const found = await t.query(api.classes.getByTeacher, {
				teacherId
			});

			expect(found).toMatchObject({
				_id: classId,
				grade: 7,
				class: '1',
				homeroomTeacherId: teacherId,
				homeroomTeacherName: 'Test Teacher'
			});
		});

		it('should return null when teacher has no class', async () => {
			const t = convexTest(schema, modules);

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-1',
					name: 'Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			const found = await t.query(api.classes.getByTeacher, {
				teacherId
			});

			expect(found).toBeNull();
		});
	});

	describe('getStudentCount', () => {
		it('should return correct count for class with students', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			// Add 3 students to the class
			await t.run(async (ctx) => {
				for (let i = 1; i <= 3; i++) {
					await ctx.db.insert('students', {
						englishName: `Student ${i}`,
						chineseName: `學生${i}`,
						studentId: `700100${i}`,
						classId,
						status: 'Enrolled'
					});
				}
			});

			const result = await t.query(api.classes.getStudentCount, {
				classId
			});

			expect(result).toMatchObject({
				count: 3,
				classInfo: {
					grade: 7,
					class: '1'
				}
			});
		});

		it('should return zero for empty class', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			const result = await t.query(api.classes.getStudentCount, {
				classId
			});

			expect(result).toMatchObject({
				count: 0,
				classInfo: {
					grade: 7,
					class: '1'
				}
			});
		});
	});

	describe('update', () => {
		it('should update homeroom teacher successfully', async () => {
			const t = convexTest(schema, modules);

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-1',
					name: 'Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			await t.mutation(api.classes.update, {
				id: classId,
				homeroomTeacherId: teacherId
			});

			const updated = await t.query(api.classes.getById, {
				id: classId
			});

			expect(updated?.homeroomTeacherId).toBe(teacherId);
			expect(updated?.homeroomTeacherName).toBe('Test Teacher');
		});

		it('should remove homeroom teacher when null is passed', async () => {
			const t = convexTest(schema, modules);

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-1',
					name: 'Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1',
				homeroomTeacherId: teacherId
			});

			await t.mutation(api.classes.update, {
				id: classId,
				homeroomTeacherId: undefined
			});

			const updated = await t.query(api.classes.getById, {
				id: classId
			});

			expect(updated?.homeroomTeacherId).toBeUndefined();
		});

		it('should throw error for non-existent class', async () => {
			const t = convexTest(schema, modules);

			const teacherId = await t.run(async (ctx) => {
				return await ctx.db.insert('users', {
					authId: 'teacher-1',
					name: 'Test Teacher',
					role: 'teacher',
					status: 'active'
				});
			});

			// Create and delete a class to get a valid but non-existent ID
			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});
			await t.mutation(api.classes.remove, { id: classId });

			await expect(
				t.mutation(api.classes.update, {
					id: classId as Id<'classes'>,
					homeroomTeacherId: teacherId
				})
			).rejects.toThrow('Class not found');
		});
	});

	describe('remove - protected classes', () => {
		it('should prevent deleting protected class "1"', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: '1'
			});

			await expect(
				t.mutation(api.classes.remove, {
					id: classId
				})
			).rejects.toThrow(/Cannot delete protected class.*1.*classes are required/);
		});

		it('should prevent deleting protected class "IB"', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'IB'
			});

			await expect(
				t.mutation(api.classes.remove, {
					id: classId
				})
			).rejects.toThrow(/Cannot delete protected class.*IB.*classes are required/);
		});

		it('should allow deleting non-protected class with "1" in name', async () => {
			const t = convexTest(schema, modules);

			const classId = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A1'
			});

			await t.mutation(api.classes.remove, {
				id: classId
			});

			const deleted = await t.query(api.classes.getById, {
				id: classId
			});

			expect(deleted).toBeNull();
		});
	});

	describe('moveStudent', () => {
		it('should move student between classes of same grade', async () => {
			const t = convexTest(schema, modules);

			// Create two classes in grade 7
			const classA = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});
			const classB = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'B'
			});

			// Create student in class A
			const studentId = await t.run(async (ctx) => {
				return await ctx.db.insert('students', {
					englishName: 'Test Student',
					chineseName: '測試學生',
					studentId: '7001001',
					classId: classA,
					status: 'Enrolled'
				});
			});

			// Move student to class B
			const result = await t.mutation(api.classes.moveStudent, {
				studentId,
				targetClassId: classB
			});

			expect(result.success).toBe(true);
			expect(result.fromClassId).toBe(classA);
			expect(result.toClassId).toBe(classB);

			// Verify student is now in class B
			const studentsInB = await t.query(api.classes.getStudents, {
				id: classB
			});
			expect(studentsInB).toHaveLength(1);
			expect(studentsInB[0]._id).toBe(studentId);
		});

		it('should prevent moving student to different grade', async () => {
			const t = convexTest(schema, modules);

			// Create class in grade 7 and grade 8
			const class7 = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});
			const class8 = await t.mutation(api.classes.create, {
				grade: 8,
				class: 'A'
			});

			// Create student in grade 7 class
			const studentId = await t.run(async (ctx) => {
				return await ctx.db.insert('students', {
					englishName: 'Test Student',
					chineseName: '測試學生',
					studentId: '7001001',
					classId: class7,
					status: 'Enrolled'
				});
			});

			// Try to move to grade 8 - should fail
			await expect(
				t.mutation(api.classes.moveStudent, {
					studentId,
					targetClassId: class8
				})
			).rejects.toThrow('Cannot move student to different grade');
		});

		it('should throw error for non-existent student', async () => {
			const t = convexTest(schema, modules);

			// Create a class and student, then delete the student to get a valid but non-existent ID
			const classA = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});

			const studentId = await t.run(async (ctx) => {
				return await ctx.db.insert('students', {
					englishName: 'Test Student',
					chineseName: '測試學生',
					studentId: '7001001',
					classId: classA,
					status: 'Enrolled'
				});
			});

			// Delete the student
			await t.run(async (ctx) => {
				await ctx.db.delete(studentId);
			});

			await expect(
				t.mutation(api.classes.moveStudent, {
					studentId: studentId as Id<'students'>,
					targetClassId: classA
				})
			).rejects.toThrow('Student not found');
		});

		it('should throw error for non-existent target class', async () => {
			const t = convexTest(schema, modules);

			const classA = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});

			// Create and delete class B to get a valid but non-existent ID
			const classB = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'B'
			});
			await t.mutation(api.classes.remove, { id: classB });

			const studentId = await t.run(async (ctx) => {
				return await ctx.db.insert('students', {
					englishName: 'Test Student',
					chineseName: '測試學生',
					studentId: '7001001',
					classId: classA,
					status: 'Enrolled'
				});
			});

			await expect(
				t.mutation(api.classes.moveStudent, {
					studentId,
					targetClassId: classB as Id<'classes'>
				})
			).rejects.toThrow('Class not found');
		});

		it('should not move student to same class (no-op)', async () => {
			const t = convexTest(schema, modules);

			const classA = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});

			const studentId = await t.run(async (ctx) => {
				return await ctx.db.insert('students', {
					englishName: 'Test Student',
					chineseName: '測試學生',
					studentId: '7001001',
					classId: classA,
					status: 'Enrolled'
				});
			});

			const result = await t.mutation(api.classes.moveStudent, {
				studentId,
				targetClassId: classA
			});

			expect(result.success).toBe(true);
			expect(result.fromClassId).toBe(classA);
			expect(result.toClassId).toBe(classA);
		});

		it('should move student with Not Enrolled status', async () => {
			const t = convexTest(schema, modules);

			const classA = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'A'
			});
			const classB = await t.mutation(api.classes.create, {
				grade: 7,
				class: 'B'
			});

			const studentId = await t.run(async (ctx) => {
				return await ctx.db.insert('students', {
					englishName: 'Test Student',
					chineseName: '測試學生',
					studentId: '7001001',
					classId: classA,
					status: 'Not Enrolled'
				});
			});

			const result = await t.mutation(api.classes.moveStudent, {
				studentId,
				targetClassId: classB
			});

			expect(result.success).toBe(true);

			const studentsInB = await t.query(api.classes.getStudents, {
				id: classB
			});
			expect(studentsInB[0].status).toBe('Not Enrolled');
		});
	});
});
