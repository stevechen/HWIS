import { ConvexHttpClient } from 'convex/browser';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// Use local Convex for e2e tests (matches the site proxy port)
const CONVEX_URL = process.env.CONVEX_URL || 'http://127.0.0.1:3210';

// Get auth options based on current context
function getAuthOptions(): { auth?: string } {
	// First check environment variable (set by useRole() in Playwright tests)
	if (process.env.CONVEX_AUTH_TOKEN) {
		return { auth: process.env.CONVEX_AUTH_TOKEN };
	}
	if (typeof window !== 'undefined') {
		try {
			const convexAuth = localStorage.getItem('convexAuth');
			if (convexAuth) {
				const authData = JSON.parse(convexAuth);
				if (authData.token) {
					return { auth: authData.token };
				}
			}
		} catch {
			// Ignore localStorage errors
		}
	}
	return {};
}

// Create a fresh Convex client with current auth options
function createConvexClient() {
	return new ConvexHttpClient(CONVEX_URL, getAuthOptions());
}

// Singleton instance
let client: ReturnType<typeof createConvexClient> | null = null;

function getClient(): ReturnType<typeof createConvexClient> {
	if (!client) {
		client = createConvexClient();
	}
	return client;
}

// Force refresh the client with current auth options
export function refreshClient(): void {
	client = createConvexClient();
}

export interface CreateStudentOptions {
	studentId: string;
	englishName?: string;
	chineseName?: string;
	grade: number; // Required - grade level (7-12)
	class?: string; // Optional - class number (defaults to '1')
	isIB?: boolean;
	status?: string;
	e2eTag?: string;
}

export interface CreateCategoryOptions {
	name?: string;
	e2eTag?: string;
	casAlignment?: ('Creativity' | 'Activity' | 'Service')[];
	meritCriteria?: string[];
	demeritCriteria?: string[];
}

export interface CreateClassOptions {
	grade: number;
	class: string;
	homeroomTeacherId?: string;
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

export interface SetupTestUsersResult {
	teacherSessionToken?: string;
	adminSessionToken?: string;
	superSessionToken?: string;
	expiresAt?: number;
	error?: string;
}

// Data types a teardown call can be scoped to (mirrors the lifecycle module).
export type CleanupScope =
	| 'students'
	| 'categories'
	| 'evaluations'
	| 'houseEvents'
	| 'backups'
	| 'auditLogs'
	| 'all';

export interface E2EUtils {
	seedAll: () => Promise<void>;
	seedCategoriesForDelete: () => Promise<unknown>;
	seedStudentsForDisable: () => Promise<void>;
	seedAuditLogs: (authId?: string) => Promise<{ success: boolean; error?: string }>;
	cleanupTestData: (tag: string) => Promise<unknown>;
	cleanupAllE2eTaggedData: () => Promise<unknown>;
	cleanupByTag: (dataType: CleanupScope, e2eTag: string) => Promise<unknown>;
	cleanupAllHouseEvents: () => Promise<unknown>;
	seedBaseline: () => Promise<SeedBaselineResult>;
	cleanupTestUsers: () => Promise<unknown>;
	cleanupAuditLogs: (authIdString?: string) => Promise<unknown>;
	setupTestUsers: () => Promise<SetupTestUsersResult>;
	cleanupTestBackupsByTimestamp: (since: number) => Promise<unknown>;
	createStudent: (opts: CreateStudentOptions) => Promise<unknown>;
	createStudentWithId: (opts: CreateStudentOptions) => Promise<unknown>;
	createClass: (opts: CreateClassOptions) => Promise<unknown>;
	setE2eTag: (
		dataType: 'students' | 'categories' | 'evaluations',
		dataId: string,
		e2eTag: string
	) => Promise<unknown>;
	createCategory: (opts?: CreateCategoryOptions) => Promise<unknown>;
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
	const c = getClient();

