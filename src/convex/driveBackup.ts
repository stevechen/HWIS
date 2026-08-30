'use node';

import { action, internalAction } from './_generated/server';
import { anyApi } from 'convex/server';
import { canAccessAdminArea, type AccessSubject } from './shared/authorization';
import type { BackupSnapshot } from './shared/backup_snapshot';

async function getAccessToken(): Promise<string> {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
	const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

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
	const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

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

async function uploadSnapshotBackup(snapshot: BackupSnapshot) {
	const filename = `backup-${new Date().toISOString().split('T')[0]}.json`;
	const fileContent = JSON.stringify(snapshot, null, 2);
	const accessToken = await getAccessToken();
	const { fileId, createdTime } = await uploadToDrive(accessToken, fileContent, filename);

	return {
		success: true,
		filename,
		fileId,
		createdTime,
		stats: {
			students: snapshot.students.length,
			evaluations: snapshot.evaluations.length,
			users: snapshot.users.length,
			categories: snapshot.categories.length,
			classes: snapshot.classes.length,
			houseEvents: snapshot.houseEvents.length
		}
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

		const cronSecret = process.env.CRON_SECRET;
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
