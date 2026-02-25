import { describe, expect, test } from 'vitest';
import { convexTest, modules } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { generateUniqueStudentId } from '../../tests/fixtures/server-test-helpers';

test('evaluations table operations work correctly', async () => {
	const t = convexTest(schema, modules);

	const studentId = await t.run(async (ctx) => {
		return ctx.db.insert('students', {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: generateUniqueStudentId(),
			grade: 10,
			status: 'Enrolled' as const
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return ctx.db.insert('users', {
			authId: 'teacher-auth-id',
			name: 'Test Teacher',
			role: 'teacher' as const,
			status: 'active' as const
		});
	});

	const categoryId = await t.run(async (ctx) => {
		return ctx.db.insert('point_categories', {
			name: 'Creativity'
		});
	});

	const evaluationId = await t.run(async (ctx) => {
		return ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			categoryId,
			value: 1,
			details: 'Great work!',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	expect(evaluationId).toBeDefined();

	const evaluations = await t.run(async (ctx) => {
		return await ctx.db.query('evaluations').collect();
	});

	expect(evaluations).toHaveLength(1);
	expect(evaluations[0].categoryId).toEqual(categoryId);
	expect(evaluations[0].value).toBe(1);
	expect(evaluations[0].studentId).toEqual(studentId);
	expect(evaluations[0].teacherId).toEqual(teacherId);
});

test('evaluations query by teacherId works correctly', async () => {
	const t = convexTest(schema, modules);

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Jane Doe',
			chineseName: '李四',
			studentId: 'STU002',
			grade: 11,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-auth-id',
			name: 'Teacher',
			role: 'teacher',
			status: 'active'
		});
	});

	const categoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Responsibility'
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 2,
			categoryId,
			details: 'Always on time',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	const evaluations = await t.run(async (ctx) => {
		return await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('teacherId'), teacherId))
			.collect();
	});

	expect(evaluations).toHaveLength(1);
	expect(evaluations[0].categoryId).toEqual(categoryId);
});

test('evaluations query by studentId works correctly', async () => {
	const t = convexTest(schema, modules);

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'STU003',
			grade: 12,
			status: 'Enrolled'
		});
	});

	const teacherId1 = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-1',
			name: 'Teacher 1',
			role: 'teacher',
			status: 'active'
		});
	});

	const teacherId2 = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-2',
			name: 'Teacher 2',
			role: 'teacher',
			status: 'active'
		});
	});

	const categoryId1 = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Creativity'
		});
	});

	const categoryId2 = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Responsibility'
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacherId1,
			value: 3,
			categoryId: categoryId1,
			details: 'Creative solutions',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacherId2,
			value: 1,
			categoryId: categoryId2,
			details: 'Good teamwork',
			timestamp: Date.now() + 1000,
			semesterId: '2025-H1'
		});
	});

	const evaluations = await t.run(async (ctx) => {
		return await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('studentId'), studentId))
			.collect();
	});

	expect(evaluations).toHaveLength(2);
});

// Tests for listAllEvaluationsPaginated
test('listAllEvaluationsPaginated returns paginated results', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id',
			name: 'Admin User',
			role: 'admin',
			status: 'active'
		});
	});

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Paginated Student',
			chineseName: '分頁學生',
			studentId: 'STU-PAG-001',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-paginated',
			name: 'Teacher Paginated',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create categories for testing
	const categoryIds: string[] = [];
	for (let i = 0; i < 5; i++) {
		const catId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: `Category ${i}`
			});
		});
		categoryIds.push(catId);
	}

	// Create multiple evaluations
	const now = Date.now();
	for (let i = 0; i < 5; i++) {
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: i + 1,
				categoryId: categoryIds[i],
				details: `Details ${i}`,
				timestamp: now + i * 1000,
				semesterId: '2025-H1'
			});
		});
	}

	// Test pagination with limit of 2
	const result = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 2, cursor: null }
	});

	expect(result.page).toHaveLength(2);
	expect(result.isDone).toBe(false);
	expect(result.continueCursor).toBeDefined();
	// Most recent first (descending order)
	expect(result.page[0].category).toBe('Category 4');
	expect(result.page[1].category).toBe('Category 3');
});

