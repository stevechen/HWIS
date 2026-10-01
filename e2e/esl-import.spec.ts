/**
 * The roster import, driven through the browser by workbooks shaped like the
 * department's real ones.
 *
 * The shapes come from `src/lib/esl-roster-fixtures.ts`, measured against the
 * September 2026 workbooks: per-grade column order, the bare `Pre-Ele` group, the
 * malformed `G9 Elementary1`, the misfiled row, and the summary sheets. The data
 * is synthetic, so no student is ever involved.
 *
 * The counts asserted here are exact, so a sheet dropped or double-counted fails
 * in CI rather than in September.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { cleanupByTag, eslStudentCohorts } from './convex-client';
import { getTestSuffix } from './helpers';
import {
	rosterWorkbookBuffer,
	misfiledSchoolStudentId,
	DUPLICATED_SCHOOL_ID
} from '../src/lib/esl-roster-fixtures';

/** The school year the fixtures' IDs place them in. */
const YEAR = '2026-2027';

/**
 * Why the misfiled-row claim is asserted on grade 8 rather than grade 7.
 *
 * Grade 7's workbook carries the same defect — `G7 Basic 5` holds one `G7
 * Elementary 4` row — but it also lists one student on two class sheets at once,
 * so its plan is permanently blocked and there is no applied data to read back.
 * That is a real property of the real file, covered by its own test below rather
 * than worked around here. Grade 8 has the identical misfiled row and no
 * duplicate, so the claim under test is observable.
 */
const MISFILED_GRADE = 8;

/**
 * The misfiled student, read out of the generated workbook rather than pinned
 * here, so the id cannot drift from the fixture.
 */
const MISFILED_SCHOOL_ID = misfiledSchoolStudentId(MISFILED_GRADE);

// Every apply carries this tag, so the year it wrote can be removed afterwards
// on the same pattern the other tables use. Without it a spec leaves ~400 students
// and 20 cohorts behind, invisible to every other teardown scope.
const e2eTag = `e2e-test_${getTestSuffix('esl')}`;

/**
 * Opens the import page on the year the tests import into.
 *
 * The grade is not set here, and deliberately: the page places a levelled file
 * from the year above and the file's own ID prefixes, so choosing a grade first
 * would be answering a question the page no longer asks — and the control only
 * exists once a file the arithmetic cannot place has been uploaded.
 */
async function openImportPage(page: Page) {
	await page.goto(`/esl/admin/import?e2eTag=${e2eTag}`);
	await page.waitForSelector('body.hydrated');
	await page.getByTestId('esl-import.year').fill(YEAR);
}

/** Hands the page a workbook, the way a drag-and-drop or a picker would. */
async function uploadWorkbook(page: Page, grade: 7 | 8 | 9 | 10, options = {}) {
	const { fileName, buffer } = rosterWorkbookBuffer(grade, options);
	await page.getByTestId('esl-import.file').setInputFiles({
		name: fileName,
		mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		buffer
	});
}

/** Applies the staged grade and waits for the year view to record it. */
async function applyGrade(page: Page, grade: number) {
	await page.getByTestId(`esl-import.apply.${grade}`).click();
	await expect(page.getByTestId(`esl-import.status.g${grade}.state`)).toHaveText('Imported', {
		timeout: 60_000
	});
}

