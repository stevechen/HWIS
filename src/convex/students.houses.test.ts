import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const invalidId = 'non-existent-id' as unknown as Id<'students'>;

// Type for getHouseStats query result
type HouseStatsData = {
	house: string;
	totalPoints: number;
	studentCount: number;
	pointsByCategory: Record<string, number>;
	topContributors: { studentId: string; englishName: string; totalPoints: number }[];
	growthOpportunities: { studentId: string; englishName: string; pointsLost: number }[];
	rank: number;
};

describe('House Management - listByHouse', () => {
	it('returns empty houses and orphaned when no students exist', async () => {
		const t = convexTest(schema, modules);

		const result = await t.query(api.students.listByHouse, {});

		expect(result.houses).toHaveProperty('Heracles');
		expect(result.houses).toHaveProperty('Wukong');
		expect(result.houses).toHaveProperty('Ixbalam');
		expect(result.houses).toHaveProperty('Setna');

		expect(result.houses.Heracles).toHaveLength(0);
		expect(result.houses.Wukong).toHaveLength(0);
		expect(result.houses.Ixbalam).toHaveLength(0);
		expect(result.houses.Setna).toHaveLength(0);
		expect(result.orphaned).toHaveLength(0);
	});

	it('groups students by house correctly', async () => {
		const t = convexTest(schema, modules);

		// Create students with different houses
		const student1 = await t.mutation(api.students.create, {
			englishName: 'Alice Smith',
			chineseName: '史艾莉',
			studentId: '9001001',
			grade: 9,
			status: 'Enrolled'
		});

		const student2 = await t.mutation(api.students.create, {
			englishName: 'Bob Jones',
			chineseName: '張博博',
			studentId: '9001002',
			grade: 9,
			status: 'Enrolled'
		});

		// Assign houses
		await t.mutation(api.students.assignHouse, {
			studentId: student1,
			house: 'Heracles'
		});

		await t.mutation(api.students.assignHouse, {
			studentId: student2,
			house: 'Wukong'
		});

		const result = await t.query(api.students.listByHouse, {});

		expect(result.houses.Heracles).toHaveLength(1);
		expect(result.houses.Heracles[0].englishName).toBe('Alice Smith');
		expect(result.houses.Wukong).toHaveLength(1);
		expect(result.houses.Wukong[0].englishName).toBe('Bob Jones');
		expect(result.houses.Ixbalam).toHaveLength(0);
		expect(result.houses.Setna).toHaveLength(0);
		expect(result.orphaned).toHaveLength(0);
	});

	it('includes students without house in orphaned list', async () => {
		const t = convexTest(schema, modules);

		// Create students without house
		await t.mutation(api.students.create, {
			englishName: 'Charlie Brown',
			chineseName: '布查理',
			studentId: '9001003',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.create, {
			englishName: 'Diana Prince',
			chineseName: '黛安娜',
			studentId: '9001004',
			grade: 9,
			status: 'Enrolled'
		});

		const result = await t.query(api.students.listByHouse, {});

		expect(result.orphaned).toHaveLength(2);
		const names = result.orphaned.map((s: { englishName: string }) => s.englishName);
		expect(names).toContain('Charlie Brown');
		expect(names).toContain('Diana Prince');
	});

	it('sorts students alphabetically within each house', async () => {
		const t = convexTest(schema, modules);

		// Create students in reverse alphabetical order
		const student1 = await t.mutation(api.students.create, {
			englishName: 'Zack Morris',
			chineseName: '莫扎克',
			studentId: '9001005',
			grade: 9,
			status: 'Enrolled'
		});

		const student2 = await t.mutation(api.students.create, {
			englishName: 'Aaron Baker',
			chineseName: '貝阿倫',
			studentId: '9001006',
			grade: 9,
			status: 'Enrolled'
		});

		const student3 = await t.mutation(api.students.create, {
			englishName: 'Mike Ross',
			chineseName: '羅邁克',
			studentId: '9001007',
			grade: 9,
			status: 'Enrolled'
		});

		// Assign all to same house
		await t.mutation(api.students.assignHouse, {
			studentId: student1,
			house: 'Heracles'
		});
		await t.mutation(api.students.assignHouse, {
			studentId: student2,
			house: 'Heracles'
		});
		await t.mutation(api.students.assignHouse, {
			studentId: student3,
			house: 'Heracles'
		});

		const result = await t.query(api.students.listByHouse, {});

		expect(result.houses.Heracles).toHaveLength(3);
		// Should be sorted alphabetically
		expect(result.houses.Heracles[0].englishName).toBe('Aaron Baker');
		expect(result.houses.Heracles[1].englishName).toBe('Mike Ross');
		expect(result.houses.Heracles[2].englishName).toBe('Zack Morris');
	});

	it('includes class display info for each student', async () => {
		const t = convexTest(schema, modules);

		const student = await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試生',
			studentId: '9001008',
			grade: 10,
			class: '2',
			status: 'Enrolled'
		});

		await t.mutation(api.students.assignHouse, {
			studentId: student,
			house: 'Heracles'
		});

		const result = await t.query(api.students.listByHouse, {});

		expect(result.houses.Heracles[0].classDisplay).toBe('10-2');
	});
});

