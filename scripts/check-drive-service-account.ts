import { readFileSync } from 'fs';
import { JWT } from 'google-auth-library';

// Read-only probe: acquire a token with the service account key, then list the
// backup folder. No upload — this proves the credential and the folder share
// before anything is written to the production archive.
const json = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const folderId = process.argv[3];

const auth = new JWT({
	email: json.client_email,
	key: json.private_key,
	scopes: ['https://www.googleapis.com/auth/drive']
});
await auth.authorize();
const result = await auth.getAccessToken();
// v11 returns { token }; v9 and earlier returned a bare string.
const token = typeof result === 'string' ? result : result?.token;
console.log('token acquired:', typeof token === 'string' && token.length > 0);

const res = await fetch(
	`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents`)}&fields=files(name,modifiedTime,size)&pageSize=6&orderBy=modifiedTime desc`,
	{ headers: { Authorization: `Bearer ${token}` } }
);
const body = await res.text();
console.log('folder probe HTTP', res.status);
console.log(body.slice(0, 900));
