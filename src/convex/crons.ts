import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
	'daily-drive-backup',
	{ hourUTC: 20, minuteUTC: 0 },
	internal.driveBackup.scheduledBackup,
	{}
);

// Periodic background check that the legacy and indexed pagination paths agree.
// Records any divergence durably to the canary_divergences table so it shows on
// the System Diagnostics page even if no one has the page open.
crons.interval('canary-parity-check', { minutes: 30 }, internal.students.runCanaryCheck, {});

export default crons;