describe('House Management - assignHouse', () => {
	it('assigns a student to a house', async () => {
		const t = convexTest(schema, modules);

		const student = await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試生',
			studentId: '9001009',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.assignHouse, {
			studentId: student,
			house: 'Ixbalam'
		});

		const result = await t.query(api.students.listByHouse, {});
		expect(result.houses.Ixbalam).toHaveLength(1);
		expect(result.houses.Ixbalam[0]._id).toBe(student);
	});

	it('removes a student from a house when house is undefined', async () => {
		const t = convexTest(schema, modules);

		const student = await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試生',
			studentId: '9001010',
			grade: 9,
			status: 'Enrolled'
		});

		// First assign to a house
		await t.mutation(api.students.assignHouse, {
			studentId: student,
			house: 'Setna'
		});

		let result = await t.query(api.students.listByHouse, {});
		expect(result.houses.Setna).toHaveLength(1);

		// Then remove from house
		await t.mutation(api.students.assignHouse, {
			studentId: student,
			house: undefined
		});

		result = await t.query(api.students.listByHouse, {});
		expect(result.houses.Setna).toHaveLength(0);
		expect(result.orphaned).toHaveLength(1);
	});

	it('moves a student between houses', async () => {
		const t = convexTest(schema, modules);

		const student = await t.mutation(api.students.create, {
			englishName: 'Test Student',
			chineseName: '測試生',
			studentId: '9001011',
			grade: 9,
			status: 'Enrolled'
		});

		// Assign to Heracles
		await t.mutation(api.students.assignHouse, {
			studentId: student,
			house: 'Heracles'
		});

		let result = await t.query(api.students.listByHouse, {});
		expect(result.houses.Heracles).toHaveLength(1);
		expect(result.houses.Wukong).toHaveLength(0);

		// Move to Wukong
		await t.mutation(api.students.assignHouse, {
			studentId: student,
			house: 'Wukong'
		});

		result = await t.query(api.students.listByHouse, {});
		expect(result.houses.Heracles).toHaveLength(0);
		expect(result.houses.Wukong).toHaveLength(1);
	});

	it('throws error when student id is invalid', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.students.assignHouse, {
				studentId: invalidId,
				house: 'Heracles'
			});
		}).rejects.toThrow();
	});
});

describe('House Competition - getHouseStats', () => {
	it('returns house stats with all four houses', async () => {
		const t = convexTest(schema, modules);

		// Create students with houses
		const student1 = await t.mutation(api.students.create, {
			englishName: 'Alice',
			chineseName: '艾莉',
			studentId: '9001001',
			grade: 9,
			status: 'Enrolled'
		});

		const student2 = await t.mutation(api.students.create, {
			englishName: 'Bob',
			chineseName: '博',
			studentId: '9001002',
			grade: 9,
			status: 'Enrolled'
		});

		// Assign houses
		await t.mutation(api.students.assignHouse, {
			studentId: student1,
			house: 'Heracles'
		});

		await t.mutation(api.students.assignHouse, {
			studentId: student2,
			house: 'Wukong'
		});

		const result = await t.query(api.students.getHouseStats, {});

		// Should return data (even without auth in test context)
		expect(result).not.toBeNull();
		expect(result!.houses).toHaveLength(4);

		// Check Heracles has 1 student
		const heracles = result!.houses.find((h: HouseStatsData) => h.house === 'Heracles');
		expect(heracles).toBeDefined();
		expect(heracles!.studentCount).toBe(1);

		// Check Wukong has 1 student
		const wukong = result!.houses.find((h: HouseStatsData) => h.house === 'Wukong');
		expect(wukong).toBeDefined();
		expect(wukong!.studentCount).toBe(1);

		// Check ranking includes both houses
		expect(result!.ranking).toContain('Heracles');
		expect(result!.ranking).toContain('Wukong');
	});

	it('shows correct rank ordering', async () => {
		const t = convexTest(schema, modules);

		// Create a student and assign to a house
		const student = await t.mutation(api.students.create, {
			englishName: 'Test',
			chineseName: '測試',
			studentId: '9003001',
			grade: 9,
			status: 'Enrolled'
		});

		await t.mutation(api.students.assignHouse, {
			studentId: student,
			house: 'Ixbalam'
		});

		const result = await t.query(api.students.getHouseStats, {});

		expect(result).not.toBeNull();
		expect(result!.houses).toHaveLength(4);

		// Each house should have a rank
		for (const house of result!.houses) {
			expect(house.rank).toBeGreaterThanOrEqual(1);
			expect(house.rank).toBeLessThanOrEqual(4);
		}

		// All ranks should be unique
		const ranks = result!.houses.map((h: HouseStatsData) => h.rank);
		expect(new Set(ranks).size).toBe(4);
	});
});
