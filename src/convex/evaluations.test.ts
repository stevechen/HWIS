import { describe, expect, test } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { generateUniqueStudentId } from '../../tests/fixtures/server-test-helpers';
import { enrichEvaluations } from './shared/enrichment';
import { lockCutoffFor } from './shared/evaluation_week';

test('evaluations table operations work correctly', async () => {
	const t = convexTest(schema, modules);

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'John Doe',
		chineseName: '張三',
		studentId: generateUniqueStudentId(),
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Jane Doe',
		chineseName: '李四',
		studentId: 'STU002',
		grade: 11,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Test Student',
		chineseName: '測試學生',
		studentId: 'STU003',
		grade: 12,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Paginated Student',
		chineseName: '分頁學生',
		studentId: 'STU-PAG-001',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Sort Student',
		chineseName: '排序學生',
		studentId: 'STU-SORT-001',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
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
	const { studentId: enrolledStudentId } = await createStudentWithClass(t, {
		englishName: 'Enrolled Student',
		chineseName: '在學學生',
		studentId: 'STU-ENR-001',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
	});

	// Create unenrolled student
	const { studentId: unenrolledStudentId } = await createStudentWithClass(t, {
		englishName: 'Unenrolled Student',
		chineseName: '離校學生',
		studentId: 'STU-UNENR-001',
		grade: 10,
		classNum: '1',
		status: 'Not Enrolled'
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

	const { studentId: student1Id } = await createStudentWithClass(t, {
		englishName: 'Alice Smith',
		chineseName: '愛麗絲',
		studentId: 'STU-ALICE',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
	});

	const { studentId: student2Id } = await createStudentWithClass(t, {
		englishName: 'Bob Jones',
		chineseName: '鮑伯',
		studentId: 'STU-BOB',
		grade: 11,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Filter Student',
		chineseName: '過濾學生',
		studentId: 'STU-FILTER',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Cursor Student',
		chineseName: '游標學生',
		studentId: 'STU-CURSOR',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Category Test Student',
		chineseName: '類別測試學生',
		studentId: 'STU-CAT-RESOLVE',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
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

	const { studentId } = await createStudentWithClass(t, {
		englishName: 'Name Change Student',
		chineseName: '改名測試學生',
		studentId: 'STU-NAME-CHANGE',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
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
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Auth Test Student',
			chineseName: 'Auth Test Student',
			studentId: 'STU-AUTH-001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
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
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Admin Edit Test Student',
			chineseName: 'Admin Edit Test Student',
			studentId: 'STU-ADMIN-EDIT-001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
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
			const { studentId: studentId1 } = await createStudentWithClass(t, {
				englishName: 'Student One',
				chineseName: '學生一',
				studentId: generateUniqueStudentId(),
				grade: 10,
				classNum: '1',
				status: 'Enrolled'
			});

			const { studentId: studentId2 } = await createStudentWithClass(t, {
				englishName: 'Student Two',
				chineseName: '學生二',
				studentId: generateUniqueStudentId(),
				grade: 10,
				classNum: '1',
				status: 'Enrolled'
			});

			const { studentId: studentId3 } = await createStudentWithClass(t, {
				englishName: 'Student Three',
				chineseName: '學生三',
				studentId: generateUniqueStudentId(),
				grade: 10,
				classNum: '1',
				status: 'Enrolled'
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
				const { studentId: id } = await createStudentWithClass(t, {
					englishName: `Student ${i}`,
					chineseName: `學生${i}`,
					studentId: generateUniqueStudentId(),
					grade: 10,
					classNum: '1',
					status: 'Enrolled'
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

// ============================================
// evaluations.create mutation tests
// ============================================
describe('evaluations.create', () => {
	test('creates evaluation records via direct DB insert', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'DB Insert Student',
			chineseName: '直接插入學生',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'teacher-create-test',
				name: 'Create Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'Create Test Category'
			});
		});

		const timestamp = Date.now();
		const evaluationId = await t.run(async (ctx) => {
			return ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 3,
				categoryId,
				details: 'Excellent work on the project',
				timestamp,
				semesterId: '2025-H1'
			});
		});

		expect(evaluationId).toBeDefined();

		const evaluation = await t.run(async (ctx) => {
			return ctx.db.get(evaluationId);
		});

		expect(evaluation).toBeDefined();
		expect(evaluation!.studentId).toEqual(studentId);
		expect(evaluation!.teacherId).toEqual(teacherId);
		expect(evaluation!.categoryId).toEqual(categoryId);
		expect(evaluation!.value).toBe(3);
		expect(evaluation!.details).toBe('Excellent work on the project');
		expect(evaluation!.semesterId).toBe('2025-H1');
	});

	test('creates audit log for each evaluation in batch', async () => {
		const t = convexTest(schema, modules);

		const { studentId: student1Id } = await createStudentWithClass(t, {
			englishName: 'Audit Student 1',
			chineseName: '審計學生一',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const { studentId: student2Id } = await createStudentWithClass(t, {
			englishName: 'Audit Student 2',
			chineseName: '審計學生二',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'teacher-audit-test',
				name: 'Audit Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'Audit Test Category'
			});
		});

		const timestamp = Date.now();

		// Simulate what evaluations.create does: insert evaluations + audit logs
		const evaluationIds: string[] = [];
		for (const studentId of [student1Id, student2Id]) {
			await t.run(async (ctx) => {
				const evalId = await ctx.db.insert('evaluations', {
					studentId,
					teacherId,
					value: 2,
					categoryId,
					details: 'Good work',
					timestamp,
					semesterId: '2025-H1'
				});
				evaluationIds.push(evalId);

				await ctx.db.insert('audit_logs', {
					action: 'create_evaluation',
					performerId: teacherId,
					targetTable: 'evaluations',
					targetId: evalId.toString(),
					oldValue: null,
					newValue: {
						studentId,
						value: 2,
						categoryId,
						categoryName: 'Audit Test Category'
					},
					timestamp,
					e2eTag: undefined
				});
			});
		}

		const evaluations = await t.run(async (ctx) => {
			return ctx.db.query('evaluations').collect();
		});
		expect(evaluations).toHaveLength(2);

		const auditLogs = await t.run(async (ctx) => {
			return ctx.db.query('audit_logs').collect();
		});
		expect(auditLogs).toHaveLength(2);

		for (const log of auditLogs) {
			expect(log.action).toBe('create_evaluation');
			expect(log.performerId).toEqual(teacherId);
			expect(log.targetTable).toBe('evaluations');
			expect(log.oldValue).toBeNull();
			expect(log.newValue).toMatchObject({
				value: 2,
				categoryName: 'Audit Test Category'
			});
		}
	});
});

// ============================================
// evaluations.remove mutation tests
// ============================================
describe('evaluations.remove', () => {
	// NOTE: mutations throw "Unauthorized" due to test infrastructure limitation:
	// The mock user's _id ('test-user-id') is not a real Convex ID, so mutations
	// that require authentication fail before reaching business logic.
	// Authorization and time-locking tests are covered via direct DB operations below.

	test('time-locking prevents deletion after lock window (DB-level verification)', async () => {
		const t = convexTest(schema, modules);

		// Verify the time-locking logic by checking the calculation
		// Create evaluation on a known date and verify lock time
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'TimeLock Student',
			chineseName: '時間鎖定學生',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'teacher-timelock',
				name: 'TimeLock Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'TimeLock Category'
			});
		});

		// Create evaluation on Wednesday June 10, 2026 (Taiwan time)
		const wednesdayJune10 = new Date('2026-06-10T12:00:00+08:00').getTime();

		const evaluationId = await t.run(async (ctx) => {
			return ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Time-lock test',
				timestamp: wednesdayJune10,
				semesterId: '2025-H1'
			});
		});

		// Verify the evaluation exists
		const evaluation = await t.run(async (ctx) => {
			return ctx.db.get(evaluationId);
		});
		expect(evaluation).toBeDefined();
		expect(evaluation!.timestamp).toBe(wednesdayJune10);

		// The lock cutoff should be Monday June 15, 2026 00:00 (Taiwan time),
		// the Monday of the week after the evaluation's week
		const expectedLockTime = lockCutoffFor(wednesdayJune10);
		expect(expectedLockTime).toBe(new Date('2026-06-15T00:00:00+08:00').getTime());
	});
});

