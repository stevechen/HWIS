import { test } from '../fixtures';
import { AdminStudentsPage } from '../pages';
import { getTestSuffix, getTestStudentId } from '../helpers';
import { createCategory, useRole } from '../convex-client';

test.describe('Admin Students page (prototype)', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('proto');
	const categoryName = `Cat_${suffix}`;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createCategory({ name: categoryName, e2eTag: `e2e-test_${suffix}` });
		const studentsPage = new AdminStudentsPage(page);
		await studentsPage.goto();
	});

	test('creates a student', async ({ page }) => {
		const studentsPage = new AdminStudentsPage(page);
		const studentId = getTestStudentId('create');
		const englishName = `Create_${suffix}`;

		await studentsPage.addStudent({ studentId, englishName, chineseName: '創建' });
		await studentsPage.expectStudentVisible(studentId, englishName);
	});

	test('edits a student', async ({ page }) => {
		const studentsPage = new AdminStudentsPage(page);
		const studentId = getTestStudentId('edit');
		const englishName = `ToEdit_${suffix}`;
		await studentsPage.addStudent({ studentId, englishName, chineseName: '可編輯' });

		const updatedName = `Updated_${suffix}`;
		await studentsPage.editStudent(studentId, { englishName: updatedName });
		await studentsPage.expectStudentVisible(studentId, updatedName);
	});

	test('deletes a student', async ({ page }) => {
		const studentsPage = new AdminStudentsPage(page);
		const studentId = getTestStudentId('delete');
		const englishName = `ToDelete_${suffix}`;
		await studentsPage.addStudent({ studentId, englishName, chineseName: '可刪除' });
		await studentsPage.deleteStudent(studentId);
	});
});