test('listAllEvaluationsPaginated respects sortAscending', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id-sort',
			name: 'Admin User Sort',
			role: 'admin',
			status: 'active'
		});
	});

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Sort Student',
			chineseName: '排序學生',
			studentId: 'STU-SORT-001',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-sort',
			name: 'Teacher Sort',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create categories for testing
	const categoryIds: string[] = [];
	for (let i = 0; i < 3; i++) {
		const catId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: `SortCat ${i}`
			});
		});
		categoryIds.push(catId);
	}

	// Create multiple evaluations
	const now = Date.now();
	for (let i = 0; i < 3; i++) {
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: i + 1,
				categoryId: categoryIds[i],
				details: `Details ${i}`,
				timestamp: now + i * 1000,
				semesterId: '2025-H1'
			});
		});
	}

	// Test ascending order
	const resultAsc = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: true,
		paginationOpts: { numItems: 10, cursor: null }
	});

	expect(resultAsc.page).toHaveLength(3);
	// Oldest first (ascending order)
	expect(resultAsc.page[0].category).toBe('SortCat 0');
	expect(resultAsc.page[2].category).toBe('SortCat 2');
});

test('listAllEvaluationsPaginated filters by showUnenrolled', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id-unenrolled',
			name: 'Admin User Unenrolled',
			role: 'admin',
			status: 'active'
		});
	});

	// Create enrolled student
	const enrolledStudentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Enrolled Student',
			chineseName: '在學學生',
			studentId: 'STU-ENR-001',
			grade: 10,
			status: 'Enrolled'
		});
	});

	// Create unenrolled student
	const unenrolledStudentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Unenrolled Student',
			chineseName: '離校學生',
			studentId: 'STU-UNENR-001',
			grade: 10,
			status: 'Not Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-unenrolled',
			name: 'Teacher Unenrolled',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create categories
	const enrolledCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Enrolled Cat'
		});
	});

	const unenrolledCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Unenrolled Cat'
		});
	});

	// Create evaluations for both students
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId: enrolledStudentId,
			teacherId,
			value: 1,
			categoryId: enrolledCategoryId,
			details: 'Enrolled student evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
		await ctx.db.insert('evaluations', {
			studentId: unenrolledStudentId,
			teacherId,
			value: 2,
			categoryId: unenrolledCategoryId,
			details: 'Unenrolled student evaluation',
			timestamp: Date.now() + 1000,
			semesterId: '2025-H1'
		});
	});

	// Test with showUnenrolled = false (default)
	const resultHidden = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 10, cursor: null }
	});

	expect(resultHidden.page).toHaveLength(1);
	expect(resultHidden.page[0].category).toBe('Enrolled Cat');

	// Test with showUnenrolled = true
	const resultShown = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: true,
		sortAscending: false,
		paginationOpts: { numItems: 10, cursor: null }
	});

	expect(resultShown.page).toHaveLength(2);
});

test('listAllEvaluationsPaginated filters by student name', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id-filter',
			name: 'Admin User Filter',
			role: 'admin',
			status: 'active'
		});
	});

	const student1Id = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Alice Smith',
			chineseName: '愛麗絲',
			studentId: 'STU-ALICE',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const student2Id = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Bob Jones',
			chineseName: '鮑伯',
			studentId: 'STU-BOB',
			grade: 11,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-filter',
			name: 'Teacher Filter',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create categories
	const aliceCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Alice Category'
		});
	});

	const bobCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Bob Category'
		});
	});

	// Create evaluations for both students
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId: student1Id,
			teacherId,
			value: 1,
			categoryId: aliceCategoryId,
			details: 'Alice evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
		await ctx.db.insert('evaluations', {
			studentId: student2Id,
			teacherId,
			value: 2,
			categoryId: bobCategoryId,
			details: 'Bob evaluation',
			timestamp: Date.now() + 1000,
			semesterId: '2025-H1'
		});
	});

	// Filter by student name "Alice"
	const result = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		studentFilter: 'Alice',
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 10, cursor: null }
	});

	expect(result.page).toHaveLength(1);
	expect(result.page[0].englishName).toBe('Alice Smith');
	expect(result.page[0].category).toBe('Alice Category');
});