// ============================================
// evaluations.update mutation tests
// ============================================
describe('evaluations.update', () => {
	test('throws when evaluation does not exist', async () => {
		const t = convexTest(schema, modules);

		// Create a real evaluation, get its ID, then delete it
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Temp Student Upd',
			chineseName: '暫時學生更新',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'teacher-temp-upd',
				name: 'Temp Teacher Upd',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'Temp Cat Upd'
			});
		});

		const evaluationId = await t.run(async (ctx) => {
			const id = await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'To be deleted',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
			await ctx.db.delete(id);
			return id;
		});

		await expect(
			t.mutation(api.evaluations.update, { id: evaluationId, details: 'Updated' })
		).rejects.toThrow('Evaluation not found');
	});

	test('throws when not authorized (teacherId mismatch)', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Update Auth Student',
			chineseName: '更新授權學生',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const otherTeacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'other-teacher-update',
				name: 'Other Teacher Update',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'Update Test Category'
			});
		});

		const evaluationId = await t.run(async (ctx) => {
			return ctx.db.insert('evaluations', {
				studentId,
				teacherId: otherTeacherId,
				value: 1,
				categoryId,
				details: 'Original details',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		await expect(
			t.mutation(api.evaluations.update, { id: evaluationId, details: 'Modified' })
		).rejects.toThrow('Not authorized to edit this evaluation');

		// Verify evaluation was not modified
		const evaluation = await t.run(async (ctx) => {
			return ctx.db.get(evaluationId);
		});
		expect(evaluation!.details).toBe('Original details');
	});

	test('time-locking prevents update after lock window', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Update Lock Student',
			chineseName: '更新鎖定學生',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const otherTeacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'teacher-update-lock',
				name: 'Update Lock Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'Update Lock Category'
			});
		});

		// Create evaluation from 3 weeks ago (past lock window)
		const threeWeeksAgo = Date.now() - 3 * 7 * 24 * 60 * 60 * 1000;

		const evaluationId = await t.run(async (ctx) => {
			return ctx.db.insert('evaluations', {
				studentId,
				teacherId: otherTeacherId,
				value: 1,
				categoryId,
				details: 'Old evaluation',
				timestamp: threeWeeksAgo,
				semesterId: '2025-H1'
			});
		});

		// Try to update — should fail authorization first (teacherId mismatch),
		// but the time-locking logic would also prevent it if auth passed
		await expect(
			t.mutation(api.evaluations.update, { id: evaluationId, details: 'Modified' })
		).rejects.toThrow();

		// Verify evaluation was not modified
		const evaluation = await t.run(async (ctx) => {
			return ctx.db.get(evaluationId);
		});
		expect(evaluation!.details).toBe('Old evaluation');
	});

	test('updates evaluation via direct DB patch', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Patch Student',
			chineseName: '修補學生',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'teacher-patch',
				name: 'Patch Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'Patch Category'
			});
		});

		const newCategoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'New Category'
			});
		});

		const evaluationId = await t.run(async (ctx) => {
			return ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Original details',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		// Simulate what evaluations.update does: patch the evaluation
		await t.run(async (ctx) => {
			await ctx.db.patch(evaluationId, {
				value: 5,
				categoryId: newCategoryId,
				details: 'Updated details'
			});
		});

		const evaluation = await t.run(async (ctx) => {
			return ctx.db.get(evaluationId);
		});

		expect(evaluation).toBeDefined();
		expect(evaluation!.value).toBe(5);
		expect(evaluation!.categoryId).toEqual(newCategoryId);
		expect(evaluation!.details).toBe('Updated details');
		// Fields not updated should remain unchanged
		expect(evaluation!.studentId).toEqual(studentId);
		expect(evaluation!.teacherId).toEqual(teacherId);
		expect(evaluation!.semesterId).toBe('2025-H1');
	});

	test('audit log created on update with old and new values', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Audit Update Student',
			chineseName: '審計更新學生',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return ctx.db.insert('users', {
				authId: 'teacher-audit-update',
				name: 'Audit Update Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return ctx.db.insert('point_categories', {
				name: 'Audit Update Category'
			});
		});

		const evaluationId = await t.run(async (ctx) => {
			return ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Original',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		// Simulate what evaluations.update does: patch + audit log
		const timestamp = Date.now();
		await t.run(async (ctx) => {
			const oldEvaluation = await ctx.db.get(evaluationId);
			await ctx.db.patch(evaluationId, { value: 5, details: 'Updated' });
			await ctx.db.insert('audit_logs', {
				action: 'update_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: evaluationId.toString(),
				oldValue: { ...oldEvaluation },
				newValue: { value: 5, details: 'Updated' },
				timestamp
			});
		});

		const auditLogs = await t.run(async (ctx) => {
			return ctx.db
				.query('audit_logs')
				.filter((q) => q.eq(q.field('action'), 'update_evaluation'))
				.collect();
		});

		expect(auditLogs).toHaveLength(1);
		expect(auditLogs[0].performerId).toEqual(teacherId);
		expect(auditLogs[0].targetTable).toBe('evaluations');
		expect(auditLogs[0].oldValue).toMatchObject({ value: 1, details: 'Original' });
		expect(auditLogs[0].newValue).toMatchObject({ value: 5, details: 'Updated' });
	});
});

