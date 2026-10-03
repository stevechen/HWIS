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
 * Neither name is set automatically inside a Convex deployment. `CONVEX_DEPLOYMENT`
 * is read by the CLI at build time to decide *where* to push; it is not a runtime
 * env var on the deployment, so a function reading `process.env.CONVEX_DEPLOYMENT`
 * there sees nothing. `NODE_ENV=production` is set on the deployment and is the
 * only reliable built-in signal that this is prod.
 *
 * So prod is recognised two ways, in order:
 *
 *  1. `NODE_ENV === 'production'` — what Convex sets on a production deployment.
 *     Checked first so a prod backup works with no configuration at all, because
 *     a missing env var must never be the reason the archive goes dark.
 *  2. `BACKUP_DEPLOYMENT` / `CONVEX_DEPLOYMENT` — an explicit `prod:`-prefixed
 *     name, for runtimes that are not the Convex backend (the Vercel cron route)
 *     and for deployments where `NODE_ENV` is customised.
 *
 * `BACKUP_DEPLOYMENT` can never promote a non-prod deployment to prod: it is set
 * per environment, and is only honoured when it names `prod:` explicitly. An
 * unrecognised environment stays `unknown` and is refused, which is the safe
 * direction — the cost of guessing wrong is a silent upload into the production
 * folder, and the cost of guessing "unknown" is one loud log line.
 */
export function resolveDriveEnvironmentFromEnv(env: {
	CONVEX_DEPLOYMENT?: string;
	BACKUP_DEPLOYMENT?: string;
	NODE_ENV?: string;
}): DriveEnvironment {
	if (env.NODE_ENV === 'production') return 'prod';
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

// How a deployment proves it may write to Drive.
//
// A service account is the intended credential: it authenticates with a private
// key, never expires, needs no consent screen, and does not stop working when the
// person who created it leaves. The user-refresh-token path is kept only as a
// migration bridge, because it silently dies on a 7-day clock while the OAuth
// consent screen sits in Testing status (`refresh_token_expires_in: 604799`) —
// which is exactly how the Drive archive went a month without an upload while the
// database backups looked perfectly healthy.
//
// Do not "fix" a dead refresh token by minting another one under a Testing consent
// screen. It will fail again within a week, silently. Migrate to the service
// account instead.

export type DriveCredential =
	| {
			kind: 'service_account';
			email: string;
			privateKey: string;
	  }
	| {
			kind: 'user_refresh_token';
			clientId: string;
			clientSecret: string;
			refreshToken: string;
	  };

/**
 * Full `drive`, not `drive.file`. `drive.file` grants access only to files the
 * app itself created, which is a useful least-privilege choice for a user token
 * but leaves a service account unable to write into a folder its human owner
 * created and merely shared. Since the backup folder is exactly such a folder,
 * the broader scope is required — bounded in practice by sharing the folder with
 * this one service account and nothing else.
 */
export const DRIVE_SERVICE_ACCOUNT_SCOPES = ['https://www.googleapis.com/auth/drive'];

function normalizePrivateKey(key: string): string {
	// A PEM pasted into an env var, or set through a JSON key file, usually keeps
	// its newlines escaped as literal "\n". google-auth-library signs the JWT with
	// this string, and a broken PEM fails with an opaque parse error rather than
	// saying "your newlines are escaped" — so they are unescaped here.
	return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

/**
 * Which credential this deployment has, preferring the service account.
 *
 * Returns null when neither is configured, so the caller can report a missing
 * credential rather than half-configured one.
 */
export function resolveDriveCredential(env: {
	GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
	GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	GOOGLE_REFRESH_TOKEN?: string;
}): DriveCredential | null {
	const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
	const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
	if (email && privateKey) {
		return { kind: 'service_account', email, privateKey: normalizePrivateKey(privateKey) };
	}

	const clientId = env.GOOGLE_CLIENT_ID?.trim();
	const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
	const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim();
	if (clientId && clientSecret && refreshToken) {
		return { kind: 'user_refresh_token', clientId, clientSecret, refreshToken };
	}

	return null;
}

/**
 * What is missing when no credential resolves, named explicitly so an operator
 * reading a cron failure knows which env vars to set.
 */
export function describeMissingDriveCredential(env: {
	GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
	GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
}): string {
	return env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
		? 'Missing Google service account credentials: GOOGLE_SERVICE_ACCOUNT_EMAIL is set but GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is empty'
		: 'Missing Google credentials: set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (preferred), or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN';
}