test('listAllEvaluationsPaginated filters by teacher name', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id-teacher-filter',
			name: 'Admin User TeacherFilter',
			role: 'admin',
			status: 'active'
		});
	});

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Filter Student',
			chineseName: '過濾學生',
			studentId: 'STU-FILTER',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const teacher1Id = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-1-filter',
			name: 'Ms. Anderson',
			role: 'teacher',
			status: 'active'
		});
	});

	const teacher2Id = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-2-filter',
			name: 'Mr. Brown',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create categories
	const andersonCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Anderson Category'
		});
	});

	const brownCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Brown Category'
		});
	});

	// Create evaluations from both teachers
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacher1Id,
			value: 1,
			categoryId: andersonCategoryId,
			details: 'Anderson evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacher2Id,
			value: 2,
			categoryId: brownCategoryId,
			details: 'Brown evaluation',
			timestamp: Date.now() + 1000,
			semesterId: '2025-H1'
		});
	});

	// Filter by teacher name "Anderson"
	const result = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		teacherFilter: 'Anderson',
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 10, cursor: null }
	});

	expect(result.page).toHaveLength(1);
	expect(result.page[0].teacherName).toBe('Ms. Anderson');
	expect(result.page[0].category).toBe('Anderson Category');
});

test('listAllEvaluationsPaginated continues with cursor', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id-cursor',
			name: 'Admin User Cursor',
			role: 'admin',
			status: 'active'
		});
	});

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Cursor Student',
			chineseName: '游標學生',
			studentId: 'STU-CURSOR',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-cursor',
			name: 'Teacher Cursor',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create categories for the evaluations
	const categoryIds: Id<'point_categories'>[] = [];
	for (let i = 0; i < 5; i++) {
		const categoryId = await t.mutation(api.categories.create, {
			name: `CursorCat ${i}`
		});
		categoryIds.push(categoryId);
	}

	// Create 5 evaluations
	const now = Date.now();
	for (let i = 0; i < 5; i++) {
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: i + 1,
				categoryId: categoryIds[i],
				details: `Details ${i}`,
				timestamp: now + i * 1000,
				semesterId: '2025-H1'
			});
		});
	}

	// First page
	const firstPage = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 2, cursor: null }
	});

	expect(firstPage.page).toHaveLength(2);
	expect(firstPage.isDone).toBe(false);

	// Second page using cursor
	const secondPage = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 2, cursor: firstPage.continueCursor }
	});

	expect(secondPage.page).toHaveLength(2);
	expect(secondPage.isDone).toBe(false);

	// Third page
	const thirdPage = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 2, cursor: secondPage.continueCursor }
	});

	expect(thirdPage.page).toHaveLength(1);
	expect(thirdPage.isDone).toBe(true);

	// Verify all evaluations were returned in correct order
	const allCategories = [
		...firstPage.page.map((e: { category: string }) => e.category),
		...secondPage.page.map((e: { category: string }) => e.category),
		...thirdPage.page.map((e: { category: string }) => e.category)
	];
	expect(allCategories).toEqual([
		'CursorCat 4',
		'CursorCat 3',
		'CursorCat 2',
		'CursorCat 1',
		'CursorCat 0'
	]);
});

// Tests for categoryId reference integrity
test('evaluation queries resolve category name from categoryId', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id-category-resolve',
			name: 'Admin User',
			role: 'admin',
			status: 'active'
		});
	});

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Category Test Student',
			chineseName: '類別測試學生',
			studentId: 'STU-CAT-RESOLVE',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-cat-resolve',
			name: 'Teacher Category',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create category
	const categoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Original Category Name'
		});
	});

	// Create evaluation with categoryId reference
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 5,
			categoryId,
			details: 'Test evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	// Query should return resolved category name
	const result = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 10, cursor: null }
	});

	expect(result.page).toHaveLength(1);
	expect(result.page[0].category).toBe('Original Category Name');
	expect(result.page[0].categoryId).toBe(categoryId);
});