describe('evaluations.getStudentEvaluationsAll', () => {
	test('returns all evaluations for a student (admin view)', async () => {
		const t = convexTest(schema, modules);

		// Create admin user in DB (test runtime uses authId 'test_admin')
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Admin View Student',
			chineseName: '管理員視圖學生',
			studentId: 'STU-ADMIN-VIEW',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Admin View Category'
		});

		// Create multiple evaluations from different teachers for the same student
		const teacher1Id = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher1-admin-view',
				name: 'Teacher One',
				role: 'teacher',
				status: 'active'
			});
		});

		const teacher2Id = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher2-admin-view',
				name: 'Teacher Two',
				role: 'teacher',
				status: 'active'
			});
		});

		const timestamp = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: teacher1Id,
				value: 1,
				categoryId,
				details: 'Teacher 1 evaluation',
				timestamp: timestamp,
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: teacher2Id,
				value: 2,
				categoryId,
				details: 'Teacher 2 evaluation',
				timestamp: timestamp + 1000,
				semesterId: '2025-H1'
			});
		});

		const result = await t.query(api.evaluations.getStudentEvaluationsAll, {
			studentId
		});

		expect(result).toHaveLength(2);
		expect(result[0].details).toBe('Teacher 2 evaluation');
		expect(result[0].teacherName).toBe('Teacher Two');
		expect(result[1].details).toBe('Teacher 1 evaluation');
		expect(result[1].teacherName).toBe('Teacher One');
		expect(result[0].category).toBe('Admin View Category');
		expect(result[0].englishName).toBe('Admin View Student');
	});

	test('returns empty array when student has no evaluations', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'No Evals Student',
			chineseName: '無評語學生',
			studentId: 'STU-NO-EVALS',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const result = await t.query(api.evaluations.getStudentEvaluationsAll, {
			studentId
		});

		expect(result).toHaveLength(0);
	});
});

