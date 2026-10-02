'use node';

import { action, internalAction } from './_generated/server';
import { anyApi } from 'convex/server';
import { canAccessAdminArea, type AccessSubject } from './shared/authorization';
import type { BackupSnapshot } from './shared/backup_snapshot';
import {
	buildDriveBackupFilename,
	decideDriveUpload,
	resolveDriveEnvironmentFromEnv,
	type DriveEnvironment
} from './shared/drive_backup_target';

function readEnv(key: string): string | undefined {
	const value = process.env[key]?.trim();
	return value ? value : undefined;
}

function currentEnvironment(): DriveEnvironment {
	return resolveDriveEnvironmentFromEnv({
		CONVEX_DEPLOYMENT: readEnv('CONVEX_DEPLOYMENT')
	});
}

async function getAccessToken(): Promise<string> {
	const clientId = readEnv('GOOGLE_CLIENT_ID');
	const clientSecret = readEnv('GOOGLE_CLIENT_SECRET');
	const refreshToken = readEnv('GOOGLE_REFRESH_TOKEN');

	if (!clientId || !clientSecret || !refreshToken) {
		throw new Error('Missing Google OAuth credentials');
	}

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		})
	});

	const data = await response.json();
	if (!data.access_token) {
		throw new Error('Failed to get access token: ' + JSON.stringify(data));
	}

	return data.access_token;
}

async function uploadToDrive(
	accessToken: string,
	fileContent: string,
	filename: string
): Promise<{ fileId: string; createdTime: string }> {
	const folderId = readEnv('GOOGLE_DRIVE_FOLDER_ID');

	const metadata: { name: string; mimeType: string; parents?: string[] } = {
		name: filename,
		mimeType: 'application/json'
	};
	if (folderId) {
		metadata.parents = [folderId];
	}

	const boundary = '-------314159265358979323846';
	const body = [
		`--${boundary}`,
		'Content-Type: application/json; charset=UTF-8',
		'',
		JSON.stringify(metadata),
		`--${boundary}`,
		'Content-Type: application/json',
		'',
		fileContent,
		`--${boundary}--`
	].join('\r\n');

	const response = await fetch(
		'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': `multipart/related; boundary=${boundary}`
			},
			body
		}
	);

	const data = (await response.json()) as { id?: string; createdTime?: string };
	if (!data.id) {
		throw new Error('Failed to upload to Drive: ' + JSON.stringify(data));
	}

	return { fileId: data.id, createdTime: data.createdTime ?? new Date().toISOString() };
}

function snapshotStats(snapshot: BackupSnapshot) {
	return {
		students: snapshot.students.length,
		evaluations: snapshot.evaluations.length,
		users: snapshot.users.length,
		categories: snapshot.categories.length,
		classes: snapshot.classes.length,
		houseEvents: snapshot.houseEvents.length
	};
}

/**
 * The single place a snapshot reaches Drive, so the environment guard cannot be
 * bypassed by a new caller. A refused upload is reported, not thrown: the
 * in-database `backups` row is the hot archive and is written by the caller
 * regardless, and a cron that throws on every non-prod deployment would bury the
 * real failure in noise.
 */
async function uploadSnapshotBackup(snapshot: BackupSnapshot) {
	const environment = currentEnvironment();
	const decision = decideDriveUpload({
		environment,
		nonProdUploadOptIn: readEnv('ALLOW_NONPROD_DRIVE_BACKUP') === 'true',
		folderId: readEnv('GOOGLE_DRIVE_FOLDER_ID')
	});
	const filename = buildDriveBackupFilename(environment, new Date());

	if (!decision.allowed) {
		console.warn(`[driveBackup] Skipping Drive upload of ${filename}: ${decision.reason}`);
		return {
			success: false as const,
			skipped: true as const,
			filename,
			environment,
			reason: decision.reason,
			stats: snapshotStats(snapshot)
		};
	}

	const fileContent = JSON.stringify(snapshot, null, 2);
	const accessToken = await getAccessToken();
	const { fileId, createdTime } = await uploadToDrive(accessToken, fileContent, filename);

	return {
		success: true as const,
		skipped: false as const,
		filename,
		environment,
		fileId,
		createdTime,
		stats: snapshotStats(snapshot)
	};
}

export const backupToDrive = action({
	args: {},
	handler: async (ctx) => {
		const profile = (await ctx.runQuery(anyApi.users.profile, {})) as {
			user: AccessSubject | null;
			actor: unknown;
			capabilities: unknown;
		};
		if (!profile?.user || !canAccessAdminArea(profile.user)) {
			throw new Error('Forbidden');
		}

		const cronSecret = readEnv('CRON_SECRET');
		if (!cronSecret) {
			throw new Error('CRON_SECRET is not configured');
		}

		const snapshot = (await ctx.runQuery(anyApi.backup.exportDataForCron, {
			cronSecret
		})) as BackupSnapshot;
		return uploadSnapshotBackup(snapshot);
	}
});

export const scheduledBackup = internalAction({
	args: {},
	handler: async (ctx) => {
		const result = await ctx.runMutation(anyApi.backup.createDailyBackup, {});
		return uploadSnapshotBackup(result.snapshot);
	}
});
