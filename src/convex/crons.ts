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