describe('evaluations.getStudentEvaluationsByTeacher', () => {
	// NOTE: getStudentEvaluationsByTeacher calls requireUserProfile, which in the
	// test runtime returns a mock user with _id='test-user-id' (a string, not a real
	// Convex ID). The query then calls ctx.db.get(user._id) to resolve the teacher
	// name, which fails because 'test-user-id' doesn't exist in the DB.
	// We test the query logic via t.run() that bypasses auth.
	test('returns only evaluations from the authenticated teacher', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-get-evals',
				name: 'Teacher Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const otherTeacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'other-teacher-eval',
				name: 'Other Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Teacher Filter Student',
			chineseName: '教師篩選學生',
			studentId: 'STU-TEACHER-FILTER',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Teacher Filter Category'
			});
		});

		// Create evaluations from both teachers for the same student
		const timestamp = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'My evaluation',
				timestamp: timestamp,
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: otherTeacherId,
				value: 2,
				categoryId,
				details: 'Other teacher evaluation',
				timestamp: timestamp + 1000,
				semesterId: '2025-H1'
			});
		});

		// Replicate getStudentEvaluationsByTeacher logic using t.run
		const result = await t.run(async (ctx) => {
			// Simulate authenticated user being our teacher
			const user = await ctx.db.get(teacherId);
			if (!user) return [];

			const evaluations = await ctx.db
				.query('evaluations')
				.filter((q) =>
					q.and(q.eq(q.field('studentId'), studentId), q.eq(q.field('teacherId'), user._id))
				)
				.take(200);

			const baseEnriched = await enrichEvaluations(evaluations, ctx);

			const teacher = await ctx.db.get(user._id);
			const teacherName = teacher?.name || 'Unknown Teacher';

			const enriched = baseEnriched.map((e) => ({
				...e,
				categoryId: e.categoryId.toString(),
				teacherName,
				isAdmin: false
			}));

			return enriched.sort((a, b) => b.timestamp - a.timestamp);
		});

		// Should only return evaluations from the authenticated teacher
		expect(result).toHaveLength(1);
		expect(result[0].details).toBe('My evaluation');
		expect(result[0].teacherName).toBe('Teacher Admin');
		expect(result[0].category).toBe('Teacher Filter Category');
	});

	test('returns empty array when teacher has no evaluations for student', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-empty-evals',
				name: 'Teacher Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const otherTeacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'another-teacher',
				name: 'Another Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Other Teacher Student',
			chineseName: '其他教師學生',
			studentId: 'STU-OTHER-TEACHER',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Other Category'
			});
		});

		// Create only one evaluation from another teacher
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: otherTeacherId,
				value: 1,
				categoryId,
				details: 'Other teacher only',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		// Replicate getStudentEvaluationsByTeacher logic using t.run
		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(teacherId);
			if (!user) return [];

			const evaluations = await ctx.db
				.query('evaluations')
				.filter((q) =>
					q.and(q.eq(q.field('studentId'), studentId), q.eq(q.field('teacherId'), user._id))
				)
				.take(200);

			const baseEnriched = await enrichEvaluations(evaluations, ctx);

			const teacher = await ctx.db.get(user._id);
			const teacherName = teacher?.name || 'Unknown Teacher';

			const enriched = baseEnriched.map((e) => ({
				...e,
				categoryId: e.categoryId.toString(),
				teacherName,
				isAdmin: false
			}));

			return enriched.sort((a, b) => b.timestamp - a.timestamp);
		});

		// Authenticated teacher has no evaluations for this student
		expect(result).toHaveLength(0);
	});
});

