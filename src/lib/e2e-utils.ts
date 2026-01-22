import { ConvexHttpClient } from 'convex/browser';
import { api } from '$convex/_generated/api';

const CONVEX_URL = 'https://cool-buffalo-717.convex.cloud';

export interface CreateStudentOptions {
	studentId: string;
	englishName?: string;
	chineseName?: string;
	grade?: number;
	status?: string;
	e2eTag?: string;
}

export interface CreateCategoryOptions {
	name?: string;
	subCategories?: string[];
	e2eTag?: string;
}

export interface CreateCategoryWithSubsOptions {
	name: string;
	subCategories: string[];
	e2eTag?: string;
}

export interface CreateEvaluationForStudentData {
	studentId: string;
	e2eTag?: string;
}

export interface SeedBaselineResult {
	success: boolean;
	timestamp: number;
}

export interface CleanupResult {
	success?: boolean;
	deleted?: number;
	deletedOrphanedUsers?: number;
	error?: string;
	tag?: string;
	timestamp?: number;
}

export interface E2EUtils {
	resetAll: () => Promise<void>;
	resetCategoriesAndEvals: () => Promise<void>;
	seedAll: () => Promise<void>;
	clearAuditOnly: () => Promise<void>;
	seedCategoriesForDelete: () => Promise<any>;
	seedStudentsForDisable: () => Promise<void>;
	seedAuditLogs: (authId?: string) => Promise<void>;
	cleanupAll: () => Promise<CleanupResult>;
	cleanupTestData: (tag: string) => Promise<CleanupResult>;
	seedBaseline: () => Promise<SeedBaselineResult>;
	cleanupTestUsers: () => Promise<CleanupResult>;
	cleanupAuditLogs: () => Promise<CleanupResult>;
	createStudent: (opts?: CreateStudentOptions) => Promise<any>;
	createStudentWithId: (opts: CreateStudentOptions) => Promise<any>;
	createCategory: (opts?: CreateCategoryOptions) => Promise<any>;
	createCategoryWithSubs: (opts: CreateCategoryWithSubsOptions) => Promise<any>;
	createEvalForCategory: (categoryName: string) => Promise<any>;
	checkEvaluationExists: (categoryName: string) => Promise<any>;
	createEvaluationForStudent: (data: CreateEvaluationForStudentData) => Promise<any>;
	setRoleByEmail: (email: string, role: string) => Promise<any>;
	setMyRole: (role: string) => Promise<any>;
	setRoleByToken: (token: string, role: string) => Promise<any>;
}

