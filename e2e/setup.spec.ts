import { test as setup, expect } from './fixtures';
import { setupTestUsers, seedBaseline } from './convex-client';
import { teardownAllTagged, teardownTestUsers } from './recovery-client';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStorageState, buildContextCookies } from './session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setup('seed test data and verify setup', async ({ page }) => {
	// Clear all tagged test data and seed fresh baseline
	await teardownAllTagged();
	await seedBaseline();

	// Clean up old test users first to avoid accumulation
	await teardownTestUsers();

	const setupResult = await setupTestUsers();
	expect(setupResult?.adminSessionToken).toBeTruthy();
	expect(setupResult?.teacherSessionToken).toBeTruthy();
	expect(setupResult?.superSessionToken).toBeTruthy();
	// The ESL department's own admin. `/esl/admin` needs `departmentRoles.esl`,
	// which only an existing ESL admin can grant, so it is provisioned with the
	// rest rather than from a captured browser login.
	expect(setupResult?.eslAdminSessionToken).toBeTruthy();

	const authDir = path.join(__dirname, '.auth');
	await mkdir(authDir, { recursive: true });
	const adminStorage = await buildStorageState(setupResult.adminSessionToken as string);
	const teacherStorage = await buildStorageState(setupResult.teacherSessionToken as string);
	const superStorage = await buildStorageState(setupResult.superSessionToken as string);
	const eslAdminStorage = await buildStorageState(setupResult.eslAdminSessionToken as string);

	await writeFile(path.join(authDir, 'admin.json'), JSON.stringify(adminStorage, null, 2));
	await writeFile(path.join(authDir, 'teacher.json'), JSON.stringify(teacherStorage, null, 2));
	await writeFile(path.join(authDir, 'super.json'), JSON.stringify(superStorage, null, 2));
	await writeFile(path.join(authDir, 'esladmin.json'), JSON.stringify(eslAdminStorage, null, 2));

	await page
		.context()
		.addCookies(await buildContextCookies(setupResult.adminSessionToken as string));

	await expect(adminStorage.cookies.length).toBeGreaterThan(0);
	await expect(teacherStorage.cookies.length).toBeGreaterThan(0);
	await expect(superStorage.cookies.length).toBeGreaterThan(0);
	await expect(eslAdminStorage.cookies.length).toBeGreaterThan(0);
});
