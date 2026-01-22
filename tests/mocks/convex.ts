import { vi } from 'vitest';

export interface MockStudent {
	_id: string;
	_creationTime: number;
	englishName: string;
	chineseName: string;
	studentId: string;
	grade: number;
	status: 'Enrolled' | 'Not Enrolled';
	note: string;
}

export interface MockCategory {
	_id: string;
	_creationTime: number;
	name: string;
	subCategories: string[];
}

export interface MockQueryState<T> {
	data: T | undefined;
	loading: boolean;
	error: Error | null;
	isLoading: boolean;
}

export function createMockQuery<T>(
	data: T | undefined,
	loading: boolean = false,
	error: Error | null = null
): MockQueryState<T> {
	return {
		data,
		loading,
		error,
		get isLoading() {
			return this.loading;
		}
	};
}

export const mockStudents: MockStudent[] = [
	{
		_id: 's001',
		_creationTime: Date.now(),
		englishName: 'John Smith',
		chineseName: '強史密斯',
		studentId: 'S001',
		grade: 10,
		status: 'Enrolled',
		note: ''
	},
	{
		_id: 's002',
		_creationTime: Date.now(),
		englishName: 'Jane Doe',
		chineseName: '簡多伊',
		studentId: 'S002',
		grade: 11,
		status: 'Enrolled',
		note: ''
	},
	{
		_id: 's003',
		_creationTime: Date.now(),
		englishName: 'Bob Wilson',
		chineseName: '威爾遜',
		studentId: 'S003',
		grade: 10,
		status: 'Not Enrolled',
		note: ''
	}
];

export const mockCategories: MockCategory[] = [
	{
		_id: 'c001',
		_creationTime: Date.now(),
		name: 'Behavior',
		subCategories: ['Positive Behavior', 'Needs Improvement', 'Special Mention']
	},
	{
		_id: 'c002',
		_creationTime: Date.now(),
		name: 'Academic',
		subCategories: []
	},
	{
		_id: 'c003',
		_creationTime: Date.now(),
		name: 'Participation',
		subCategories: ['Class Discussion', 'Group Work', 'Team Activity']
	}
];

export function createMockConvexHooks(
	students: MockStudent[] = mockStudents,
	categories: MockCategory[] = mockCategories
) {
	return {
		useQuery: vi.fn((_api: Record<string, unknown>) => {
			const queryName = (_api?.name as string) ?? (_api?.function as { name: string })?.name ?? '';
			if (queryName === 'list' && (_api?.parent as { name: string })?.name === 'students') {
				return createMockQuery(students);
			}
			if (queryName === 'list' && (_api?.parent as { name: string })?.name === 'categories') {
				return createMockQuery(categories);
			}
			return createMockQuery(undefined);
		}),
		useConvexClient: vi.fn(() => ({
			mutation: vi.fn(),
			query: vi.fn()
		}))
	};
}
