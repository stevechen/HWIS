import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { anyApi, type GenericDatabaseReader } from 'convex/server';
import { requireAdminForSensitiveOperation } from './auth';
import type { DataModel, Doc } from './_generated/dataModel';
import type { Department } from './shared/authorization';
import { BACKUP_DEPARTMENTS, departmentValidator, normalizeDepartment } from './shared/departments';
import {
	assessBackupFreshness,
	formatBackupAge,
	STALE_AFTER_MS,
	type BackupFreshness
} from './shared/drive_backup_target';

type Heartbeat = Doc<'backupHeartbeats'>;

/**
 * Record a successful backup. Called by the Drive upload path *after* Drive
 * returns a file id, so a heartbeat only ever exists for an upload that
 * genuinely landed. Each department's nightly run writes its own row, which is
 * what lets the watchdog judge the two archives independently.
 */
export const recordBackupSuccess = internalMutation({
	args: {
		filename: v.string(),
		environment: v.string(),
		department: v.optional(departmentValidator),
		fileId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('backupHeartbeats', {
			completedAt: Date.now(),
			filename: args.filename,
			environment: args.environment,
			department: normalizeDepartment(args.department),
			fileId: args.fileId
		});
	}
});

/**
 * The most recent successful heartbeat for one department.
 *
 * Legacy rows predate the `department` column and therefore carry no value on
 * the indexed field. For International, those rows are the only history there
 * is, so fall back to the newest unlabelled row rather than reporting "never".
 */
async function findLatestHeartbeat(
	ctx: { db: GenericDatabaseReader<DataModel> },
	department: Department
): Promise<Heartbeat | null> {
	const normalized = normalizeDepartment(department);
	const indexed = await ctx.db
		.query('backupHeartbeats')
		.withIndex('by_department_completedAt', (q) => q.eq('department', normalized))
		.order('desc')
		.first();
	if (indexed) return indexed;
	if (normalized !== 'international') return null;

	const legacy = await ctx.db
		.query('backupHeartbeats')
		.withIndex('by_completedAt')
		.order('desc')
		.collect();
	return legacy.find((row) => row.department === undefined) ?? null;
}

/**
 * `.order('desc').first()` rather than `.last()`: Convex only offers `last()` on
 * an explicitly ordered index, and asking for the newest row is the whole point.
 */
export const latestHeartbeat = internalQuery({
	args: {
		department: v.optional(departmentValidator)
	},
	handler: async (ctx, args) => findLatestHeartbeat(ctx, normalizeDepartment(args.department))
});

type DepartmentFreshness = {
	department: Department;
	freshness: BackupFreshness;
	filename: string | null;
};

async function assessDepartments(
	runQuery: (department: Department) => Promise<Heartbeat | null>,
	now: number
): Promise<DepartmentFreshness[]> {
	return await Promise.all(
		BACKUP_DEPARTMENTS.map(async (department) => {
			const latest = await runQuery(department);
			return {
				department,
				freshness: assessBackupFreshness(latest?.completedAt ?? null, now),
				filename: latest?.filename ?? null
			};
		})
	);
}

/**
 * Backup freshness for the admin banner.
 *
 * Read-only and Drive-free on purpose — see the schema comment on
 * `backupHeartbeats`. An admin sees this on every admin page, so it must answer
 * "is the archive still being maintained" without itself depending on anything
 * that could be the thing that broke.
 *
 * Judges both departments and reports the worst one, so a healthy International
 * archive cannot hide a dark ESL one. Callers that want one department can pass
 * `department`.
 *
 * Gated by the shared admin-area policy, so a non-admin caller cannot read
 * operational metadata. The layout only mounts this inside the admin gate, so
 * the throw never fires for a user who legitimately reaches the page.
 */
export const getBackupFreshness = query({
	args: {
		department: v.optional(departmentValidator)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const requested = args.department === undefined ? null : normalizeDepartment(args.department);
		const departments = await assessDepartments(
			(department) => findLatestHeartbeat(ctx, department),
			Date.now()
		);
		const reported = requested
			? departments.find((entry) => entry.department === requested)!
			: (departments.find((entry) => !entry.freshness.ok) ?? departments[0]);

		return {
			department: reported.department,
			freshness: reported.freshness,
			filename: reported.filename,
			departments
		};
	}
});

/**
 * Watchdog cron: throw when either department's archive is dark.
 *
 * Throwing is deliberate. It surfaces in the Convex dashboard logs view at no
 * extra cost, which is the only alerting Convex provides — there is no built-in
 * email or webhook for cron failures. The admin banner is the primary signal;
 * this is the free second one.
 */
export const checkBackupFreshness = internalAction({
	args: {},
	handler: async (ctx) => {
		const departments = await assessDepartments(async (department) => {
			const latest = (await ctx.runQuery(anyApi.backupWatchdog.latestHeartbeat, {
				department
			})) as Heartbeat | null;
			return latest;
		}, Date.now());

		const failing = departments.filter((entry) => !entry.freshness.ok);
		if (failing.length > 0) {
			const details = failing
				.map((entry) =>
					entry.freshness.ok
						? ''
						: entry.freshness.reason === 'never'
							? `${entry.department}: no successful backup has ever been recorded`
							: `${entry.department}: last successful backup was ${formatBackupAge(
									entry.freshness.ageMs
								)} ago (threshold ${formatBackupAge(STALE_AFTER_MS)})`
				)
				.join('; ');
			throw new Error(`Backup watchdog: ${details}`);
		}

		return { ok: true, departments };
	}
});