test('changing category name reflects in evaluation queries', async () => {
	const t = convexTest(schema, modules);

	// Create admin user for authentication
	await t.run(async (ctx) => {
		await ctx.db.insert('users', {
			authId: 'test-auth-id-name-change',
			name: 'Admin User',
			role: 'admin',
			status: 'active'
		});
	});

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Name Change Student',
			chineseName: '改名測試學生',
			studentId: 'STU-NAME-CHANGE',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-name-change',
			name: 'Teacher NameChange',
			role: 'teacher',
			status: 'active'
		});
	});

	// Create category
	const categoryId = await t.mutation(api.categories.create, {
		name: 'Old Category Name'
	});

	// Create evaluation with categoryId reference
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 5,
			categoryId,
			details: 'Test evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	// Verify initial category name
	const resultBefore = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 10, cursor: null }
	});
	expect(resultBefore.page[0].category).toBe('Old Category Name');

	// Update category name
	await t.mutation(api.categories.update, {
		id: categoryId,
		name: 'New Category Name'
	});

	// Query should now return the new category name (no orphaning!)
	const resultAfter = await t.query(api.evaluations.listAllEvaluationsPaginated, {
		showUnenrolled: false,
		sortAscending: false,
		paginationOpts: { numItems: 10, cursor: null }
	});
	expect(resultAfter.page).toHaveLength(1);
	expect(resultAfter.page[0].category).toBe('New Category Name');
	// categoryId should remain the same
	expect(resultAfter.page[0].categoryId).toBe(categoryId);
});

// Note: Update evaluation tests are covered by e2e tests in e2e/evaluations.spec.ts
// The unit test infrastructure has limitations with Convex ID validation for authorization

// ============================================
// Authorization boundary tests
// ============================================
//
// NOTE: The unit test infrastructure has limitations for authorization testing:
// 1. The mock user always has role: 'admin' and a string _id ('test-user-id')
// 2. This prevents testing teacher-specific authorization in unit tests
// 3. The audit log insert fails because performerId expects a real Convex ID
// 4. Cannot insert evaluations with string IDs as teacherId (schema validation)
//
// Full authorization tests are covered by e2e tests in e2e/evaluations.spec.ts

