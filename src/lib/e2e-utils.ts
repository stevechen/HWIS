import { ConvexHttpClient } from 'convex/browser';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

// Use local Convex for e2e tests (matches the site proxy port)
const CONVEX_URL = process.env.CONVEX_URL || 'http://127.0.0.1:3210';

// Get auth options based on current context
function getAuthOptions(): { auth?: string } {
	// First check environment variable (set by useRole() in Playwright tests)
	if (process.env.CONVEX_AUTH_TOKEN) {
		if (process.env.CONVEX_AUTH_TOKEN.split('.').length !== 3) {
			console.log(
				`[E2E-Utils] Skipping invalid CONVEX_AUTH_TOKEN: ${process.env.CONVEX_AUTH_TOKEN.substring(0, 10)}...`
			);
			return {};
		}
		return { auth: process.env.CONVEX_AUTH_TOKEN };
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

export interface CreateHouseEventOptions {
	title: string;
	startDate: number;
	endDate: number;
	housePoints?: { Heracles?: number; Wukong?: number; Ixbalam?: number; Setna?: number };
	e2eTag?: string;
}

export interface CreateEvaluationForStudentData {
	studentId: string;
	e2eTag?: string;
}

export type EslTerm = 'S1' | 'S2';

export type EslEventType =
	| 'start_school'
	| 'reminder'
	| 'no_school'
	| 'no_class'
	| 'partial'
	| 'exam'
	| 'g9_mock';

export type EslReminderKind =
	| 'quiz'
	| 'passport'
	| 'recording'
	| 'task'
	| 'passport_check'
	| 'workbook_check';

export type EslEventTarget = 'all' | 'CLIL' | 'Comm' | 'G7' | 'G8' | 'G9' | 'H1';

export interface CreateEslSemesterOptions {
	year: string;
	term: EslTerm;
	startDate: string;
	e2eTag?: string;
}

export interface CreateEslCohortOptions {
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
	e2eTag?: string;
}

export type EslWeekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

export interface SetEslClassScheduleOptions {
	classId: string;
	year: string;
	meetings: { day: EslWeekday; period: number }[];
}

export interface AssignEslTeacherOptions {
	classId: string;
	teacherId: string;
}

export interface SeedEslSemesterOptions {
	semesterId: string;
	examStarts?: { exam1?: string; exam2?: string; final?: string };
	bbqDate?: string;
	sportsDayDate?: string;
	ceremonyDate?: string;
	springBreakStart?: string;
	springBreakEnd?: string;
	anniversaryDate?: string;
	moonFestivalDate?: string;
	dragonBoatDate?: string;
	e2eTag?: string;
}

export interface CreateEslEventOptions {
	semesterId: string;
	type: EslEventType;
	reminderKind?: EslReminderKind;
	isBanner?: boolean;
	title: string;
	target?: EslEventTarget;
	date: string;
	endDate?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
	e2eTag?: string;
}

export interface UpdateEslEventOptions {
	eventId: string;
	type?: EslEventType;
	reminderKind?: EslReminderKind;
	clearReminderKind?: boolean;
	isBanner?: boolean;
	title?: string;
	target?: EslEventTarget;
	date?: string;
	endDate?: string;
	clearEndDate?: boolean;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
	clearPeriods?: boolean;
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
	createHouseEvent: (opts: CreateHouseEventOptions) => Promise<unknown>;
	seedBaseline: () => Promise<SeedBaselineResult>;
	cleanupTestUsers: () => Promise<unknown>;
	cleanupAuditLogs: (authIdString?: string) => Promise<unknown>;
	setupTestUsers: () => Promise<SetupTestUsersResult>;
	cleanupTestBackupsByTimestamp: (since: number) => Promise<unknown>;
	/** How many `backups` rows currently carry `e2eTag`, for tag-hygiene assertions. */
	countBackupsByTag: (e2eTag: string) => Promise<number>;
	createStudent: (opts: CreateStudentOptions) => Promise<unknown>;
	createStudentWithId: (opts: CreateStudentOptions) => Promise<unknown>;
	seedManyStudents: (opts: {
		count: number;
		grade: number;
		class?: string;
		e2eTag?: string;
	}) => Promise<unknown>;
	createClass: (opts: CreateClassOptions) => Promise<unknown>;
	setE2eTag: (
		dataType: 'students' | 'categories' | 'evaluations',
		dataId: string,
		e2eTag: string
	) => Promise<unknown>;
	tagHouseEventsByTitle: (titlePart: string, e2eTag: string) => Promise<unknown>;
	createCategory: (opts?: CreateCategoryOptions) => Promise<unknown>;
	createEvalForCategory: (categoryName: string) => Promise<unknown>;
	checkEvaluationExists: (categoryName: string) => Promise<unknown>;
	createEvaluationForStudent: (data: CreateEvaluationForStudentData) => Promise<unknown>;
	setRoleByEmail: (email: string, role: string) => Promise<unknown>;
	setMyRole: (role: string) => Promise<unknown>;
	setRoleByToken: (token: string, role: string) => Promise<unknown>;
	createWeeklyReportTestData: (tag?: string) => Promise<unknown>;
	cleanupWeeklyReportTestData: (tag?: string) => Promise<unknown>;
	setEslRoleByEmail: (email: string, eslRole: 'admin' | 'teacher' | null) => Promise<unknown>;
	createEslSemester: (opts: CreateEslSemesterOptions) => Promise<unknown>;
	createEslCohort: (opts: CreateEslCohortOptions) => Promise<{ classIds: string[] }>;
	setEslClassSchedule: (opts: SetEslClassScheduleOptions) => Promise<unknown>;
	assignEslTeacher: (opts: AssignEslTeacherOptions) => Promise<unknown>;
	seedEslSemester: (opts: SeedEslSemesterOptions) => Promise<unknown>;
	createEslEvent: (opts: CreateEslEventOptions) => Promise<unknown>;
	updateEslEvent: (opts: UpdateEslEventOptions) => Promise<unknown>;
	removeEslEvent: (eventId: string) => Promise<unknown>;
	getEslSemester: (semesterId: string) => Promise<unknown>;
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
			const result = await c.mutation(api.testLifecycle.teardownByTag, { e2eTag: tag });
			const verification = await c.query(api.testLifecycle.verifyCleanTeardown, { e2eTag: tag });
			if (Object.keys(verification.remaining).length > 0) {
				throw new Error(`Teardown left tagged rows: ${JSON.stringify(verification.remaining)}`);
			}
			return result;
		},

		async cleanupAllE2eTaggedData() {
			return await c.mutation(api.testLifecycle.teardownAllTagged, {});
		},

		async cleanupByTag(dataType: CleanupScope, e2eTag: string) {
			const result = await c.mutation(api.testLifecycle.teardownByTag, {
				scope: dataType,
				e2eTag
			});
			if (dataType === 'all') {
				const verification = await c.query(api.testLifecycle.verifyCleanTeardown, { e2eTag });
				if (Object.keys(verification.remaining).length > 0) {
					throw new Error(`Teardown left tagged rows: ${JSON.stringify(verification.remaining)}`);
				}
			}
			return result;
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

		async countBackupsByTag(e2eTag: string) {
			return await c.query(api.testLifecycle.countBackupsByTag, { e2eTag });
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
					e2eTag: opts.e2eTag,
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

		async seedManyStudents(opts: {
			count: number;
			grade: number;
			class?: string;
			e2eTag?: string;
		}) {
			try {
				return await c.mutation(api.dataFactory.seedManyStudents, {
					count: opts.count,
					grade: opts.grade,
					class: opts.class,
					e2eTag: opts.e2eTag
				});
			} catch (e) {
				console.log('Seed many students error:', e);
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

		async tagHouseEventsByTitle(titlePart: string, e2eTag: string) {
			return await c.mutation(api.dataFactory.tagHouseEventsByTitle, { titlePart, e2eTag });
		},

		async createHouseEvent(opts: CreateHouseEventOptions) {
			try {
				return await c.mutation(api.houseEvents.create, {
					...opts
				});
			} catch (e) {
				console.log('Create house event error:', e);
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
		},

		async setEslRoleByEmail(email: string, eslRole: 'admin' | 'teacher' | null) {
			return await c.mutation(api.testSetup.setEslRoleByEmail, { email, eslRole });
		},

		async createEslSemester(opts: CreateEslSemesterOptions) {
			return await c.mutation(api.esl.semesters.create, { ...opts });
		},

		async createEslCohort(opts: CreateEslCohortOptions) {
			return (await c.mutation(api.esl.cohorts.create, { ...opts })) as {
				classIds: string[];
			};
		},

		async setEslClassSchedule(opts: SetEslClassScheduleOptions) {
			const { classId, ...rest } = opts;
			return await c.mutation(api.esl.classes.setSchedule, {
				classId: classId as Id<'esl_classes'>,
				...rest
			});
		},

		async assignEslTeacher(opts: AssignEslTeacherOptions) {
			return await c.mutation(api.esl.classes.assignTeacher, {
				id: opts.classId as Id<'esl_classes'>,
				teacherId: opts.teacherId as Id<'users'>
			});
		},

		async seedEslSemester(opts: SeedEslSemesterOptions) {
			const { semesterId, ...rest } = opts;
			return await c.mutation(api.esl.seed.seed, {
				semesterId: semesterId as Id<'esl_semesters'>,
				...rest
			});
		},

		async createEslEvent(opts: CreateEslEventOptions) {
			const { semesterId, ...rest } = opts;
			return await c.mutation(api.esl.events.create, {
				semesterId: semesterId as Id<'esl_semesters'>,
				...rest
			});
		},

		async updateEslEvent(opts: UpdateEslEventOptions) {
			const { eventId, ...rest } = opts;
			return await c.mutation(api.esl.events.update, {
				eventId: eventId as Id<'esl_events'>,
				...rest
			});
		},

		async removeEslEvent(eventId: string) {
			return await c.mutation(api.esl.events.remove, {
				eventId: eventId as Id<'esl_events'>
			});
		},

		async getEslSemester(semesterId: string) {
			return await c.query(api.esl.semesters.get, {
				semesterId: semesterId as Id<'esl_semesters'>
			});
		}
	};
}
