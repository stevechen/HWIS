import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { authComponent, requireAdminForSensitiveOperation } from './auth';

// Core infrastructure users that are shared across parallel tests and have
// valid storageState; they must never be deleted by any teardown path.
const PROTECTED_EMAILS = new Set(['teacher@hwis.test', 'admin@hwis.test', 'super@hwis.test']);

// AuthIds created by the test seeding mutations (dataFactory, testE2E, etc.).
const TEST_AUTH_ID_PREFIXES = ['e2e_', 'e2e-', 'test_', 'eval_', 'e2e-test_'];
const TEST_AUTH_IDS = new Set([
	'test-user-id',
	'test_admin',
	'default_user',
	'e2e_teacher1',
	'e2e_teacher2'
]);

const SCOPE = v.union(
	v.literal('students'),
	v.literal('categories'),
	v.literal('evaluations'),
	v.literal('houseEvents'),
	v.literal('backups'),
	v.literal('auditLogs'),
	v.literal('all')
);

function getE2ETag(): string {
	return `e2e-test_${Date.now().toString().slice(-6)}`;
}

function isTestEmail(email?: string): boolean {
	return Boolean(email && (email.includes('test') || email.includes('hwis.test')));
}

function bump(deleted: Record<string, number>, table: string, count: number): void {
	deleted[table] = (deleted[table] ?? 0) + count;
}

async function deleteStudentsByTag(
	ctx: MutationCtx,
	e2eTag: string,
	deleted: Record<string, number>
): Promise<Id<'students'>[]> {
	const students = await ctx.db
		.query('students')
		.withIndex('by_e2eTag', (q) => q.eq('e2eTag', e2eTag))
		.collect();
	const ids = students.map((s) => s._id);
	for (const id of ids) {
		await ctx.db.delete(id);
	}
	if (ids.length > 0) bump(deleted, 'students', ids.length);
	return ids;
}

async function deleteEvaluationsByTag(
	ctx: MutationCtx,
	e2eTag: string,
	studentIds: Id<'students'>[],
	deleted: Record<string, number>
): Promise<Id<'evaluations'>[]> {
	const ids = new Set<Id<'evaluations'>>();
	const tagged = await ctx.db
		.query('evaluations')
		.withIndex('by_e2eTag', (q) => q.eq('e2eTag', e2eTag))
		.collect();
	for (const evaluation of tagged) ids.add(evaluation._id);
	for (const studentId of studentIds) {
		const dependents = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', studentId))
			.collect();
		for (const evaluation of dependents) ids.add(evaluation._id);
	}
	for (const id of ids) {
		await ctx.db.delete(id);
	}
	if (ids.size > 0) bump(deleted, 'evaluations', ids.size);
	return [...ids];
}

async function deleteAuditLogsByTag(
	ctx: MutationCtx,
	e2eTag: string,
	studentIds: Id<'students'>[],
	evaluationIds: Id<'evaluations'>[],
	deleted: Record<string, number>
): Promise<void> {
	const ids = new Set<Id<'audit_logs'>>();
	const tagged = await ctx.db
		.query('audit_logs')
		.withIndex('by_e2eTag', (q) => q.eq('e2eTag', e2eTag))
		.collect();
	for (const log of tagged) ids.add(log._id);
	for (const evaluationId of evaluationIds) {
		const logs = await ctx.db
			.query('audit_logs')
			.withIndex('by_target', (q) =>
				q.eq('targetTable', 'evaluations').eq('targetId', evaluationId)
			)
			.collect();
		for (const log of logs) ids.add(log._id);
	}
	for (const studentId of studentIds) {
		const logs = await ctx.db
			.query('audit_logs')
			.withIndex('by_target', (q) => q.eq('targetTable', 'students').eq('targetId', studentId))
			.collect();
		for (const log of logs) ids.add(log._id);
	}
	for (const id of ids) {
		await ctx.db.delete(id);
	}
	if (ids.size > 0) bump(deleted, 'audit_logs', ids.size);
}

