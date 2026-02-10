import { ConvexHttpClient } from 'convex/browser';
import { api } from '$convex/_generated/api';

// Use local Convex for e2e tests (matches the site proxy port)
const CONVEX_URL = process.env.CONVEX_URL || 'http://127.0.0.1:3210';

// Test token for e2e authentication (works with both local and cloud Convex)
const TEST_TOKEN = 'unit-test-token';

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

export interface SetupTestUsersResult {
	teacherSessionToken?: string;
	adminSessionToken?: string;
	superSessionToken?: string;
	expiresAt?: number;
	error?: string;
}

export interface E2EUtils {
	resetAll: () => Promise<void>;
	resetCategoriesAndEvals: () => Promise<void>;
	seedAll: () => Promise<void>;
	clearAuditOnly: () => Promise<void>;
	seedCategoriesForDelete: () => Promise<unknown>;
	seedStudentsForDisable: () => Promise<void>;
	seedAuditLogs: (authId?: string) => Promise<void>;
	cleanupAll: () => Promise<CleanupResult>;
	cleanupTestData: (tag: string) => Promise<CleanupResult>;
	cleanupByTag: (
		dataType: 'students' | 'categories' | 'evaluations' | 'all',
		e2eTag: string
	) => Promise<CleanupResult>;
	seedBaseline: () => Promise<SeedBaselineResult>;
	cleanupTestUsers: () => Promise<CleanupResult>;
	cleanupAuditLogs: (authIdString?: string) => Promise<CleanupResult>;
	setupTestUsers: () => Promise<SetupTestUsersResult>;
	createStudent: (opts?: CreateStudentOptions) => Promise<unknown>;
	createStudentWithId: (opts: CreateStudentOptions) => Promise<unknown>;
	setE2eTag: (
		dataType: 'students' | 'categories' | 'evaluations',
		dataId: string,
		e2eTag: string
	) => Promise<unknown>;
	createCategory: (opts?: CreateCategoryOptions) => Promise<unknown>;
	createCategoryWithSubs: (opts: CreateCategoryWithSubsOptions) => Promise<unknown>;
	createEvalForCategory: (categoryName: string) => Promise<unknown>;
	checkEvaluationExists: (categoryName: string) => Promise<unknown>;
	createEvaluationForStudent: (data: CreateEvaluationForStudentData) => Promise<unknown>;
	setRoleByEmail: (email: string, role: string) => Promise<unknown>;
	setMyRole: (role: string) => Promise<unknown>;
	setRoleByToken: (token: string, role: string) => Promise<unknown>;
	createWeeklyReportTestData: (tag?: string) => Promise<unknown>;
	cleanupWeeklyReportTestData: (tag?: string) => Promise<unknown>;
}