export function getE2EUtils(): E2EUtils {
	const client = new ConvexHttpClient(CONVEX_URL);

	return {
		async resetAll() {
			try {
				await client.mutation(api.testE2E.e2eResetAll, {});
			} catch {
				console.log('Reset all error');
			}
		},

		async resetCategoriesAndEvals() {
			try {
				await client.mutation(api.testE2E.e2eResetCategoriesAndEvals, {});
			} catch {
				console.log('Reset categories and evals error');
			}
		},

		async seedAll() {
			try {
				await client.mutation(api.testE2E.e2eSeedAll, {});
			} catch {
				console.log('Seed all error');
			}
		},

		async clearAuditOnly() {
			try {
				await client.mutation(api.testE2E.e2eClearAuditOnly, {});
			} catch {
				console.log('Clear audit error');
			}
		},

		async seedCategoriesForDelete() {
			try {
				const result = await client.mutation(api.testE2E.e2eSeedCategoriesForDelete, {});
				console.log('Seed categories for delete result:', result);
				return result;
			} catch {
				console.log('Seed categories for delete error');
				return { error: 'Error' };
			}
		},

		async seedStudentsForDisable() {
			try {
				await client.mutation(api.testE2E.e2eSeedStudentsForDisable, {});
			} catch {
				console.log('Seed students for disable error');
			}
		},

		async seedAuditLogs(authId?: string) {
			try {
				await client.mutation(api.testE2E.e2eSeedAuditLogs, { authId });
			} catch {
				console.log('Seed audit logs error');
			}
		},

		async cleanupAll(): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.dataFactory.cleanupAll, {});
				console.log('Cleanup all result:', result);
				return result;
			} catch {
				console.log('Cleanup all error');
				return { error: 'Error' };
			}
		},

		async cleanupTestData(tag: string): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.dataFactory.cleanupAll, { tag });
				console.log('Cleanup test data result:', result);
				return result;
			} catch {
				console.log('Cleanup test data error');
				return { error: 'Error' };
			}
		},

		async seedBaseline(): Promise<SeedBaselineResult> {
			try {
				const result = await client.mutation(api.dataFactory.seedBaseline, {});
				console.log('Seed baseline result:', result);
				return result;
			} catch {
				console.log('Seed baseline error');
				return { success: false, timestamp: Date.now() };
			}
		},

		async cleanupTestUsers(): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.testCleanup.cleanupAllTestUsers, {});
				console.log('Cleanup test users result:', result);
				return result;
			} catch {
				console.log('Cleanup test users error');
				return { error: 'Error' };
			}
		},

		async cleanupAuditLogs(): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.testCleanup.cleanupAuditLogs, {});
				console.log('Cleanup audit logs result:', result);
				return result;
			} catch {
				console.log('Cleanup audit logs error');
				return { error: 'Error' };
			}
		},

		async createStudent(opts?: CreateStudentOptions) {
			try {
				return await client.mutation(api.dataFactory.createStudent, opts || {});
			} catch {
				console.log('Create student error');
				return { error: 'Error' };
			}
		},

		async createStudentWithId(opts: CreateStudentOptions) {
			try {
				return await client.mutation(api.dataFactory.createStudentWithId, opts);
			} catch {
				console.log('Create student with ID error');
				return { error: 'Error' };
			}
		},

		async createCategory(opts?: CreateCategoryOptions) {
			try {
				return await client.mutation(api.dataFactory.createCategory, opts || {});
			} catch {
				console.log('Create category error');
				return { error: 'Error' };
			}
		},

		async createCategoryWithSubs(opts: CreateCategoryWithSubsOptions) {
			try {
				return await client.mutation(api.dataFactory.createCategoryWithSubs, opts);
			} catch {
				console.log('Create category with subs error');
				return { error: 'Error' };
			}
		},

		async createEvalForCategory(categoryName: string) {
			try {
				const result = await client.mutation(api.testE2E.e2eCreateEvaluationForCategory, {
					categoryName
				});
				console.log('Create evaluation for category result:', result);
				return result;
			} catch {
				console.log('Create evaluation for category error');
				return { error: 'Error' };
			}
		},

		async checkEvaluationExists(categoryName: string) {
			try {
				return await client.query(api.testE2E.e2eCheckEvaluationExists, { categoryName });
			} catch {
				console.log('Check evaluation exists error');
				return { error: 'Error' };
			}
		},

		async createEvaluationForStudent(data: CreateEvaluationForStudentData) {
			try {
				return await client.mutation(api.dataFactory.createEvaluationForStudent, data);
			} catch {
				console.log('Create evaluation for student error');
				return { error: 'Error' };
			}
		},

		async setRoleByEmail(email: string, role: string) {
			try {
				return await client.mutation(api.users.setRoleByEmail, { email, role: role as any });
			} catch {
				console.log('Set role by email error');
				return { error: 'Error' };
			}
		},

		async setMyRole(role: string) {
			try {
				return await client.mutation(api.onboarding.setMyRole, { role: role as any });
			} catch {
				console.log('Set my role error');
				return { error: 'Error' };
			}
		},

		async setRoleByToken(token: string, role: string) {
			try {
				return await client.mutation(api.users.setRoleByToken, { token, role: role as any });
			} catch {
				console.log('Set role by token error');
				return { error: 'Error' };
			}
		}
	};
}
