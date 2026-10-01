import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';
import type { ParsedRosterWorkbook } from '$convex/shared/esl_import';

const mockMutation = vi.fn();
const advanceMock = vi.fn();
/** The workbook the parse step returns, as the file under test describes it. */
const readRosterWorkbook = vi.fn();
/**
 * The parsed workbook, held synchronously.
 *
 * `parseRosterSheets` is synchronous in the real module, so the mock cannot hand
 * back a promise: the page reads `parsed.derivedYear` straight off the return value
 * and a promise would leave it undefined. `givenParsed` keeps the mock fn and this
 * in step, so tests still set one thing.
 */
let parsedForTest: ParsedRosterWorkbook | undefined;

function givenParsed(workbook: ParsedRosterWorkbook) {
	parsedForTest = workbook;
	readRosterWorkbook.mockResolvedValue(workbook);
}

/**
 * The student IDs the uploaded file carries, which is what the grade is derived
 * from. Kept separate from the parsed workbook so a test can place a file's IDs
 * and the groups it names independently — the two disagreeing is a case of its own.
 */
const fileIds = vi.fn<() => string[]>(() => ['1130001', '1130002']);

/** The file read, which is where an unreadable workbook fails. */
const readSheets = vi.fn<() => Promise<unknown[]>>(async () => [
	{ name: 'G9 Adv 1', headerRow: [], rows: [] }
]);

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: (fn: unknown, args: unknown) => {
			// Routed by function name: the page calls two mutations through the
			// same client, and the year advance is the one under test here.
			if (getFunctionName(fn as never) === 'esl/import:advanceGrade') {
				return advanceMock(fn, args);
			}
			return mockMutation(fn, args);
		},
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$src/routes/esl/admin/import/workbook', () => ({
	// The page reads the file once, places the grade from the IDs, then parses.
	// Each step is mocked so a test can disagree with the others deliberately.
	readRosterSheets: (...args: unknown[]) => readSheets(...(args as [])),
	collectStudentIds: () => fileIds(),
	parseRosterSheets: (grade: number) => {
		readRosterWorkbook(grade);
		if (!parsedForTest) throw new Error('the test set no parsed workbook');
		return parsedForTest;
	},
	readRosterWorkbook: (...args: unknown[]) => readRosterWorkbook(...args)
}));

import ImportPage from '$src/routes/esl/admin/import/+page.svelte';

const YEAR = '2026-2027';

/** The columns a readable sheet reports, as the classifier found them. */
const COLUMNS = { schoolStudentId: 0, chineseName: 1, englishName: 2, group: 3, chineseClass: 4 };

const SNAPSHOT = {
	cohorts: [{ id: 'c_adv1', grade: 9, level: 'Advanced', classNumber: '1' }],
	students: [
		{
			id: 's_yoyo',
			cohortId: 'c_adv1',
			schoolStudentId: '1130001',
			chineseName: '王芃頵',
			englishName: 'Yoyo Lin',
			status: 'active'
		}
	]
};

/** An applied grade, as the status view reads it back out of storage. */
const IMPORTED_G8 = {
	grade: 8,
	fileName: 'g8.xlsx',
	appliedAt: 1_700_000_000_000,
	added: 40,
	moved: 2,
	renamed: 1,
	disabled: 0,
	declinedRenames: []
};

function workbook(over: Partial<ParsedRosterWorkbook> = {}): ParsedRosterWorkbook {
	return {
		grade: 9,
		classes: [],
		skipped: [],
		students: [
			{
				schoolStudentId: '1130001',
				chineseName: '王芃頵',
				englishName: 'Yoyo Lam',
				chineseClass: '01',
				group: { grade: 9, level: 'Advanced', classNumber: '1' }
			},
			{
				schoolStudentId: '1130002',
				chineseName: '李大文',
				chineseClass: '01',
				group: { grade: 9, level: 'Advanced', classNumber: '1' }
			}
		],
		rejected: [],
		derivedYear: { kind: 'current', year: YEAR, entryYear: 113 },
		...over
	};
}

/** Routes each `useQuery` call to canned data by its Convex function name. */
function mockQueries(data: Record<string, unknown>) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const value = data[getFunctionName(reference as never)];
		return { data: value ?? null, isLoading: false, error: null };
	}) as never);
}