async function deleteCategoriesByTag(
	ctx: MutationCtx,
	e2eTag: string,
	deleted: Record<string, number>
): Promise<void> {
	const categories = await ctx.db
		.query('point_categories')
		.withIndex('by_e2eTag', (q) => q.eq('e2eTag', e2eTag))
		.collect();
	for (const category of categories) {
		await ctx.db.delete(category._id);
	}
	if (categories.length > 0) bump(deleted, 'point_categories', categories.length);
}

async function deleteHouseEventsByTag(
	ctx: MutationCtx,
	e2eTag: string,
	deleted: Record<string, number>
): Promise<void> {
	const events = await ctx.db
		.query('house_events')
		.withIndex('by_e2eTag', (q) => q.eq('e2eTag', e2eTag))
		.collect();
	for (const event of events) {
		await ctx.db.delete(event._id);
	}
	if (events.length > 0) bump(deleted, 'house_events', events.length);
}

async function deleteBackupsByTag(
	ctx: MutationCtx,
	e2eTag: string,
	deleted: Record<string, number>
): Promise<void> {
	const backups = await ctx.db
		.query('backups')
		.withIndex('by_e2eTag', (q) => q.eq('e2eTag', e2eTag))
		.collect();
	for (const backup of backups) {
		await ctx.db.delete(backup._id);
	}
	if (backups.length > 0) bump(deleted, 'backups', backups.length);
}

async function deleteUsersByTag(
	ctx: MutationCtx,
	e2eTag: string,
	deleted: Record<string, number>
): Promise<void> {
	const users = await ctx.db.query('users').collect();
	let count = 0;
	for (const user of users) {
		if (user.e2eTag === e2eTag) {
			await ctx.db.delete(user._id);
			count++;
		}
	}
	if (count > 0) bump(deleted, 'users', count);
}

// Removes classes that no longer reference any student after cascade teardown.
async function deleteOrphanedClasses(
	ctx: MutationCtx,
	deleted: Record<string, number>
): Promise<void> {
	const classes = await ctx.db.query('classes').collect();
	let count = 0;
	for (const cls of classes) {
		const studentsInClass = await ctx.db
			.query('students')
			.withIndex('by_classId', (q) => q.eq('classId', cls._id))
			.take(1);
		if (studentsInClass.length === 0) {
			await ctx.db.delete(cls._id);
			count++;
		}
	}
	if (count > 0) bump(deleted, 'classes', count);
}

// Seeded audit logs (no e2eTag) or logs performed by the default_user test user.
async function deleteUntaggedAuditLogs(
	ctx: MutationCtx,
	deleted: Record<string, number>
): Promise<void> {
	const logs = await ctx.db.query('audit_logs').collect();
	const defaultUser = await ctx.db
		.query('users')
		.withIndex('by_authId', (q) => q.eq('authId', 'default_user'))
		.first();
	let count = 0;
	for (const log of logs) {
		if (!log.e2eTag || (defaultUser && log.performerId === defaultUser._id)) {
			await ctx.db.delete(log._id);
			count++;
		}
	}
	if (count > 0) bump(deleted, 'audit_logs', count);
}

// Audit-log performer users created via e2eSeedAuditLogs(testAuthId).
async function deleteTestPerformerUser(
	ctx: MutationCtx,
	e2eTag: string,
	deleted: Record<string, number>
): Promise<void> {
	if (!TEST_AUTH_ID_PREFIXES.some((prefix) => e2eTag.startsWith(prefix))) return;
	const user = await ctx.db
		.query('users')
		.withIndex('by_authId', (q) => q.eq('authId', e2eTag))
		.first();
	if (user) {
		await ctx.db.delete(user._id);
		bump(deleted, 'users', 1);
	}
}

/**
 * Remove every row matching `e2eTag` across the resource graph, cascading to
 * untagged dependents (evaluations and audit logs referencing tagged parents).
 * `scope` narrows teardown to a single data type. Cascade order is
 * deterministic: students → evaluations → audit_logs → point_categories →
 * house_events → backups → users → orphaned classes.
 */