describe('Authorization boundaries', () => {
	test("non-creator cannot edit another's evaluation", async () => {
		const t = convexTest(schema, modules);

		// Create a different teacher (not the authenticated user)
		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'other-teacher',
				name: 'Other Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create a student
		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Auth Test Student',
				chineseName: 'Auth Test Student',
				studentId: 'STU-AUTH-001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		// Create a category
		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Auth Test Category'
			});
		});

		// Create an evaluation by the other teacher (not the authenticated user)
		const evaluationId = await t.run(async (ctx) => {
			return await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Original details by teacher',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		// Attempt to update the evaluation as the authenticated user (should fail)
		// The authenticated user is mocked as 'test-user-id', which is different from teacherId
		await expect(
			t.mutation(api.evaluations.update, {
				id: evaluationId,
				details: 'Modified by non-creator'
			})
		).rejects.toThrow('Not authorized to edit this evaluation');

		// Verify the evaluation was not modified
		const evaluation = await t.run(async (ctx) => {
			return await ctx.db.get(evaluationId);
		});
		expect(evaluation?.details).toBe('Original details by teacher');
	});

	test("admin cannot edit another teacher's evaluation (only creator can edit)", async () => {
		const t = convexTest(schema, modules);

		// Create a teacher
		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-for-admin-edit',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create a student
		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Admin Edit Test Student',
				chineseName: 'Admin Edit Test Student',
				studentId: 'STU-ADMIN-EDIT-001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		// Create a category
		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Admin Edit Category'
			});
		});

		// Create an evaluation by the teacher (not the admin)
		const evaluationId = await t.run(async (ctx) => {
			return await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Original details by teacher',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		// Admin (authenticated user with _id: 'test-user-id') should NOT be able to edit
		// another teacher's evaluation (only the creator can edit, per design decision)
		await expect(
			t.mutation(api.evaluations.update, {
				id: evaluationId,
				details: 'Modified by admin'
			})
		).rejects.toThrow('Not authorized to edit this evaluation');

		// Verify the evaluation was not modified
		const evaluation = await t.run(async (ctx) => {
			return await ctx.db.get(evaluationId);
		});
		expect(evaluation?.details).toBe('Original details by teacher');
	});

	describe('evaluations bulk creation', () => {
		test('creates evaluations for multiple students via direct DB insert', async () => {
			const t = convexTest(schema, modules);

			// Create multiple students
			const studentId1 = await t.run(async (ctx) => {
				return ctx.db.insert('students', {
					englishName: 'Student One',
					chineseName: '學生一',
					studentId: generateUniqueStudentId(),
					grade: 10,
					status: 'Enrolled' as const
				});
			});

			const studentId2 = await t.run(async (ctx) => {
				return ctx.db.insert('students', {
					englishName: 'Student Two',
					chineseName: '學生二',
					studentId: generateUniqueStudentId(),
					grade: 10,
					status: 'Enrolled' as const
				});
			});

			const studentId3 = await t.run(async (ctx) => {
				return ctx.db.insert('students', {
					englishName: 'Student Three',
					chineseName: '學生三',
					studentId: generateUniqueStudentId(),
					grade: 10,
					status: 'Enrolled' as const
				});
			});

			const teacherId = await t.run(async (ctx) => {
				return ctx.db.insert('users', {
					authId: 'teacher-auth-id',
					name: 'Test Teacher',
					role: 'teacher' as const,
					status: 'active' as const
				});
			});

			const categoryId = await t.run(async (ctx) => {
				return ctx.db.insert('point_categories', {
					name: 'Academics'
				});
			});

			// Directly insert multiple evaluations (simulating bulk creation)
			const timestamp = Date.now();
			for (const studentId of [studentId1, studentId2, studentId3]) {
				await t.run(async (ctx) => {
					await ctx.db.insert('evaluations', {
						studentId,
						teacherId,
						value: 5,
						categoryId,
						details: 'Great homework!',
						timestamp,
						semesterId: '2025-H1'
					});
				});
			}

			const evaluations = await t.run(async (ctx) => {
				return await ctx.db.query('evaluations').collect();
			});

			expect(evaluations).toHaveLength(3);

			// Verify all evaluations have the same value
			for (const e of evaluations) {
				expect(e.value).toBe(5);
			}

			// Verify each student got an evaluation
			const studentIdsWithEvals = evaluations.map((e) => e.studentId);
			expect(studentIdsWithEvals).toContain(studentId1);
			expect(studentIdsWithEvals).toContain(studentId2);
			expect(studentIdsWithEvals).toContain(studentId3);
		});

		test('handles multiple evaluations with different values', async () => {
			const t = convexTest(schema, modules);

			// Create students
			const studentIds: string[] = [];
			for (let i = 1; i <= 3; i++) {
				const id = await t.run(async (ctx) => {
					return ctx.db.insert('students', {
						englishName: `Student ${i}`,
						chineseName: `學生${i}`,
						studentId: generateUniqueStudentId(),
						grade: 10,
						status: 'Enrolled' as const
					});
				});
				studentIds.push(id);
			}

			const teacherId = await t.run(async (ctx) => {
				return ctx.db.insert('users', {
					authId: 'teacher-auth-id',
					name: 'Test Teacher',
					role: 'teacher' as const,
					status: 'active' as const
				});
			});
			const categoryId = await t.run(async (ctx) => {
				return ctx.db.insert('point_categories', {
					name: 'Behavior'
				});
			});

			// Insert evaluations with different values
			await t.run(async (ctx) => {
				await ctx.db.insert('evaluations', {
					studentId: studentIds[0],
					teacherId,
					value: 3,
					categoryId,
					details: 'Good',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				});
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('evaluations', {
					studentId: studentIds[1],
					teacherId,
					value: 5,
					categoryId,
					details: 'Excellent',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				});
			});

			const evaluations = await t.run(async (ctx) => {
				return await ctx.db.query('evaluations').collect();
			});

			expect(evaluations).toHaveLength(2);

			// Verify the values
			const evalByStudent = new Map(evaluations.map((e) => [e.studentId, e.value]));
			expect(evalByStudent.get(studentIds[0])).toBe(3);
			expect(evalByStudent.get(studentIds[1])).toBe(5);
		});
	});
});