/** Hands the file input a file the way a drag-and-drop or a picker would. */
function upload(name = 'g9.xlsx', contents = 'workbook bytes') {
	const input = document.querySelector<HTMLInputElement>('[data-testid="esl-import.file"]');
	if (!input) throw new Error('the file input is not on the page');
	const transfer = new DataTransfer();
	transfer.items.add(new File([contents], name, { type: 'application/vnd.ms-excel' }));
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Sets the school year the way typing into the field would. */
async function setYear(value: string) {
	await page.getByTestId('esl-import.year').fill(value);
}

/**
 * Uploads a grade 10 file, which places itself from its own ID space.
 *
 * No grade control is involved: `5xxxxx` is a space no other grade is numbered in,
 * so one upload stages and there is nothing to answer. The IDs' leading digit also
 * says which year the file is for, which is what the page checks the year above
 * against.
 */
async function uploadGrade10(name = 'g10.xlsx') {
	// Grade 10's scheme: `5xxxxx`, with no three-digit intake prefix, which is how
	// the page knows the grade without being told.
	fileIds.mockReturnValue(['511101', '512101']);
	upload(name);
}

/**
 * A workbook that belongs to the year after the page's, so the year question is
 * raised.
 *
 * It has to disagree with itself to get there. The grade is derived from the year
 * on the page and the file's IDs, so a self-consistent file can no longer merely
 * "indicate another year" — it agrees by construction. What raises the question is
 * the file's own account differing from the arithmetic: `114xxxx` IDs place a 2026-27
 * import in grade 8, while these name grade 9, which puts them in 2027-2028.
 */
function givenNextYearsFile() {
	fileIds.mockReturnValue(['1140001']);
	givenParsed(
		workbook({
			grade: 9,
			derivedYear: { kind: 'current', year: '2027-2028', entryYear: 114 },
			students: [
				{
					schoolStudentId: '1140001',
					chineseName: '王芃頵',
					englishName: 'Yoyo Lam',
					chineseClass: '01',
					group: { grade: 9, level: 'Advanced', classNumber: '1' }
				}
			]
		})
	);
}

describe('ESL admin import page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
		mockQueries({ 'esl/import:rosterSnapshot': SNAPSHOT });
		givenParsed(workbook());
		// Reset explicitly: `clearAllMocks` clears recorded calls but leaves a
		// `mockReturnValue` in place, so a test that sets the file's IDs would
		// otherwise hand them to every test after it.
		fileIds.mockReturnValue(['1130001', '1130002']);
		// `mockRejectedValue` in one test would otherwise persist: `clearAllMocks`
		// clears recorded calls but keeps whatever implementation was last set.
		readSheets.mockReset();
		readSheets.mockImplementation(async () => [{ name: 'G9 Adv 1', headerRow: [], rows: [] }]);
		advanceMock.mockResolvedValue({
			advanced: false,
			reason: 'nothing to carry'
		});
		mockMutation.mockResolvedValue({
			added: 0,
			moved: 0,
			renamed: 0,
			disabled: 0,
			unchanged: 2,
			cohortsCreated: [],
			declinedRenames: ['1130001']
		});
	});

	describe('the year so far', () => {
		it('shows all four grades as not yet provided on a fresh year', async () => {
			render(ImportPage);

			for (const grade of [7, 8, 9, 10]) {
				await expect
					.element(page.getByTestId(`esl-import.status.g${grade}.state`))
					.toHaveTextContent('Not yet provided');
			}
		});
	});

	describe('choosing a file', () => {
		it('stages the file and shows a dry run without writing anything', async () => {
			render(ImportPage);

			upload();

			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('esl-import.status.g9.state'))
				.toHaveTextContent('Staged');
			// The plan: one renamed, one new, nothing disabled.
			await expect.element(page.getByTestId('esl-import.plan.total.New')).toHaveTextContent('1');
			await expect
				.element(page.getByTestId('esl-import.plan.total.Renamed'))
				.toHaveTextContent('1');
			await expect
				.element(page.getByTestId('esl-import.plan.total.Disabled'))
				.toHaveTextContent('0');
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('places a grade 7 file from the year and its IDs, with nothing asked', async () => {
			// The bug this replaces: the page defaulted the grade to 9, so a grade 7
			// workbook was read as grade 9, and since the year is derived from the grade
			// that file's own 2026-27 IDs came out naming 2028-2029. The admin was told
			// their file belonged to the wrong year: wrong, and delivered as though the
			// page were right and the file at fault.
			//
			// The year is the only thing the admin states; the grade follows from it and
			// the file's `115xxxx` IDs.
			render(ImportPage);
			fileIds.mockReturnValue(['1150001', '1150399']);
			givenParsed(
				workbook({
					grade: 7,
					derivedYear: { kind: 'current', year: YEAR, entryYear: 115 },
					students: [
						{
							schoolStudentId: '1150001',
							chineseName: '陳明',
							chineseClass: '01',
							group: { grade: 7, level: 'Basic', classNumber: '1' }
						}
					]
				})
			);

			await setYear(YEAR);
			upload('G7 class Roster 09012026.xlsx');

			// Await the outcome first: the handler is async, so asserting the call
			// synchronously would run before the parse had happened.
			await expect
				.element(page.getByTestId('esl-import.status.g7.state'))
				.toHaveTextContent('Staged');
			// Placed as grade 7 without the admin having said so.
			expect(readRosterWorkbook).toHaveBeenCalledWith(7);
			// And no grade control was ever shown, because there was nothing to ask.
			await expect.element(page.getByTestId('esl-import.grade')).not.toBeInTheDocument();
		});

		it('places a grade 10 file itself, with nothing asked', async () => {
			// Grade 10 is numbered `4xxxxx`, then `5xxxxx`, then `6xxxxx` — a space no
			// other grade uses. So the ID says the grade outright, and the page has
			// nothing to ask the admin about it.
			render(ImportPage);
			fileIds.mockReturnValue(['511024', '511355']);
			givenParsed(
				workbook({
					grade: 10,
					derivedYear: { kind: 'unsupported', reason: 'separate ID scheme' },
					students: [
						{
							schoolStudentId: '511024',
							chineseName: '林明',
							chineseClass: '01',
							group: { grade: 10, baseClass: '01' }
						}
					]
				})
			);

			await setYear(YEAR);
			upload('g10.xlsx');

			await expect
				.element(page.getByTestId('esl-import.status.g10.state'))
				.toHaveTextContent('Staged');
			expect(readRosterWorkbook).toHaveBeenCalledWith(10);
		});

		it('never shows a grade control, whatever the file', async () => {
			// The control existed only for grade 10, and grade 10 now places itself. A
			// file the IDs cannot place at all is refused, which is a different outcome
			// from asking a question the IDs can answer.
			render(ImportPage);
			fileIds.mockReturnValue(['12', '99']);
			await setYear(YEAR);
			upload('junk.xlsx');

			await expect.element(page.getByTestId('esl-import.grade')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('esl-import.error'))
				.toHaveTextContent('no scheme this can read');
			expect(readRosterWorkbook).not.toHaveBeenCalled();
		});

		it('asks before staging a file whose IDs place it in another year', async () => {
			// The safeguard on deriving. Set the year to 2027-2028 and a grade 7 file's
			// `115xxxx` IDs resolve cleanly to grade 8: consistent, and wrong. The
			// file's own `ESL Group` column is the check, because it names the grade.
			render(ImportPage);
			fileIds.mockReturnValue(['1150001']);
			givenParsed(
				workbook({
					grade: 7,
					derivedYear: { kind: 'current', year: YEAR, entryYear: 115 },
					students: [
						{
							schoolStudentId: '1150001',
							chineseName: '陳明',
							chineseClass: '01',
							group: { grade: 7, level: 'Basic', classNumber: '1' }
						}
					]
				})
			);

			await setYear('2027-2028');
			upload('G7 class Roster 09012026.xlsx');

			// The prompt names the year the file actually says, not the one derived
			// from the year field, which would just restate the wrong number.
			const prompt = page.getByTestId('esl-import.yearPrompt');
			await expect.element(prompt).toBeVisible();
			await expect.element(prompt).toHaveTextContent(YEAR);
			await expect.element(prompt).toHaveTextContent('2027-2028');
			await expect
				.element(page.getByTestId('esl-import.status.g7.state'))
				.toHaveTextContent('Not yet provided');
		});

		it('reports a file it could not read, and stages nothing', async () => {
			readSheets.mockRejectedValue(new Error('the file is password protected'));
			render(ImportPage);

			upload();

			await expect
				.element(page.getByTestId('esl-import.error'))
				.toHaveTextContent('password protected');
			await expect
				.element(page.getByTestId('esl-import.status.g9.state'))
				.toHaveTextContent('Not yet provided');
		});

		it('stages a grade 10 file under the year the admin chose', async () => {
			// Grade 10's IDs cannot name a year, so there is nothing to check the
			// field against and nothing to prompt about. The admin's year is the
			// only statement available, and the file is staged under exactly it.
			givenParsed(
				workbook({
					grade: 10,
					derivedYear: {
						kind: 'unsupported',
						reason: 'Grade 10 uses a separate ID scheme that does not identify a school year.'
					},
					students: [
						{
							schoolStudentId: '511101',
							chineseName: '林承叡',
							englishName: 'Remy Lin',
							chineseClass: '01',
							group: { grade: 10, baseClass: '01', section: 'A' }
						},
						{
							schoolStudentId: '512101',
							chineseName: '李大文',
							englishName: 'Jeremy Wu',
							chineseClass: '01',
							group: { grade: 10, baseClass: '01', section: 'B' }
						}
					]
				})
			);
			render(ImportPage);
			await setYear(YEAR);

			await uploadGrade10();

			await expect.element(page.getByTestId('esl-import.card.g10')).toBeInTheDocument();
			// No year prompt: there is no derived year to disagree with.
			await expect.element(page.getByTestId('esl-import.yearPrompt')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('esl-import.status.g10.state'))
				.toHaveTextContent('Staged');
			expect(window.localStorage.getItem(`esl-import:${YEAR}`)).toContain('511101');
		});

		it('lists each grade 10 level as its own cohort', async () => {
			givenParsed(
				workbook({
					grade: 10,
					derivedYear: { kind: 'unsupported', reason: 'no year scheme' },
					students: [
						{
							schoolStudentId: '511101',
							chineseName: '林承叡',
							chineseClass: '01',
							group: { grade: 10, baseClass: '01', section: 'A' }
						},
						{
							schoolStudentId: '512101',
							chineseName: '李大文',
							chineseClass: '01',
							group: { grade: 10, baseClass: '01', section: 'B' }
						}
					]
				})
			);
			render(ImportPage);
			await uploadGrade10();

			// Two cohorts, one per level, each counting only its own students. They were
			// one row with a per-section suffix while A and B were read as
			// sections of one cohort; they are two rosters now (ADR-0023).
			const levelA = page.getByTestId('esl-import.plan.cohort.10:A:01');
			const levelB = page.getByTestId('esl-import.plan.cohort.10:B:01');
			await expect.element(levelA).toHaveTextContent('H101A');
			await expect.element(levelA).toHaveTextContent('1 students');
			await expect.element(levelB).toHaveTextContent('H101B');
			await expect.element(levelB).toHaveTextContent('1 students');
		});

		it('sends grade 10 section text, so the server re-reads what it parsed', async () => {
			givenParsed(
				workbook({
					grade: 10,
					derivedYear: { kind: 'unsupported', reason: 'no year scheme' },
					students: [
						{
							schoolStudentId: '511101',
							chineseName: '林承叡',
							englishName: 'Remy Lin',
							chineseClass: '01',
							group: { grade: 10, baseClass: '01', section: 'A' }
						},
						{
							schoolStudentId: '512101',
							chineseName: '李大文',
							chineseClass: '01',
							group: { grade: 10, baseClass: '11', section: 'B' }
						}
					]
				})
			);
			render(ImportPage);
			await uploadGrade10();
			await expect.element(page.getByTestId('esl-import.card.g10')).toBeInTheDocument();

			await page.getByTestId('esl-import.apply.10').click();

			await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
			const [, args] = mockMutation.mock.calls[0];
			// The workbook's own spelling, not a `G10 … 01` the server would reject.
			expect(args.rows.map((r: { group: string }) => r.group)).toEqual(['H101A', 'H111B']);
			expect(args.grade).toBe(10);
		});

		it('refuses a workbook holding two school years', async () => {
			givenParsed(workbook({ derivedYear: { kind: 'conflict', years: [YEAR, '2027-2028'] } }));
			render(ImportPage);

			upload();

			await expect
				.element(page.getByTestId('esl-import.error'))
				.toHaveTextContent('more than one school year');
			await expect
				.element(page.getByTestId('esl-import.status.g9.state'))
				.toHaveTextContent('Not yet provided');
		});

		it('shows another year’s draft when the year is changed', async () => {
			window.localStorage.setItem(
				'esl-import:2027-2028',
				JSON.stringify({
					year: '2027-2028',
					grades: { '8': { status: 'imported', result: IMPORTED_G8 } }
				})
			);
			render(ImportPage);
			await setYear('2027-2028');

			// The re-read is what makes a second visit useful: last year's import is
			// visible without anything being re-uploaded.
			await expect
				.element(page.getByTestId('esl-import.status.g8.state'))
				.toHaveTextContent('Imported');
		});

		it('keeps the draft on screen while the year is half-typed', async () => {
			window.localStorage.setItem(
				'esl-import:2027-2028',
				JSON.stringify({
					year: '2027-2028',
					grades: { '8': { status: 'imported', result: IMPORTED_G8 } }
				})
			);
			render(ImportPage);
			await setYear('2027-2028');
			await expect
				.element(page.getByTestId('esl-import.status.g8.state'))
				.toHaveTextContent('Imported');

			await setYear('2027');

			// `2027` is not a school year. Blanking the view for a key that is not a
			// year would make the field feel like it had thrown the draft away.
			await expect
				.element(page.getByTestId('esl-import.status.g8.state'))
				.toHaveTextContent('Imported');
		});

		it('leaves the year field alone when a draft is applied', async () => {
			render(ImportPage);
			await setYear(YEAR);
			upload();
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();

			await page.getByTestId('esl-import.apply.9').click();

			// `persistYear` re-reads the field on the way through; if it ever adopted a
			// value from storage, the field and the draft would disagree on the year.
			await expect.element(page.getByTestId('esl-import.year')).toHaveValue(YEAR);
		});
	});

	describe('the year question', () => {
		it('asks before staging a file whose IDs and group column disagree', async () => {
			// The year question survives the change in how the grade is worked out, but
			// not in the form it used to take. A file can no longer merely "indicate
			// another year" — the grade is derived from the year on the page, so it
			// agrees by construction. What can still disagree is the file's own account
			// of itself: here its `114xxxx` IDs place it in grade 8, while its groups
			// read G7. Something is wrong, and the admin is asked rather than told.
			//
			// The grade 7 case is in the "choosing a file" group, where the year field is
			// set to the following year; this one pins the disagreement itself.
			fileIds.mockReturnValue(['1140001']);
			givenParsed(
				workbook({
					grade: 7,
					derivedYear: { kind: 'current', year: YEAR, entryYear: 115 },
					students: [
						{
							schoolStudentId: '1140001',
							chineseName: '陳明',
							chineseClass: '01',
							group: { grade: 7, level: 'Basic', classNumber: '1' }
						}
					]
				})
			);
			render(ImportPage);
			await setYear(YEAR);

			upload();

			const prompt = page.getByTestId('esl-import.yearPrompt');
			// The year the file's own IDs imply for the grade it names, and the year on
			// the page, so the mismatch reads either way round.
			await expect.element(prompt).toHaveTextContent('2025-2026');
			await expect.element(prompt).toHaveTextContent(YEAR);
			// Asked, not assumed: nothing is staged until the admin answers.
			await expect
				.element(page.getByTestId('esl-import.status.g7.state'))
				.toHaveTextContent('Not yet provided');
		});

		it('carries both grades forward, then stages into the new year', async () => {
			// One button, because the admin is turning the year over rather than
			// advancing a grade: stopping between grade 7 and grade 8 would leave
			// the year half-built.
			advanceMock.mockImplementation(async (_fn: unknown, args: { fromGrade: number }) =>
				args.fromGrade === 7
					? { advanced: true, fromGrade: 7, toGrade: 8, cohortsCreated: 20, studentsCarried: 408 }
					: { advanced: true, fromGrade: 8, toGrade: 9, cohortsCreated: 20, studentsCarried: 413 }
			);
			// The file names grade 9, so its `114xxxx` IDs imply 2027-2028 — and for
			// 2026-2027 those same IDs place it in grade 8, which is the disagreement
			// that raises the year question and makes advancing the year the right
			// answer.
			fileIds.mockReturnValue(['1140001']);
			givenParsed(
				workbook({
					grade: 9,
					derivedYear: { kind: 'current', year: '2027-2028', entryYear: 114 },
					students: [
						{
							schoolStudentId: '1140001',
							chineseName: '王芃頵',
							englishName: 'Yoyo Lam',
							chineseClass: '01',
							group: { grade: 9, level: 'Advanced', classNumber: '1' }
						}
					]
				})
			);
			render(ImportPage);
			await setYear(YEAR);
			upload();
			await expect.element(page.getByTestId('esl-import.yearPrompt')).toBeInTheDocument();

			await page.getByTestId('esl-import.yearPrompt.advance').click();

			// Both grades, in order, and no more: grade 9 graduates into a
			// disjoint ID space and grade 10 is the new year's own intake.
			await expect.poll(() => advanceMock.mock.calls.length).toBe(2);
			expect(advanceMock.mock.calls.map((call) => call[1].fromGrade)).toEqual([7, 8]);
			expect(advanceMock.mock.calls[0][1]).toEqual({
				fromYear: YEAR,
				toYear: '2027-2028',
				fromGrade: 7
			});
			// And the outcome of each is reported, so a grade that carried nothing
			// cannot be mistaken for a grade that was skipped.
			await expect
				.element(page.getByTestId('esl-import.advanceReport.g7'))
				.toHaveTextContent('G7 → G8');
			await expect
				.element(page.getByTestId('esl-import.advanceReport.g8'))
				.toHaveTextContent('G8 → G9');
			// The page moves to the year it just carried into, so the field and the
			// data cannot disagree.
			await expect.element(page.getByTestId('esl-import.year')).toHaveValue('2027-2028');
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();
		});

		it('reports a grade that carried nothing, rather than omitting it', async () => {
			advanceMock.mockImplementation(async (_fn: unknown, args: { fromGrade: number }) =>
				args.fromGrade === 7
					? { advanced: true, fromGrade: 7, toGrade: 8, cohortsCreated: 20, studentsCarried: 408 }
					: {
							advanced: false,
							reason:
								'No grade 8 cohorts exist in 2026-2027, so there is nothing to carry into grade 9.'
						}
			);
			givenNextYearsFile();
			render(ImportPage);
			await setYear(YEAR);
			upload();
			await expect.element(page.getByTestId('esl-import.yearPrompt')).toBeInTheDocument();

			await page.getByTestId('esl-import.yearPrompt.advance').click();

			await expect
				.element(page.getByTestId('esl-import.advanceReport.g8'))
				.toHaveTextContent('nothing to carry');
			// And the file still stages: an empty grade is not a failed advance.
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();
		});

		it('surfaces a refusal, and stages nothing', async () => {
			// A refusal is thrown rather than returned, so a mistaken advance can
			// never read as a success that quietly did less.
			advanceMock.mockRejectedValue(
				new Error(
					'Year advance refused. 2027-2028 grade 8 already has 1 cohort(s) this carry-forward does not account for.'
				)
			);
			givenNextYearsFile();
			render(ImportPage);
			await setYear(YEAR);
			upload();
			await expect.element(page.getByTestId('esl-import.yearPrompt')).toBeInTheDocument();

			await page.getByTestId('esl-import.yearPrompt.advance').click();

			await expect
				.element(page.getByTestId('esl-import.error'))
				.toHaveTextContent('carry-forward does not account for');
			await expect.element(page.getByTestId('esl-import.card.g9')).not.toBeInTheDocument();
			// The page stays on the year it was set to, not the one it failed on.
			await expect.element(page.getByTestId('esl-import.year')).toHaveValue(YEAR);
		});

		it('stages under the year the IDs indicate once accepted', async () => {
			givenNextYearsFile();
			render(ImportPage);
			await setYear(YEAR);
			upload();
			await expect.element(page.getByTestId('esl-import.yearPrompt')).toBeInTheDocument();

			await page.getByTestId('esl-import.yearPrompt.accept').click();

			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();
			// The draft is namespaced by the year it was parsed for, so the year input
			// and the draft cannot disagree.
			const stored = window.localStorage.getItem('esl-import:2027-2028');
			// The ID the helper's file carries, not the default one: that file is the
			// `114xxxx` one, so its draft holds its student.
			expect(stored).toContain('1140001');
			expect(window.localStorage.getItem(`esl-import:${YEAR}`)).toBeNull();
		});
	});

	describe('the dry run', () => {
		it('blocks applying a file with a repeated student ID', async () => {
			givenParsed(
				workbook({
					students: [
						{
							schoolStudentId: '1130001',
							chineseName: '王芃頵',
							chineseClass: '01',
							group: { grade: 9, level: 'Advanced', classNumber: '1' }
						},
						{
							schoolStudentId: '1130001',
							chineseName: '王芃頵',
							chineseClass: '01',
							group: { grade: 9, level: 'Advanced', classNumber: '2' }
						}
					]
				})
			);
			render(ImportPage);

			upload();

			await expect.element(page.getByTestId('esl-import.plan.blocked')).toBeInTheDocument();
			await expect.element(page.getByTestId('esl-import.apply.9')).toBeDisabled();
		});

		it('leaves a name change unticked until the admin ticks it', async () => {
			render(ImportPage);
			upload();
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();

			const rename = page.getByTestId('esl-import.rename.1130001');
			await expect.element(rename).not.toBeChecked();
			await expect.element(page.getByText('Yoyo Lam')).toBeInTheDocument();

			await rename.click();

			await expect.element(page.getByTestId('esl-import.rename.1130001')).toBeChecked();
		});

		it('shows the skipped sheets and rejected rows with their Excel line', async () => {
			givenParsed(
				workbook({
					skipped: [
						{
							kind: 'summary',
							sheetName: 'ESL class',
							reason: 'Rows resolve to 5 different ESL groups.',
							columns: COLUMNS
						}
					],
					rejected: [
						{
							sheetName: 'G9 Adv 1',
							rowNumber: 47,
							reason: 'The Chinese name cell is empty, so the student cannot be enrolled.',
							raw: []
						}
					]
				})
			);
			render(ImportPage);

			upload();

			await expect
				.element(page.getByTestId('esl-import.rejected.G9 Adv 1.47'))
				.toHaveTextContent('Chinese name cell is empty');
			await expect
				.element(page.getByTestId('esl-import.skipped.ESL class'))
				.toHaveTextContent('different ESL groups');
		});
	});

	describe('applying', () => {
		it('sends the file cell text and no unapproved renames', async () => {
			render(ImportPage);
			upload();
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();

			await page.getByTestId('esl-import.apply.9').click();

			await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
			const [, args] = mockMutation.mock.calls[0];
			expect(args.year).toBe(YEAR);
			expect(args.grade).toBe(9);
			// The file's own cell text, so the server re-reads it rather than trusting.
			expect(args.rows).toEqual([
				{
					schoolStudentId: '1130001',
					chineseName: '王芃頵',
					englishName: 'Yoyo Lam',
					chineseClass: 'J301',
					group: 'G9 Advanced 1'
				},
				{
					schoolStudentId: '1130002',
					chineseName: '李大文',
					group: 'G9 Advanced 1',
					chineseClass: 'J301'
				}
			]);
			expect(args.approvedNameChanges).toEqual([]);
		});

		it('sends the ticked student once ticked', async () => {
			render(ImportPage);
			upload();
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();

			await page.getByTestId('esl-import.rename.1130001').click();
			await expect.element(page.getByTestId('esl-import.rename.1130001')).toBeChecked();
			await page.getByTestId('esl-import.apply.9').click();

			await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
			expect(mockMutation.mock.calls[0][1].approvedNameChanges).toEqual(['s_yoyo']);
		});

		it('records the grade as imported and drops the staged file', async () => {
			render(ImportPage);
			upload();
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();

			await page.getByTestId('esl-import.apply.9').click();

			await expect
				.element(page.getByTestId('esl-import.status.g9.state'))
				.toHaveTextContent('Imported');
			await expect.element(page.getByTestId('esl-import.card.g9')).not.toBeInTheDocument();
			// The parsed rows are spent; what remains is the outcome.
			const stored = window.localStorage.getItem(`esl-import:${YEAR}`);
			expect(stored).toContain('"status":"imported"');
			expect(stored).not.toContain('Yoyo Lam');
		});

		it('keeps the file staged when the server refuses it', async () => {
			mockMutation.mockRejectedValue(new Error('Import refused: rows could not be read.'));
			render(ImportPage);
			upload();
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();

			await page.getByTestId('esl-import.apply.9').click();

			await expect
				.element(page.getByTestId('esl-import.error'))
				.toHaveTextContent('rows could not be read');
			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();
		});
	});
});