export const teardownByTag = mutation({
	args: {
		scope: v.optional(SCOPE),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const scope = args.scope ?? 'all';
		const e2eTag = args.e2eTag ?? getE2ETag();
		const hasTag = args.e2eTag !== undefined;
		const deleted: Record<string, number> = {};
		const isAll = scope === 'all';

		if (scope === 'auditLogs' && !hasTag) {
			await deleteUntaggedAuditLogs(ctx, deleted);
			return { deleted };
		}

		let studentIds: Id<'students'>[] = [];
		let evaluationIds: Id<'evaluations'>[] = [];

		if (isAll || scope === 'students') {
			studentIds = await deleteStudentsByTag(ctx, e2eTag, deleted);
		}
		if (isAll || scope === 'students' || scope === 'evaluations') {
			evaluationIds = await deleteEvaluationsByTag(ctx, e2eTag, studentIds, deleted);
		}
		if (isAll || scope === 'students' || scope === 'evaluations' || scope === 'auditLogs') {
			await deleteAuditLogsByTag(ctx, e2eTag, studentIds, evaluationIds, deleted);
		}
		if (scope === 'auditLogs') {
			await deleteTestPerformerUser(ctx, e2eTag, deleted);
		}
		if (isAll || scope === 'categories') {
			await deleteCategoriesByTag(ctx, e2eTag, deleted);
		}
		if (isAll || scope === 'houseEvents') {
			await deleteHouseEventsByTag(ctx, e2eTag, deleted);
		}
		if (isAll || scope === 'backups') {
			await deleteBackupsByTag(ctx, e2eTag, deleted);
		}
		if (isAll) {
			await deleteUsersByTag(ctx, e2eTag, deleted);
			await deleteOrphanedClasses(ctx, deleted);
		}

		return { deleted };
	}
});

/**
 * Sweep removing any row carrying any `e2eTag` (plus cascaded dependents and
 * orphaned classes). Backs the post-run cleanup job.
 */
export const teardownAllTagged = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const deleted: Record<string, number> = {};

		const studentIds: Id<'students'>[] = [];
		const students = await ctx.db
			.query('students')
			.filter((q) => q.neq(q.field('e2eTag'), undefined))
			.collect();
		for (const student of students) {
			await ctx.db.delete(student._id);
			studentIds.push(student._id);
		}
		if (students.length > 0) bump(deleted, 'students', students.length);

		const evaluationIds = new Set<Id<'evaluations'>>();
		const evaluations = await ctx.db
			.query('evaluations')
			.filter((q) => q.neq(q.field('e2eTag'), undefined))
			.collect();
		for (const evaluation of evaluations) evaluationIds.add(evaluation._id);
		for (const studentId of studentIds) {
			const dependents = await ctx.db
				.query('evaluations')
				.withIndex('by_studentId', (q) => q.eq('studentId', studentId))
				.collect();
			for (const evaluation of dependents) evaluationIds.add(evaluation._id);
		}
		for (const id of evaluationIds) {
			await ctx.db.delete(id);
		}
		if (evaluationIds.size > 0) bump(deleted, 'evaluations', evaluationIds.size);

		const auditIds = new Set<Id<'audit_logs'>>();
		const audits = await ctx.db
			.query('audit_logs')
			.filter((q) => q.neq(q.field('e2eTag'), undefined))
			.collect();
		for (const log of audits) auditIds.add(log._id);
		for (const evaluationId of evaluationIds) {
			const logs = await ctx.db
				.query('audit_logs')
				.withIndex('by_target', (q) =>
					q.eq('targetTable', 'evaluations').eq('targetId', evaluationId)
				)
				.collect();
			for (const log of logs) auditIds.add(log._id);
		}
		for (const studentId of studentIds) {
			const logs = await ctx.db
				.query('audit_logs')
				.withIndex('by_target', (q) => q.eq('targetTable', 'students').eq('targetId', studentId))
				.collect();
			for (const log of logs) auditIds.add(log._id);
		}
		for (const id of auditIds) {
			await ctx.db.delete(id);
		}
		if (auditIds.size > 0) bump(deleted, 'audit_logs', auditIds.size);

		const categories = await ctx.db
			.query('point_categories')
			.filter((q) => q.neq(q.field('e2eTag'), undefined))
			.collect();
		for (const category of categories) {
			await ctx.db.delete(category._id);
		}
		if (categories.length > 0) bump(deleted, 'point_categories', categories.length);

		const events = await ctx.db
			.query('house_events')
			.filter((q) => q.neq(q.field('e2eTag'), undefined))
			.collect();
		for (const event of events) {
			await ctx.db.delete(event._id);
		}
		if (events.length > 0) bump(deleted, 'house_events', events.length);

		const backups = await ctx.db
			.query('backups')
			.filter((q) => q.neq(q.field('e2eTag'), undefined))
			.collect();
		for (const backup of backups) {
			await ctx.db.delete(backup._id);
		}
		if (backups.length > 0) bump(deleted, 'backups', backups.length);

		const users = await ctx.db.query('users').collect();
		let userCount = 0;
		for (const user of users) {
			if (user.e2eTag) {
				await ctx.db.delete(user._id);
				userCount++;
			}
		}
		if (userCount > 0) bump(deleted, 'users', userCount);

		await deleteOrphanedClasses(ctx, deleted);

		return { deleted };
	}
});

