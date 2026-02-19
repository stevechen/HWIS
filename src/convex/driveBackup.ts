'use node';

import { action } from './_generated/server';
import { anyApi } from 'convex/server';
import type { Doc } from './_generated/dataModel';

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

export const backupToDrive = action({
	args: {},
	handler: async (ctx) => {
		const viewer = (await ctx.runQuery(anyApi.users.viewer, {})) as { role?: string } | null;
		if (!viewer || (viewer.role !== 'admin' && viewer.role !== 'super')) {
			throw new Error('Forbidden');
		}

		const cronSecret = process.env.CRON_SECRET;
		if (!cronSecret) {
			throw new Error('CRON_SECRET is not configured');
		}
		const exportDataFn = anyApi.backup.exportDataForCron;
		const exportData = (await ctx.runQuery(exportDataFn, { cronSecret })) as {
			students: Doc<'students'>[];
			evaluations: Doc<'evaluations'>[];
			users: Doc<'users'>[];
			categories: Doc<'point_categories'>[];
		};
		const {
			students: studentData,
			evaluations,
			users,
			categories
		} = exportData;

		const backup = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			students: studentData,
			evaluations,
			users,
			categories
		};

		const filename = `backup-${new Date().toISOString().split('T')[0]}.json`;
		const fileContent = JSON.stringify(backup, null, 2);

		const accessToken = await getAccessToken();
		const { fileId, createdTime } = await uploadToDrive(accessToken, fileContent, filename);

		return {
			success: true,
			filename,
			fileId,
			createdTime,
			stats: {
				students: studentData.length,
				evaluations: evaluations.length,
				users: users.length,
				categories: categories.length
			}
		};
	}
});
