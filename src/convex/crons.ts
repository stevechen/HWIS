import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
	'daily-drive-backup',
	{ hourUTC: 20, minuteUTC: 0 },
	internal.driveBackup.scheduledBackup,
	{}
);

crons.daily(
	'daily-retention-prune',
	{ hourUTC: 21, minuteUTC: 0 },
	internal.backup.runPruneExpiredBackups,
	{}
);

// Watchdog for the Drive archive (issue #151). Runs at 23:17 UTC — hours after the
// 20:00 backup — so a nightly run has had time to finish or fail before this
// judges it. Off the top of the hour to avoid the busiest minute. Throws when no
// backup has succeeded within the stale window, which surfaces in the dashboard
// logs view; the admin banner is the primary signal.
crons.daily(
	'backup-freshness-watchdog',
	{ hourUTC: 23, minuteUTC: 17 },
	internal.backupWatchdog.checkBackupFreshness,
	{}
);
// Safety-net cron: event-driven refreshes (scheduled by evaluation mutations)
// keep snapshots fresh within ~45s of a write; this slow cron only heals
// anything that slipped past (e.g. direct data changes outside the app).
crons.interval(
	'leaderboard-snapshot-refresh',
	{ minutes: 30 },
	internal.board_snapshots.refreshAll,
	{}
);

// Safety net: force a full rebuild nightly in case an evaluation edit slipped
// past the watermark (edits that keep count + max timestamp unchanged).
crons.daily(
	'leaderboard-snapshot-rebuild',
	{ hourUTC: 21, minuteUTC: 30 },
	internal.board_snapshots.refreshAll,
	{ force: true }
);

// Weekly report counts (ADR-0022). The event-driven refresh skips itself when
// the audit trail shows nothing newer than the stored rows, so this cron runs
// unconditionally: it refreshes the recent three weeks (healing writes that
// bypass the app inside that window, such as cascades or restores) and
// bootstraps a full chunked backfill when any completed week is missing. Weeks
// outside the recent window heal on the nightly rebuild below.
crons.interval(
	'weekly-report-snapshot-refresh',
	{ minutes: 30 },
	internal.weekly_report_snapshots.cronRefresh,
	{}
);

// Nightly self-heal for the rolling 52-week window. Chained in bounded slices
// so a single execution never approaches the document-read ceiling.
crons.daily(
	'weekly-report-snapshot-rebuild',
	{ hourUTC: 21, minuteUTC: 45 },
	internal.weekly_report_snapshots.startRebuild,
	{}
);

export default crons;