export function getE2EUtils(): E2EUtils {
	// Get convex auth token from browser's localStorage if available (for e2e tests)
	let authToken: string | undefined;
	if (typeof window !== 'undefined') {
		try {
			const convexAuth = localStorage.getItem('convexAuth');
			if (convexAuth) {
				const authData = JSON.parse(convexAuth);
				authToken = authData.token;
			}
		} catch {
			// Ignore localStorage errors
		}
	}

	// Only pass auth option if we have a token
	const clientOptions = authToken ? { auth: authToken } : {};
	const client = new ConvexHttpClient(CONVEX_URL, clientOptions);

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
				const result = await client.mutation(api.dataFactory.cleanupAll, { testToken: TEST_TOKEN });
				console.log('Cleanup all result:', result);
				return result;
			} catch {
				console.log('Cleanup all error');
				return { error: 'Error' };
			}
		},

		async cleanupTestData(tag: string): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.dataFactory.cleanupAll, {
					tag,
					testToken: TEST_TOKEN
				});
				console.log('Cleanup test data result:', result);
				return result;
			} catch {
				console.log('Cleanup test data error');
				return { error: 'Error' };
			}
		},

		async cleanupByTag(
			dataType: 'students' | 'categories' | 'evaluations' | 'all',
			e2eTag: string
		): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.testCleanup.cleanupByTag, {
					dataType,
					e2eTag,
					testToken: TEST_TOKEN
				});
				console.log('Cleanup by tag result:', result);
				return result;
			} catch {
				console.log('Cleanup by tag error');
				return { error: 'Error' };
			}
		},

		async seedBaseline(): Promise<SeedBaselineResult> {
			try {
				const result = await client.mutation(api.dataFactory.seedBaseline, {
					testToken: TEST_TOKEN
				});
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

		async cleanupAuditLogs(authIdString?: string): Promise<CleanupResult> {
			try {
				const result = await client.mutation(api.testCleanup.cleanupAuditLogs, { authIdString });
				console.log('Cleanup audit logs result:', result);
				return result;
			} catch {
				console.log('Cleanup audit logs error');
				return { error: 'Error' };
			}
		},

		async setupTestUsers(): Promise<SetupTestUsersResult> {
			try {
				const result = await client.mutation(api.testSetup.setupTestUsers, {});
				console.log('Setup test users result:', result);
				return result as SetupTestUsersResult;
			} catch {
				console.log('Setup test users error');
				return { error: 'Error' };
			}
		},

		async createStudent(opts?: CreateStudentOptions) {
			try {
				return await client.mutation(api.dataFactory.createStudent, {
					...(opts || {}),
					testToken: TEST_TOKEN
				});
			} catch {
				console.log('Create student error');
				return { error: 'Error' };
			}
		},

		async createStudentWithId(opts: CreateStudentOptions) {
			try {
				return await client.mutation(api.dataFactory.createStudentWithId, {
					...opts,
					testToken: TEST_TOKEN
				});
			} catch (e) {
				console.log('Create student with ID error:', e);
				return { error: e instanceof Error ? e.message : String(e) };
			}
		},

		async setE2eTag(
			dataType: 'students' | 'categories' | 'evaluations',
			dataId: string,
			e2eTag: string
		) {
			try {
				return await client.mutation(api.dataFactory.setE2eTag, {
					dataType,
					dataId,
					e2eTag,
					testToken: TEST_TOKEN
				});
			} catch (e) {
				console.log('Set e2eTag error:', e);
				return { error: e instanceof Error ? e.message : String(e) };
			}
		},

		async createCategory(opts?: CreateCategoryOptions) {
			try {
				return await client.mutation(api.dataFactory.createCategory, {
					...(opts || {}),
					testToken: TEST_TOKEN
				});
			} catch {
				console.log('Create category error');
				return { error: 'Error' };
			}
		},

		async createCategoryWithSubs(opts: CreateCategoryWithSubsOptions) {
			try {
				return await client.mutation(api.dataFactory.createCategoryWithSubs, {
					...opts,
					testToken: TEST_TOKEN
				});
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
				return await client.mutation(api.dataFactory.createEvaluationForStudent, {
					...data,
					testToken: TEST_TOKEN
				});
			} catch (e) {
				console.log('Create evaluation for student error:', e);
				return { error: e instanceof Error ? e.message : String(e) };
			}
		},

		async setRoleByEmail(email: string, role: string) {
			try {
				return await client.mutation(api.users.setRoleByEmail, {
					email,
					role: role as 'teacher' | 'admin' | 'super'
				});
			} catch {
				console.log('Set role by email error');
				return { error: 'Error' };
			}
		},

		async setMyRole(role: string) {
			try {
				return await client.mutation(api.onboarding.setMyRole, {
					role: role as 'teacher' | 'admin' | 'super'
				});
			} catch {
				console.log('Set my role error');
				return { error: 'Error' };
			}
		},

		async setRoleByToken(token: string, role: string) {
			try {
				return await client.mutation(api.users.setRoleByToken, {
					token,
					role: role as 'teacher' | 'admin' | 'super'
				});
			} catch {
				console.log('Set role by token error');
				return { error: 'Error' };
			}
		},

		async createWeeklyReportTestData(tag?: string) {
			try {
				const result = await client.mutation(
					api.testData.weeklyReports.createWeeklyReportTestData,
					{ tag: tag || undefined }
				);
				console.log('Create weekly report test data result:', result);
				return result;
			} catch {
				console.log('Create weekly report test data error');
				return { error: 'Error' };
			}
		},

		async cleanupWeeklyReportTestData(tag?: string) {
			try {
				const result = await client.mutation(
					api.testData.weeklyReports.cleanupWeeklyReportTestData,
					{ tag: tag || undefined }
				);
				console.log('Cleanup weekly report test data result:', result);
				return result;
			} catch {
				console.log('Cleanup weekly report test data error');
				return { error: 'Error' };
			}
		}
	};
}
