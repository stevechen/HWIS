import { google } from 'googleapis';
import { env } from '$env/dynamic/private';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { api } from '$convex/_generated/api';
import { getConvexUrlFromToken } from '$lib/server/convex-url';
import type { RequestEvent } from '@sveltejs/kit';

type BackupExportPayload = {
	students?: unknown[];
	evaluations?: unknown[];
	users?: unknown[];
	categories?: unknown[];
};

async function isAdminRequest(event: RequestEvent): Promise<boolean> {
	if (!event.locals.token) {
		return false;
	}

	try {
		const convexUrl = getConvexUrlFromToken(
			event.locals.token,
			env.CONVEX_URL || env.PUBLIC_CONVEX_URL
		);
		const client = createConvexHttpClient({
			token: event.locals.token,
			convexUrl
		});
		const viewer = await client.query(api.users.viewer, {});
		return viewer?.role === 'admin' || viewer?.role === 'super';
	} catch {
		return false;
	}
}

async function fetchBackupDataForCron(): Promise<BackupExportPayload> {
	const convexUrl = env.PUBLIC_CONVEX_URL || env.CONVEX_URL || 'http://127.0.0.1:3210';
	const response = await fetch(`${convexUrl}/api/query/backup.js:exportDataForCron`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ args: { cronSecret: env.CRON_SECRET || '' } })
	});

	if (!response.ok) {
		throw new Error(`Convex query failed: ${response.status}`);
	}

	return (await response.json()) as BackupExportPayload;
}

async function fetchBackupDataForAdmin(token: string): Promise<BackupExportPayload> {
	const convexUrl = getConvexUrlFromToken(token, env.CONVEX_URL || env.PUBLIC_CONVEX_URL);
	const client = createConvexHttpClient({
		token,
		convexUrl
	});
	return (await client.query(api.backup.exportData, {})) as BackupExportPayload;
}

export async function GET(event: RequestEvent) {
	try {
		if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
			return new Response(JSON.stringify({ success: false, error: 'Missing Google credentials' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const authHeader = event.request.headers.get('authorization');
		const isCronRequest = !!env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`;
		const isAdmin = await isAdminRequest(event);
		if (!isCronRequest && !isAdmin) {
			return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const data = isCronRequest
			? await fetchBackupDataForCron()
			: await fetchBackupDataForAdmin(event.locals.token!);
		const backup = { exportedAt: new Date().toISOString(), version: '1.0', ...data };

		const filename = `backup-${new Date().toISOString().split('T')[0]}.json`;
		const fileContent = JSON.stringify(backup, null, 2);

		const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
		auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
		const drive = google.drive({ version: 'v3', auth });

		const folderId = env.GOOGLE_DRIVE_FOLDER_ID ?? '';
		const fileMetadata: { name: string; parents?: string[] } = { name: filename };
		if (folderId) fileMetadata.parents = [folderId];

		const uploadResponse = await drive.files.create({
			requestBody: fileMetadata,
			media: { mimeType: 'application/json', body: fileContent },
			fields: 'id,createdTime'
		});

		const fileId = uploadResponse.data?.id;

		return new Response(
			JSON.stringify({
				success: true,
				filename,
				fileId,
				stats: {
					students: data.students?.length ?? 0,
					evaluations: data.evaluations?.length ?? 0,
					users: data.users?.length ?? 0,
					categories: data.categories?.length ?? 0
				}
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('Backup error:', error);
		return new Response(
			JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : String(error)
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}
