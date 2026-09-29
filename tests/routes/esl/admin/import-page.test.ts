import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';
import { selectOption } from '../../../lib/select';
import type { ParsedRosterWorkbook } from '$convex/shared/esl_import';

const mockMutation = vi.fn();
const advanceMock = vi.fn();
const readRosterWorkbook = vi.fn();

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
	readRosterWorkbook: (...args: unknown[]) => readRosterWorkbook(...args)
}));

import ImportPage from '$src/routes/esl/admin/import/+page.svelte';

const YEAR = '2026-2027';

/** The columns a readable sheet reports, as the classifier found them. */
const COLUMNS = { schoolStudentId: 0, chineseName: 1, englishName: 2, group: 3 };

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
				group: { grade: 9, level: 'Advanced', classNumber: '1' }
			},
			{
				schoolStudentId: '1130002',
				chineseName: '李大文',
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

/** Chooses the grade the next file is taken to be. */
async function chooseGrade(value: string) {
	await selectOption(page.getByTestId('esl-import.grade'), value);
}

describe('ESL admin import page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
		mockQueries({ 'esl/import:rosterSnapshot': SNAPSHOT });
		readRosterWorkbook.mockResolvedValue(workbook());
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

		it('reports a file it could not read, and stages nothing', async () => {
			readRosterWorkbook.mockRejectedValue(new Error('the file is password protected'));
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
			readRosterWorkbook.mockResolvedValue(
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
							group: { grade: 10, baseClass: '01', section: 'A' }
						},
						{
							schoolStudentId: '512101',
							chineseName: '李大文',
							englishName: 'Jeremy Wu',
							group: { grade: 10, baseClass: '01', section: 'B' }
						}
					]
				})
			);
			render(ImportPage);
			await chooseGrade('10');
			await setYear(YEAR);

			upload();

			await expect.element(page.getByTestId('esl-import.card.g10')).toBeInTheDocument();
			// No year prompt: there is no derived year to disagree with.
			await expect.element(page.getByTestId('esl-import.yearPrompt')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('esl-import.status.g10.state'))
				.toHaveTextContent('Staged');
			expect(window.localStorage.getItem(`esl-import:${YEAR}`)).toContain('511101');
		});

		it('shows one cohort with both sections for a grade 10 base class', async () => {
			readRosterWorkbook.mockResolvedValue(
				workbook({
					grade: 10,
					derivedYear: { kind: 'unsupported', reason: 'no year scheme' },
					students: [
						{
							schoolStudentId: '511101',
							chineseName: '林承叡',
							group: { grade: 10, baseClass: '01', section: 'A' }
						},
						{
							schoolStudentId: '512101',
							chineseName: '李大文',
							group: { grade: 10, baseClass: '01', section: 'B' }
						}
					]
				})
			);
			render(ImportPage);
			await chooseGrade('10');
			upload();

			// One cohort, two sections, one shared roster — the thing the parser
			// used to get wrong by reading the sheet as two classes.
			const row = page.getByTestId('esl-import.plan.cohort.10::01');
			await expect.element(row).toHaveTextContent('2 student(s)');
			await expect.element(row).toHaveTextContent('sections A and B');
			await expect.element(row).toHaveTextContent('one shared roster');
		});

		it('sends grade 10 section text, so the server re-reads what it parsed', async () => {
			readRosterWorkbook.mockResolvedValue(
				workbook({
					grade: 10,
					derivedYear: { kind: 'unsupported', reason: 'no year scheme' },
					students: [
						{
							schoolStudentId: '511101',
							chineseName: '林承叡',
							englishName: 'Remy Lin',
							group: { grade: 10, baseClass: '01', section: 'A' }
						},
						{
							schoolStudentId: '512101',
							chineseName: '李大文',
							group: { grade: 10, baseClass: '11', section: 'B' }
						}
					]
				})
			);
			render(ImportPage);
			await chooseGrade('10');
			upload();
			await expect.element(page.getByTestId('esl-import.card.g10')).toBeInTheDocument();

			await page.getByTestId('esl-import.apply.10').click();

			await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
			const [, args] = mockMutation.mock.calls[0];
			// The workbook's own spelling, not a `G10 … 01` the server would reject.
			expect(args.rows.map((r: { group: string }) => r.group)).toEqual(['H101A', 'H111B']);
			expect(args.grade).toBe(10);
		});

		it('refuses a workbook holding two school years', async () => {
			readRosterWorkbook.mockResolvedValue(
				workbook({ derivedYear: { kind: 'conflict', years: [YEAR, '2027-2028'] } })
			);
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
		it('asks before staging a file whose IDs indicate another year', async () => {
			readRosterWorkbook.mockResolvedValue(
				workbook({ derivedYear: { kind: 'current', year: '2027-2028', entryYear: 114 } })
			);
			render(ImportPage);
			await setYear(YEAR);

			upload();

			const prompt = page.getByTestId('esl-import.yearPrompt');
			await expect.element(prompt).toHaveTextContent('2027-2028');
			await expect.element(prompt).toHaveTextContent(YEAR);
			// Asked, not assumed: nothing is staged until the admin answers.
			await expect
				.element(page.getByTestId('esl-import.status.g9.state'))
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
			readRosterWorkbook.mockResolvedValue(
				workbook({ derivedYear: { kind: 'current', year: '2027-2028', entryYear: 114 } })
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
			readRosterWorkbook.mockResolvedValue(
				workbook({ derivedYear: { kind: 'current', year: '2027-2028', entryYear: 114 } })
			);
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
			readRosterWorkbook.mockResolvedValue(
				workbook({ derivedYear: { kind: 'current', year: '2027-2028', entryYear: 114 } })
			);
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
			readRosterWorkbook.mockResolvedValue(
				workbook({ derivedYear: { kind: 'current', year: '2027-2028', entryYear: 114 } })
			);
			render(ImportPage);
			await setYear(YEAR);
			upload();
			await expect.element(page.getByTestId('esl-import.yearPrompt')).toBeInTheDocument();

			await page.getByTestId('esl-import.yearPrompt.accept').click();

			await expect.element(page.getByTestId('esl-import.card.g9')).toBeInTheDocument();
			// The draft is namespaced by the year it was parsed for, so the year input
			// and the draft cannot disagree.
			const stored = window.localStorage.getItem('esl-import:2027-2028');
			expect(stored).toContain('1130001');
			expect(window.localStorage.getItem(`esl-import:${YEAR}`)).toBeNull();
		});
	});

	describe('the dry run', () => {
		it('blocks applying a file with a repeated student ID', async () => {
			readRosterWorkbook.mockResolvedValue(
				workbook({
					students: [
						{
							schoolStudentId: '1130001',
							chineseName: '王芃頵',
							group: { grade: 9, level: 'Advanced', classNumber: '1' }
						},
						{
							schoolStudentId: '1130001',
							chineseName: '王芃頵',
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
			readRosterWorkbook.mockResolvedValue(
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
					group: 'G9 Advanced 1'
				},
				{ schoolStudentId: '1130002', chineseName: '李大文', group: 'G9 Advanced 1' }
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
