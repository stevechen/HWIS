import { ConvexHttpClient } from 'convex/browser';
import { api, internal } from '$convex/_generated/api';

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
			} catch (e) {
				console.log('Reset all error:', e);
			}
		},

		async resetCategoriesAndEvals() {
			try {
				await client.mutation(api.testE2E.e2eResetCategoriesAndEvals, {});
			} catch (e) {
				console.log('Reset categories and evals error:', e);
			}
		},

		async seedAll() {
			try {
				await client.mutation(api.testE2E.e2eSeedAll, {});
			} catch (e) {
				console.log('Seed all error:', e);
			}
		},

		async clearAuditOnly() {
			try {
				await client.mutation(api.testE2E.e2eClearAuditOnly, {});
			} catch (e) {
				console.log('Clear audit error:', e);
			}
		},

		async seedCategoriesForDelete() {
			try {
				const result = await client.mutation(api.testE2E.e2eSeedCategoriesForDelete, {});
				console.log('Seed categories for delete result:', result);
				return result;
			} catch (e) {
				console.log('Seed categories for delete error:', e);
				return { error: String(e) };
			}
		},

		async seedStudentsForDisable() {
			try {
				await client.mutation(api.testE2E.e2eSeedStudentsForDisable, {});
			} catch (e) {
				console.log('Seed students for disable error:', e);
			}
		},

		async seedAuditLogs(authId?: string) {
			try {
				await client.mutation(api.testE2E.e2eSeedAuditLogs, { authId });
			} catch (e) {
				console.log('Seed audit logs error:', e);
			}
		},

		async cleanupAll(): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.dataFactory.cleanupAll, {});
				console.log('Cleanup all result:', result);
				return result;
			} catch (e) {
				console.log('Cleanup all error:', e);
				return { error: String(e) };
			}
		},

		async cleanupTestData(tag: string): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.dataFactory.cleanupAll, { tag });
				console.log('Cleanup test data result:', result);
				return result;
			} catch (e) {
				console.log('Cleanup test data error:', e);
				return { error: String(e) };
			}
		},

		async seedBaseline(): Promise<SeedBaselineResult> {
			try {
				const result = await client.mutation(api.dataFactory.seedBaseline, {});
				console.log('Seed baseline result:', result);
				return result;
			} catch (e) {
				console.log('Seed baseline error:', e);
				return { success: false, timestamp: Date.now() };
			}
		},

		async cleanupTestUsers(): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.testCleanup.cleanupAllTestUsers, {});
				console.log('Cleanup test users result:', result);
				return result;
			} catch (e) {
				console.log('Cleanup test users error:', e);
				return { error: String(e) };
			}
		},

		async cleanupAuditLogs(): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.testCleanup.cleanupAuditLogs, {});
				console.log('Cleanup audit logs result:', result);
				return result;
			} catch (e) {
				console.log('Cleanup audit logs error:', e);
				return { error: String(e) };
			}
		},

		async createStudent(opts?: CreateStudentOptions) {
			try {
				return await client.mutation(api.dataFactory.createStudent, opts || {});
			} catch (e) {
				console.log('Create student error:', e);
				return { error: String(e) };
			}
		},

		async createStudentWithId(opts: CreateStudentOptions) {
			try {
				return await client.mutation(api.dataFactory.createStudentWithId, opts);
			} catch (e) {
				console.log('Create student with ID error:', e);
				return { error: String(e) };
			}
		},

		async createCategory(opts?: CreateCategoryOptions) {
			try {
				return await client.mutation(api.dataFactory.createCategory, opts || {});
			} catch (e) {
				console.log('Create category error:', e);
				return { error: String(e) };
			}
		},

		async createCategoryWithSubs(opts: CreateCategoryWithSubsOptions) {
			try {
				return await client.mutation(api.dataFactory.createCategoryWithSubs, opts);
			} catch (e) {
				console.log('Create category with subs error:', e);
				return { error: String(e) };
			}
		},

		async createEvalForCategory(categoryName: string) {
			try {
				const result = await client.mutation(api.testE2E.e2eCreateEvaluationForCategory, {
					categoryName
				});
				console.log('Create evaluation for category result:', result);
				return result;
			} catch (e) {
				console.log('Create evaluation for category error:', e);
				return { error: String(e) };
			}
		},

		async checkEvaluationExists(categoryName: string) {
			try {
				return await client.query(api.testE2E.e2eCheckEvaluationExists, { categoryName });
			} catch (e) {
				console.log('Check evaluation exists error:', e);
				return { error: String(e) };
			}
		},

		async createEvaluationForStudent(data: CreateEvaluationForStudentData) {
			try {
				return await client.mutation(api.dataFactory.createEvaluationForStudent, data);
			} catch (e) {
				console.log('Create evaluation for student error:', e);
				return { error: String(e) };
			}
		},

		async setRoleByEmail(email: string, role: string) {
			try {
				return await client.mutation(api.users.setRoleByEmail, { email, role: role as any });
			} catch (e) {
				console.log('Set role by email error:', e);
				return { error: String(e) };
			}
		},

		async setMyRole(role: string) {
			try {
				return await client.mutation(api.onboarding.setMyRole, { role: role as any });
			} catch (e) {
				console.log('Set my role error:', e);
				return { error: String(e) };
			}
		},

		async setRoleByToken(token: string, role: string) {
			try {
				return await client.mutation(api.users.setRoleByToken, { token, role: role as any });
			} catch (e) {
				console.log('Set role by token error:', e);
				return { error: String(e) };
			}
		}
	};
}