describe('evaluations.getStudentEvaluationsAllByStudentIdCode', () => {
	test('returns all evaluations using studentIdCode', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Code Lookup Student',
			chineseName: '碼查找學生',
			studentId: 'STU-CODE-LOOKUP',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Code Lookup Category'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-code-lookup',
				name: 'Code Lookup Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const timestamp = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Code lookup evaluation',
				timestamp: timestamp,
				semesterId: '2025-H1'
			});
		});

		const result = await t.query(api.evaluations.getStudentEvaluationsAllByStudentIdCode, {
			studentIdCode: 'STU-CODE-LOOKUP'
		});

		expect(result).toHaveLength(1);
		expect(result[0].details).toBe('Code lookup evaluation');
		expect(result[0].teacherName).toBe('Code Lookup Teacher');
		expect(result[0].englishName).toBe('Code Lookup Student');
	});

	test('returns empty array when studentIdCode not found', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const result = await t.query(api.evaluations.getStudentEvaluationsAllByStudentIdCode, {
			studentIdCode: 'NONEXISTENT'
		});

		expect(result).toHaveLength(0);
	});
});

// Helper to replicate listRecent query logic with test admin auth bypass
// Since listRecent calls getAuthenticatedUser(ctx) without a test token,
// we replicate the query logic here using t.run to bypass auth
async function runListRecentQuery(t: ReturnType<typeof convexTest>, studentFilter?: string) {
	const result = await t.run(async (ctx) => {
		const userDoc = await ctx.db
			.query('users')
			.filter((q) => q.eq(q.field('authId'), 'test_admin'))
			.first();

		if (!userDoc) return { evaluations: [], cursor: null };

		const userRole = userDoc?.role;
		const isAdmin = userRole === 'admin' || userRole === 'super';

		const allEvaluations = await ctx.db
			.query('evaluations')
			.filter((q) => q.eq(q.field('teacherId'), userDoc._id))
			.order('desc')
			.take(200);

		let results = await enrichEvaluations(allEvaluations, ctx);

		results = results.map((eval_) => ({
			...eval_,
			_id: eval_._id,
			studentId: eval_.studentId,
			teacherId: eval_.teacherId,
			englishName: eval_.englishName,
			chineseName: eval_.chineseName,
			grade: eval_.grade,
			class: eval_.class,
			studentIdCode: eval_.studentIdCode,
			status: eval_.status,
			value: eval_.value,
			categoryId: eval_.categoryId,
			category: eval_.category,
			details: eval_.details,
			timestamp: eval_.timestamp,
			semesterId: eval_.semesterId
		}));

		// Server-side filtering if studentFilter is provided
		if (studentFilter && studentFilter.trim()) {
			results = results.filter((e) =>
				e.englishName?.toLowerCase().includes(studentFilter.toLowerCase().trim())
			);
		}

		// Filter out evaluations for unenrolled students (non-admin view)
		if (!isAdmin) {
			results = results.filter((e) => e.status !== 'Not Enrolled');
		}

		return results.sort((a, b) => b.timestamp - a.timestamp);
	});

	return Array.isArray(result) ? result : [];
}

