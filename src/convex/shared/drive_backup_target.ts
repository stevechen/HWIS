// Which Drive backup an upload is allowed to reach, and what it is called there.
//
// The daily cron runs on every deployment, and the Google OAuth credentials plus
// `GOOGLE_DRIVE_FOLDER_ID` were shared between local/dev and prod. That let a local
// cron run drop a file named `backup-YYYY-MM-DD.json` next to the real one in the
// production folder — Drive allows duplicate names, so nothing overwrote anything
// and the two files became indistinguishable during an incident.
//
// The fix has two halves, and this module owns the Drive half:
//   1. Off prod, an upload is refused unless the deployment explicitly opts in,
//      and even then it is only ever addressed to that deployment's own folder.
//   2. Every filename carries its environment, so a misconfiguration that still
//      reaches the production folder is recognizable at a glance instead of
//      hiding behind an identical name.
//
// This is deliberately pure. `auth.isProdDeployment` reads the same variable once
// at module load, which is the right default for the app but useless for a
// decision made inside a Node action (and untestable without re-importing the
// module). The deployment name is therefore re-read per call and normalized here.
//
// Backup sources and restore permissions are owned by ADR-0009 / ADR-0012 and are
// deliberately untouched by this module.

export type DriveEnvironment = 'prod' | 'dev' | 'local' | 'unknown';

/** Mirrors the classification in `auth.isProdDeployment`, per call. */
export function resolveDriveEnvironment(deployment: string | undefined): DriveEnvironment {
	const name = (deployment ?? '').trim();
	if (name.startsWith('prod:')) return 'prod';
	if (name.startsWith('dev:')) return 'dev';
	if (name.includes('local')) return 'local';
	return 'unknown';
}

/**
 * `<env>` is in every filename, on every deployment including prod, so a file that
 * reaches the wrong folder is identifiable without opening it. An unrecognised
 * deployment is labelled `unknown` rather than being passed through: a deployment
 * name is attacker-irrelevant here, and a free-form string in a filename is worse
 * than a useless one.
 */
export function buildDriveBackupFilename(environment: DriveEnvironment, now: Date): string {
	const day = now.toISOString().split('T')[0];
	return `backup-${environment}-${day}.json`;
}

/**
 * The deployment to classify, from the env vars that might name it.
 *
 * `CONVEX_DEPLOYMENT` is the app-wide convention and is what the Convex backend
 * has. `BACKUP_DEPLOYMENT` exists for runtimes that are *not* the Convex backend —
 * the Vercel cron route in `src/routes/api/cron-backup/+server.ts` — where nothing
 * sets `CONVEX_DEPLOYMENT`. Without it that route would classify as `unknown` and
 * refuse every upload, including on production, so the name is declared explicitly
 * rather than inferred.
 *
 * Falling back to `BACKUP_DEPLOYMENT` cannot make a non-prod deployment look like
 * prod: it is set per environment, and the alternative — guessing prod from a
 * hostname — is exactly the kind of inference that let the original bug through.
 */
export function resolveDriveEnvironmentFromEnv(env: {
	CONVEX_DEPLOYMENT?: string;
	BACKUP_DEPLOYMENT?: string;
}): DriveEnvironment {
	return resolveDriveEnvironment(env.CONVEX_DEPLOYMENT ?? env.BACKUP_DEPLOYMENT);
}

export type DriveUploadDecision =
	| { allowed: true; environment: DriveEnvironment; reason?: undefined }
	| { allowed: false; environment: DriveEnvironment; reason: string };

/**
 * Prod uploads unconditionally — that is the archive the 5-year records
 * obligation rests on. Off prod, uploading is opt-in via
 * `ALLOW_NONPROD_DRIVE_BACKUP=true`, which a deployment only sets once it has a
 * scratch `GOOGLE_DRIVE_FOLDER_ID` of its own.
 */
export function decideDriveUpload(options: {
	environment: DriveEnvironment;
	nonProdUploadOptIn: boolean;
	folderId?: string;
}): DriveUploadDecision {
	const { environment, nonProdUploadOptIn, folderId } = options;
	if (environment === 'prod') return { allowed: true, environment };

	if (!nonProdUploadOptIn) {
		return {
			allowed: false,
			environment,
			reason: `not a production deployment and ALLOW_NONPROD_DRIVE_BACKUP is not set, so the upload was skipped instead of writing into a folder this deployment may not own`
		};
	}

	if (!folderId) {
		return {
			allowed: false,
			environment,
			reason:
				'ALLOW_NONPROD_DRIVE_BACKUP is set but GOOGLE_DRIVE_FOLDER_ID is empty, so there is no folder this deployment can be trusted to own'
		};
	}

	return { allowed: true, environment };
}
