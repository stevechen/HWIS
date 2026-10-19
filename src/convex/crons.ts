import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Every department has its own nightly archive and its own heartbeat. They are
// separate cron entries rather than one run that does both, so a failure in one
// department cannot suppress or mislabel the other's snapshot.
crons.daily(
	'daily-drive-backup-hwis',
	{ hourUTC: 20, minuteUTC: 0 },
	internal.driveBackup.scheduledBackup,
	{ department: 'international' }
);

crons.daily(
	'daily-drive-backup-esl',
	{ hourUTC: 20, minuteUTC: 15 },
	internal.driveBackup.scheduledBackup,
	{ department: 'esl' }
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

export default crons;