/**
 * Delete test users in both Better Auth (sessions/accounts first) and Convex,
 * always preserving the protected infrastructure users.
 */
export const teardownTestUsers = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as Array<{
			id: string;
			email?: string;
		}>;
		const baByAuthId = new Map(baUsers.map((user) => [user.id, user]));
		const deletedBaIds = new Set<string>();
		for (const user of baUsers) {
			if (isTestEmail(user.email) && !PROTECTED_EMAILS.has(user.email || '')) {
				await adapter.deleteMany({
					model: 'session',
					where: [{ field: 'userId', value: user.id }]
				});
				await adapter.deleteMany({
					model: 'account',
					where: [{ field: 'userId', value: user.id }]
				});
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: user.id }] });
				deletedBaIds.add(user.id);
			}
		}

		const convexUsers = await ctx.db.query('users').collect();
		let deletedCount = 0;
		for (const user of convexUsers) {
			const authId = user.authId;
			let hasTestEmail = false;
			if (authId) {
				if (deletedBaIds.has(authId)) {
					hasTestEmail = true;
				} else {
					const baUser = baByAuthId.get(authId);
					if (baUser) {
						if (PROTECTED_EMAILS.has(baUser.email || '')) continue;
						hasTestEmail = isTestEmail(baUser.email);
						if (!hasTestEmail) continue;
					}
				}
			}
			const matchesPrefix = Boolean(
				authId && TEST_AUTH_ID_PREFIXES.some((prefix) => authId.startsWith(prefix))
			);
			const isKnownTestId = Boolean(authId && TEST_AUTH_IDS.has(authId));
			const isOrphaned = !authId || !baByAuthId.has(authId);
			if (matchesPrefix || isKnownTestId || isOrphaned || hasTestEmail) {
				await ctx.db.delete(user._id);
				deletedCount++;
			}
		}

		return { deleted: { users: deletedCount } };
	}
});

/**
 * Delete backups created at or after `since`. Only affects test-created
 * backups — production backups outside the test window are untouched.
 */
export const teardownBackupsByTimestamp = mutation({
	args: {
		since: v.number()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const backups = await ctx.db
			.query('backups')
			.withIndex('by_createdAt')
			.filter((q) => q.gte(q.field('createdAt'), args.since))
			.collect();
		for (const backup of backups) {
			await ctx.db.delete(backup._id);
		}
		return { deleted: { backups: backups.length } };
	}
});

/**
 * Remove every house event (UI-created events carry no e2eTag, so tag-based
 * teardown cannot reach them).
 */
export const teardownAllHouseEvents = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const events = await ctx.db.query('house_events').collect();
		for (const event of events) {
			await ctx.db.delete(event._id);
		}
		return { deleted: { house_events: events.length } };
	}
});

/**
 * Report how many rows still carry `e2eTag` per table. Returns empty once a
 * full teardown has completed.
 */
export const verifyCleanTeardown = query({
	args: {
		e2eTag: v.string()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const remaining: Record<string, number> = {};
		const tables = [
			'students',
			'evaluations',
			'audit_logs',
			'point_categories',
			'house_events',
			'backups',
			'users'
		] as const;
		for (const table of tables) {
			const docs = await ctx.db.query(table).collect();
			const count = docs.filter(
				(doc) => (doc as { e2eTag?: string }).e2eTag === args.e2eTag
			).length;
			if (count > 0) remaining[table] = count;
		}
		return { e2eTag: args.e2eTag, remaining };
	}
});