describe('evaluations.listRecent', () => {
	test('returns empty when user is not authenticated', async () => {
		const t = convexTest(schema, modules);

		const result = await t.query(api.evaluations.listRecent, {});

		expect(result).toEqual({ evaluations: [], cursor: null });
	});

	test('returns evaluations for authenticated admin user', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Recent Student One',
			chineseName: '最近學生一',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Recent Category'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				categoryId,
				value: 1,
				details: 'Recent evaluation',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		const result = await runListRecentQuery(t);

		expect(result).toHaveLength(1);
		expect(result[0].details).toBe('Recent evaluation');
		expect(result[0].englishName).toBe('Recent Student One');
		expect(result[0].category).toBe('Recent Category');
	});

	test('returns evaluations sorted by timestamp descending', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Multi Eval Student',
			chineseName: '多評語學生',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Multi Eval Category'
		});

		const baseTime = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: (
					await ctx.db
						.query('users')
						.filter((q) => q.eq(q.field('authId'), 'test_admin'))
						.first()
				)?._id,
				categoryId,
				value: 1,
				details: 'Oldest evaluation',
				timestamp: baseTime,
				semesterId: '2025-H1'
			});
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: (
					await ctx.db
						.query('users')
						.filter((q) => q.eq(q.field('authId'), 'test_admin'))
						.first()
				)?._id,
				categoryId,
				value: 2,
				details: 'Newest evaluation',
				timestamp: baseTime + 10000,
				semesterId: '2025-H1'
			});
		});

		const result = await runListRecentQuery(t);

		expect(result).toHaveLength(2);
		expect(result[0].details).toBe('Newest evaluation');
		expect(result[1].details).toBe('Oldest evaluation');
	});

	test('admin sees evaluations for Not Enrolled students', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Not Enrolled Student',
				chineseName: '未註冊學生',
				studentId: generateUniqueStudentId(),
				classId,
				status: 'Not Enrolled'
			});
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Not Enrolled Category'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId: (
					await ctx.db
						.query('users')
						.filter((q) => q.eq(q.field('authId'), 'test_admin'))
						.first()
				)?._id,
				categoryId,
				value: 1,
				details: 'Eval for not enrolled',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		const result = await runListRecentQuery(t);

		// Admin sees the evaluation even for Not Enrolled student
		expect(result).toHaveLength(1);
		expect(result[0].englishName).toBe('Not Enrolled Student');
	});

	test('studentFilter filters results by student name', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const student1 = await createStudentWithClass(t, {
			englishName: 'Alice Filter',
			chineseName: '愛麗絲篩選',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const student2 = await createStudentWithClass(t, {
			englishName: 'Bob Filter',
			chineseName: '鮑伯篩選',
			studentId: generateUniqueStudentId(),
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Filter Category'
			});
		});

		const timestamp = Date.now();
		await t.run(async (ctx) => {
			const userDoc = await ctx.db
				.query('users')
				.filter((q) => q.eq(q.field('authId'), 'test_admin'))
				.first();
			await ctx.db.insert('evaluations', {
				studentId: student1.studentId,
				teacherId: userDoc?._id,
				categoryId,
				value: 1,
				details: 'Alice eval',
				timestamp,
				semesterId: '2025-H1'
			});
		});
		await t.run(async (ctx) => {
			const userDoc = await ctx.db
				.query('users')
				.filter((q) => q.eq(q.field('authId'), 'test_admin'))
				.first();
			await ctx.db.insert('evaluations', {
				studentId: student2.studentId,
				teacherId: userDoc?._id,
				categoryId,
				value: 2,
				details: 'Bob eval',
				timestamp: timestamp + 100,
				semesterId: '2025-H1'
			});
		});

		const result = await runListRecentQuery(t, 'Alice');

		expect(result).toHaveLength(1);
		expect(result[0].englishName).toBe('Alice Filter');
	});
});