	return {
		async seedAll() {
			try {
				await c.mutation(api.testE2E.e2eSeedAll, {});
			} catch {
				console.log('Seed all error');
			}
		},

		async seedCategoriesForDelete() {
			try {
				const result = await c.mutation(api.testE2E.e2eSeedCategoriesForDelete, {});
				console.log('Seed categories for delete result:', result);
				return result;
			} catch {
				console.log('Seed categories for delete error');
				return { error: 'Error' };
			}
		},

		async seedStudentsForDisable() {
			try {
				await c.mutation(api.testE2E.e2eSeedStudentsForDisable, {});
			} catch {
				console.log('Seed students for disable error');
			}
		},

		async seedAuditLogs(authId?: string): Promise<{ success: boolean; error?: string }> {
			try {
				await c.mutation(api.testE2E.e2eSeedAuditLogs, { authId });
				return { success: true };
			} catch (e) {
				console.log('Seed audit logs error:', e);
				return { success: false, error: String(e) };
			}
		},

		async cleanupTestData(tag: string) {
			return await c.mutation(api.testLifecycle.teardownByTag, { e2eTag: tag });
		},

		async cleanupAllE2eTaggedData() {
			return await c.mutation(api.testLifecycle.teardownAllTagged, {});
		},

		async cleanupByTag(dataType: CleanupScope, e2eTag: string) {
			return await c.mutation(api.testLifecycle.teardownByTag, {
				scope: dataType,
				e2eTag
			});
		},

		async cleanupAllHouseEvents() {
			return await c.mutation(api.testLifecycle.teardownAllHouseEvents, {});
		},

		async seedBaseline(): Promise<SeedBaselineResult> {
			try {
				const result = await c.mutation(api.dataFactory.seedBaseline, {});
				console.log('Seed baseline result:', result);
				return result;
			} catch {
				console.log('Seed baseline error');
				return { success: false, timestamp: Date.now() };
			}
		},

		async cleanupTestUsers() {
			return await c.mutation(api.testLifecycle.teardownTestUsers, {});
		},

		async cleanupAuditLogs(authIdString?: string) {
			// Without an authIdString this hits the untagged-audit-log adapter
			// (logs with no e2eTag plus default_user's). With one it scopes to
			// that performer's tagged logs and removes the performer user.
			return await c.mutation(api.testLifecycle.teardownByTag, {
				scope: 'auditLogs',
				...((authIdString && { e2eTag: authIdString }) ?? {})
			});
		},

		async setupTestUsers(): Promise<SetupTestUsersResult> {
			try {
				const result = await c.mutation(api.testSetup.setupTestUsers, {});
				console.log('Setup test users result:', result);
				return result as SetupTestUsersResult;
			} catch (e) {
				console.error('Setup test users error:', e);
				return { error: 'Error' };
			}
		},

		async cleanupTestBackupsByTimestamp(since: number) {
			return await c.mutation(api.testLifecycle.teardownBackupsByTimestamp, { since });
		},

		async createStudent(opts: CreateStudentOptions) {
			try {
				return await c.mutation(api.dataFactory.createStudent, {
					...opts
				});
			} catch {
				console.log('Create student error');
				return { error: 'Error' };
			}
		},

		async createClass(opts: CreateClassOptions) {
			try {
				return await c.mutation(api.classes.create, {
					grade: opts.grade,
					class: opts.class,
					homeroomTeacherId: opts.homeroomTeacherId
						? (opts.homeroomTeacherId as Id<'users'>)
						: undefined
				});
			} catch (e) {
				console.log('Create class error:', e);
				return { error: e instanceof Error ? e.message : String(e) };
			}
		},

		async createStudentWithId(opts: CreateStudentOptions) {
			try {
				return await c.mutation(api.dataFactory.createStudentWithId, {
					englishName: opts.englishName,
					chineseName: opts.chineseName,
					studentId: opts.studentId,
					grade: opts.grade,
					class: opts.class,
					status: opts.status,
					e2eTag: opts.e2eTag
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
				return await c.mutation(api.dataFactory.setE2eTag, {
					dataType,
					dataId,
					e2eTag
				});
			} catch (e) {
				console.log('Set e2eTag error:', e);
				return { error: e instanceof Error ? e.message : String(e) };
			}
		},

		async createCategory(opts?: CreateCategoryOptions) {
			try {
				return await c.mutation(api.dataFactory.createCategory, {
					...(opts || {})
				});
			} catch {
				console.log('Create category error');
				return { error: 'Error' };
			}
		},

		async createEvalForCategory(categoryName: string) {
			try {
				const result = await c.mutation(api.testE2E.e2eCreateEvaluationForCategory, {
					categoryName
				});
				console.log('Create evaluation for category result:', result);
				return result;
			} catch {
				console.log('Create evaluation for category error');
				return { error: 'Error' };
			}
		},

		async checkEvaluationExists(categoryId: string) {
			try {
				return await c.query(api.testE2E.e2eCheckEvaluationExists, {
					categoryId: categoryId as Id<'point_categories'>
				});
			} catch {
				console.log('Check evaluation exists error');
				return { error: 'Error' };
			}
		},

		async createEvaluationForStudent(data: CreateEvaluationForStudentData) {
			try {
				return await c.mutation(api.dataFactory.createEvaluationForStudent, {
					...data
				});
			} catch (e) {
				console.log('Create evaluation for student error:', e);
				return { error: e instanceof Error ? e.message : String(e) };
			}
		},

		async setRoleByEmail(email: string, role: string) {
			try {
				return await c.mutation(api.users.setRoleByEmail, {
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
				return await c.mutation(api.onboarding.setMyRole, {
					role: role as 'teacher' | 'admin' | 'super'
				});
			} catch {
				console.log('Set my role error');
				return { error: 'Error' };
			}
		},

		async setRoleByToken(token: string, role: string) {
			try {
				return await c.mutation(api.users.setRoleByToken, {
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
				const result = await c.mutation(api.testData.weeklyReports.createWeeklyReportTestData, {
					tag: tag || undefined
				});
				console.log('Create weekly report test data result:', result);
				return result;
			} catch {
				console.log('Create weekly report test data error');
				return { error: 'Error' };
			}
		},

		async cleanupWeeklyReportTestData(tag?: string) {
			return await c.mutation(api.testLifecycle.teardownByTag, {
				scope: 'all',
				e2eTag: tag || 'weekly-reports-test'
			});
		}
	};
}
