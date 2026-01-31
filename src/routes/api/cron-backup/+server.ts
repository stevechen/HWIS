import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

export async function GET() {
	try {
		if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
			return new Response(JSON.stringify({ success: false, error: 'Missing Google credentials' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const convexUrl = env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
		const response = await fetch(`${convexUrl}/api/query/backup.js:exportData`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ args: {} })
		});

		if (!response.ok) {
			throw new Error(`Convex query failed: ${response.status}`);
		}

		const data = await response.json();
		const backup = { exportedAt: new Date().toISOString(), version: '1.0', ...data };

		const filename = `backup-${new Date().toISOString().split('T')[0]}.json`;
		const fileContent = JSON.stringify(backup, null, 2);

		const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
		auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
		const drive = google.drive({ version: 'v3', auth });

		const folderId = env.GOOGLE_DRIVE_FOLDER_ID ?? '';
		const fileMetadata: any = { name: filename };
		if (folderId) fileMetadata.parents = [folderId];

		const uploadResponse = await drive.files.create({
			requestBody: fileMetadata,
			media: { mimeType: 'application/json', body: fileContent },
			fields: 'id,createdTime'
		});

		const fileId = uploadResponse.data?.id;
		if (fileId) {
			await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
		}

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