test.describe('ESL roster import @esl-import @sequential', () => {
	test.use({ role: 'esladmin' });

	// Removes whatever this run wrote: the tag reaches the import through the
	// URL, so the cohorts, students and classes it created all carry it.
	test.afterEach(async () => {
		await cleanupByTag('esl', e2eTag);
	});

	test('imports a grade 9 workbook and applies its ESL Group column', async ({ page }) => {
		await openImportPage(page);
		await uploadWorkbook(page, 9);

		// 20 class sheets, 400 students, and the two summary sheets set aside.
		const card = page.getByTestId('esl-import.card.g9');
		await expect(card).toBeVisible({ timeout: 30_000 });
		await expect(card.getByTestId('esl-import.card.file')).toHaveText('roster-g9.xlsx');
		// One class per sheet, so every group in the file has a class of its own.
		await expect(page.getByTestId('esl-import.plan.cohorts')).toContainText('20 classes');
		// Reading the file wrote nothing: the grade is staged, not applied.
		await expect(page.getByTestId('esl-import.status.g9.state')).toHaveText('Staged');

		await applyGrade(page, 9);
		await expect(page.getByTestId('esl-import.status.g9')).toContainText('new,');
	});

	test('re-uploading the same workbook changes nothing', async ({ page }) => {
		// The property that makes it safe to run the import twice in September.
		// The whole test is given room: applying a 420-student workbook is one
		// transaction, and the first version of this test failed on the default 30s
		// budget rather than on anything the app did.
		test.setTimeout(180_000);

		await openImportPage(page);
		await uploadWorkbook(page, 9);
		await expect(page.getByTestId('esl-import.card.g9')).toBeVisible({ timeout: 60_000 });
		await applyGrade(page, 9);

		// Asserted present before clicking, so a missing control fails naming itself
		// rather than as an opaque click timeout. The `g` prefix matches the other
		// grade-keyed ids on this page (`status.g9`, `card.g9`).
		const discard = page.getByTestId('esl-import.discard.g9');
		await expect(discard).toBeVisible({ timeout: 30_000 });
		await discard.click();

		await uploadWorkbook(page, 9);
		await expect(page.getByTestId('esl-import.card.g9')).toBeVisible({ timeout: 60_000 });

		// Every student the file names is already enrolled exactly where the file
		// puts them, so the plan is entirely unchanged: nothing new, moved or
		// disabled.
		await expect(page.getByTestId('esl-import.plan.total.New')).toHaveText('0');
		await expect(page.getByTestId('esl-import.plan.total.Moved')).toHaveText('0');
		await expect(page.getByTestId('esl-import.plan.total.Disabled')).toHaveText('0');

		await applyGrade(page, 9);
	});

	test('refuses a sheet whose rows disagree with each other', async ({ page }) => {
		// `G8 Inter 1` holds one student whose `ESL Group` reads `G8 Intermediate 2`: a
		// level change whose column was not updated. This used to import the sheet with a
		// warning, filing that row by its own column — but a wrong ability band is silent,
		// because every count still adds up and the roster is quietly wrong. The
		// department confirmed these are typos they will fix, so the file is refused until
		// the cell does (ADR-0025).
		//
		// The file is applied rather than only staged, because the claim under test — that
		// the odd row is not filed anywhere at all — is only observable in applied data.
		test.setTimeout(180_000);
		await openImportPage(page);
		await uploadWorkbook(page, MISFILED_GRADE);

		await expect(page.getByTestId('esl-import.card.g8')).toBeVisible({ timeout: 30_000 });
		// 19 classes, not 20: the one sheet that disagrees with itself is set aside
		// rather than read as a class.
		await expect(page.getByTestId('esl-import.plan.cohorts')).toContainText('19 classes');

		// The set-aside list lives in a collapsed disclosure, so the summary reports the
		// count and the per-sheet reasons are read after opening it — the two steps an
		// admin takes. A visibility assertion without opening first would time out
		// against an element that is present but folded away.
		const toggle = page.getByTestId('esl-import.problems.toggle');
		await expect(toggle).toContainText('3 sheet(s) set aside');
		await toggle.click();

		// The refusal names the sheet and the disagreeing value, so the admin can find
		// the one cell to fix rather than guess among 400 rows.
		const refused = page.getByTestId('esl-import.skipped.G8 Inter 1');
		await expect(refused).toBeVisible();
		await expect(refused).toContainText('G8 Intermediate 2');
		await expect(refused).toContainText('ESL Group');

		await applyGrade(page, MISFILED_GRADE);
		const placed = await eslStudentCohorts(YEAR, MISFILED_GRADE);

		// The odd student is not enrolled at all — neither in the class their column
		// names nor the sheet they sit in. Filing them either way would assert a level
		// change nobody confirmed.
		expect(placed[MISFILED_SCHOOL_ID]).toBeUndefined();
		// And the sheet's other 19 students go with it rather than being half-applied:
		// the whole class is held back until the disagreeing cell is fixed.
		const inInter1 = Object.values(placed).filter((label) =>
			label.includes('Intermediate 1')
		).length;
		expect(inInter1).toBe(0);
	});

	test('refuses to apply a workbook that lists one student on two class sheets', async ({
		page
	}) => {
		// The real grade 7 workbook lists student `1150141` on both `G7 Elementary 2`
		// and `G7 Pre-Elementary`. Applying it would enrol the student in one cohort
		// and disable them in the other, so the plan blocks and names the ID — the
		// admin fixes the workbook and re-uploads.
		//
		// This is a property of the September file itself, not of the fixture, so it
		// is asserted rather than engineered away: if the department ever fixes the
		// duplicate, this test fails and says the block is no longer needed.
		await openImportPage(page);
		await uploadWorkbook(page, 7);

		await expect(page.getByTestId('esl-import.card.g7')).toBeVisible({ timeout: 30_000 });
		// The block is reported with the offending ID in it, not just a red panel.
		const blocked = page.getByTestId('esl-import.plan.blocked');
		await expect(blocked).toBeVisible();
		await expect(blocked).toContainText(DUPLICATED_SCHOOL_ID);
		// And the control that would cause the damage is disabled, not merely warned
		// about.
		await expect(page.getByTestId('esl-import.apply.7')).toBeDisabled();
		// Nothing is applied, so there is no roster to read back.
		await expect(page.getByTestId('esl-import.status.g7.state')).toHaveText('Staged');
	});

	test('places a grade 10 workbook itself, with no grade asked for', async ({ page }) => {
		// Grade 10's IDs are numbered on a space of their own — `51xxxx` in 2026-2027 —
		// that no other grade is numbered in, so the file says which grade it is. The
		// page used to ask for this, and it was the one thing it asked: answer it wrong
		// and the whole import is filed under the wrong grade. Now there is nothing to
		// answer.
		await openImportPage(page);
		await uploadWorkbook(page, 10);

		// The control does not exist at any point, so there is no way to get this wrong
		// by answering.
		await expect(page.getByTestId('esl-import.grade')).toHaveCount(0);
		await expect(page.getByTestId('esl-import.error')).toHaveCount(0);
		await expect(page.getByTestId('esl-import.status.g10.state')).toHaveText('Staged');

		// The two sections of a base class are listed as the two classes they are:
		// 11 base classes, each taught as an A and a B section. The testid is the
		// cohort key, `grade:level:classNumber` — `10:A:01` is base class 01 at level A.
		await expect(page.getByTestId('esl-import.plan.cohorts')).toContainText('22 classes');
		await expect(page.getByTestId('esl-import.plan.cohort.10:A:01')).toContainText('H101A');
		await expect(page.getByTestId('esl-import.plan.cohort.10:B:01')).toContainText('H101B');
	});
	test('refuses a workbook holding two school years, and says which', async ({ page }) => {
		// A different failure from the one above, and the more dangerous of the two:
		// here the page's year is *correct*, so there is nothing to prompt about and
		// no year field to disagree with. The file itself names two years, and
		// importing it would scatter the cohort irrecoverably — so the only thing
		// standing between the admin and that is the refusal, which has to be
		// visible and has to name both years to be actionable.
		await openImportPage(page);
		await uploadWorkbook(page, 7, { mergedYears: true });

		const error = page.getByTestId('esl-import.error');
		await expect(error).toBeVisible({ timeout: 30_000 });
		await expect(error).toContainText('2025-2026');
		await expect(error).toContainText('2026-2027');
		// And the fix, not just the diagnosis.
		await expect(error).toContainText('two files, one per year');

		// Nothing is staged and nothing is applied: a refusal that left a draft
		// behind would be importable by the next click.
		await expect(page.getByTestId('esl-import.status.g7.state')).toHaveText('Not yet provided');
		// And the year field is untouched, because there was no year to change.
		await expect(page.getByTestId('esl-import.year')).toHaveValue(YEAR);
	});

	test('reports a workbook that belongs to another year rather than importing it', async ({
		page
	}) => {
		// The page's year and the file disagree: its `113xxxx` IDs place it in grade 8
		// for 2025-2026, while its groups read G9, which is 2026-2027. Importing
		// anyway would match the roster against the wrong year, silently.
		//
		// The grade is derived from the year above, so this can no longer be a file
		// that "simply" indicates another year — the arithmetic agrees with whatever
		// year is typed. What disagrees is the file's own account of itself, and that
		// is what raises the question.
		await openImportPage(page);
		await page.getByTestId('esl-import.year').fill('2025-2026');
		await uploadWorkbook(page, 9);

		const prompt = page.getByTestId('esl-import.yearPrompt');
		await expect(prompt).toBeVisible();
		// Both years are named, so the admin can see which way round the mismatch is.
		await expect(prompt).toContainText('2026-2027');
		await expect(prompt).toContainText('2025-2026');
		// And nothing is staged until they answer.
		await expect(page.getByTestId('esl-import.status.g9.state')).toHaveText('Not yet provided');
	});
});
