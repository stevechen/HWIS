import { expect, test } from 'vitest';
import { convexTest, modules } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';

test('evaluations table operations work correctly', async () => {
	const t = convexTest(schema, modules);

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			status: 'Enrolled'
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'test-auth-id',
			name: 'Test Teacher',
			role: 'teacher',
			status: 'active'
		});
	});

	const categoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Creativity',
			subCategories: ['Leadership']
		});
	});

	const evaluationId = await t.run(async (ctx) => {
		return await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 1,
			categoryId,
			subCategory: 'Leadership',
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
			name: 'Responsibility',
			subCategories: ['Punctuality']
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 2,
			categoryId,
			subCategory: 'Punctuality',
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
			name: 'Creativity',
			subCategories: ['Innovation']
		});
	});

	const categoryId2 = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Responsibility',
			subCategories: ['Teamwork']
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacherId1,
			value: 3,
			categoryId: categoryId1,
			subCategory: 'Innovation',
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
			subCategory: 'Teamwork',
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
				name: `Category ${i}`,
				subCategories: ['SubCategory']
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
				subCategory: 'SubCategory',
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
				name: `SortCat ${i}`,
				subCategories: ['SubCategory']
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
				subCategory: 'SubCategory',
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
			name: 'Enrolled Cat',
			subCategories: ['SubCategory']
		});
	});

	const unenrolledCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Unenrolled Cat',
			subCategories: ['SubCategory']
		});
	});

	// Create evaluations for both students
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId: enrolledStudentId,
			teacherId,
			value: 1,
			categoryId: enrolledCategoryId,
			subCategory: 'SubCategory',
			details: 'Enrolled student evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
		await ctx.db.insert('evaluations', {
			studentId: unenrolledStudentId,
			teacherId,
			value: 2,
			categoryId: unenrolledCategoryId,
			subCategory: 'SubCategory',
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
			name: 'Alice Category',
			subCategories: ['SubCategory']
		});
	});

	const bobCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Bob Category',
			subCategories: ['SubCategory']
		});
	});

	// Create evaluations for both students
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId: student1Id,
			teacherId,
			value: 1,
			categoryId: aliceCategoryId,
			subCategory: 'SubCategory',
			details: 'Alice evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
		await ctx.db.insert('evaluations', {
			studentId: student2Id,
			teacherId,
			value: 2,
			categoryId: bobCategoryId,
			subCategory: 'SubCategory',
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
			name: 'Anderson Category',
			subCategories: ['SubCategory']
		});
	});

	const brownCategoryId = await t.run(async (ctx) => {
		return await ctx.db.insert('point_categories', {
			name: 'Brown Category',
			subCategories: ['SubCategory']
		});
	});

	// Create evaluations from both teachers
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacher1Id,
			value: 1,
			categoryId: andersonCategoryId,
			subCategory: 'SubCategory',
			details: 'Anderson evaluation',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacher2Id,
			value: 2,
			categoryId: brownCategoryId,
			subCategory: 'SubCategory',
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
			name: `CursorCat ${i}`,
			subCategories: ['SubCategory']
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
				subCategory: 'SubCategory',
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
			name: 'Original Category Name',
			subCategories: ['SubCategory']
		});
	});

	// Create evaluation with categoryId reference
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 5,
			categoryId,
			subCategory: 'SubCategory',
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
		name: 'Old Category Name',
		subCategories: ['SubCategory']
	});

	// Create evaluation with categoryId reference
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 5,
			categoryId,
			subCategory: 'SubCategory',
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
		name: 'New Category Name',
		subCategories: ['SubCategory']
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