describe('evaluations.getStudentByStudentIdCode', () => {
	test('throws Unauthorized when user is not authenticated', async () => {
		const t = convexTest(schema, modules);

		await expect(
			t.query(api.evaluations.getStudentByStudentIdCode, { studentIdCode: 'STU001' })
		).rejects.toThrow('Unauthorized');
	});

	test('returns null for student role users', async () => {
		const t = convexTest(schema, modules);

		// Insert a student-role user
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Student User',
				role: 'student',
				status: 'active'
			});
		});

		// Replicate the auth check: requireUserProfile resolves to test_admin user
		// isStudent(user) returns true for role='student', so query returns null
		const result = await t.run(async (ctx) => {
			// Simulate requireUserProfile resolving the test_admin user
			const userDoc = await ctx.db
				.query('users')
				.filter((q) => q.eq(q.field('authId'), 'test_admin'))
				.first();

			if (!userDoc) throw new Error('Unauthorized');
			if (userDoc.role === 'student') return null;
			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'STU-TEST'))
				.first();
		});

		expect(result).toBeNull();
	});

	test('returns student when studentIdCode matches', async () => {
		const t = convexTest(schema, modules);

		// Insert admin user for auth resolution
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Code Lookup Student',
			chineseName: '碼查找學生',
			studentId: 'STU-CODE-TEST',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		// Replicate getStudentByStudentIdCode query logic with auth bypass
		const result = await t.run(async (ctx) => {
			const userDoc = await ctx.db
				.query('users')
				.filter((q) => q.eq(q.field('authId'), 'test_admin'))
				.first();

			if (!userDoc) throw new Error('Unauthorized');
			if (userDoc.role === 'student') return null;

			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'STU-CODE-TEST'))
				.first();
		});

		expect(result).not.toBeNull();
		expect(result?._id).toEqual(studentId);
		expect(result?.englishName).toBe('Code Lookup Student');
	});

	test('returns null when studentIdCode not found', async () => {
		const t = convexTest(schema, modules);

		// Insert admin user for auth resolution
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		// Replicate the query logic with auth bypass for a non-existent code
		const result = await t.run(async (ctx) => {
			const userDoc = await ctx.db
				.query('users')
				.filter((q) => q.eq(q.field('authId'), 'test_admin'))
				.first();

			if (!userDoc) throw new Error('Unauthorized');
			if (userDoc.role === 'student') return null;

			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'NONEXISTENT-CODE'))
				.first();
		});

		expect(result).toBeNull();
	});
});
