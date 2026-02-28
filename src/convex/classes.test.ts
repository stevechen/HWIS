import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';

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

			expect(result.created?.length ?? result.classes?.length).toBe(12); // 6 grades × 2 classes (default + IB)
			expect(result.message).toContain('12');

			// Verify classes exist
			const classes = await t.query(api.classes.list, {});

			expect(classes).toHaveLength(12);
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

			expect(result.created?.length ?? result.classes?.length).toBe(12); // Always 12 (1 + IB per grade)

			const classes = await t.query(api.classes.list, {});

			expect(classes).toHaveLength(13); // 12 defaults + 1 manually created
		});
	});
});
