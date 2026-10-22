import { describe, expect, it, afterEach, vi } from 'vite-plus/test';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import schema from '../schema';
import { loadWizardState } from '../../lib/components/esl/wizard/wizard-load';
import { buildSavePayload, type SavePayload } from '../../lib/components/esl/wizard/wizard-save';

const YEAR = '2026-2027';

const OFF_DAYS = [{ date: '2026-11-10', name: 'National Day' }];

const EXAMS = [
	{ label: 'Exam 1' as const, dates: ['2026-11-02', '2026-11-03'] },
	{ label: 'Exam 2' as const, dates: ['2026-12-07', '2026-12-08'] },
	{ label: 'Final' as const, dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
];

const SINGLES = { anniv: null, makeup: null, sports: '2026-10-07', grad: null, bbq: null };

const RANGES = {
	q1: ['2026-10-05', '2026-10-06', '2026-10-07'],
	q2: ['2026-10-19', '2026-10-20', '2026-10-21'],
	q3: ['2026-11-04', '2026-11-05', '2026-11-06'],
	q4: ['2026-11-18', '2026-11-19', '2026-11-20'],
	q5: ['2026-12-09', '2026-12-10', '2026-12-11'],
	q6: ['2026-12-23', '2026-12-24', '2026-12-28'],
	pd1: ['2026-10-05', '2026-10-06', '2026-10-07'],
	pd2: ['2026-11-04', '2026-11-05', '2026-11-06'],
	pd3: ['2026-12-09', '2026-12-10', '2026-12-11'],
	rd1: ['2026-10-05', '2026-10-06', '2026-10-07'],
	rd2: ['2026-11-04', '2026-11-05', '2026-11-06'],
	rd3: ['2026-12-09', '2026-12-10', '2026-12-11'],
	pcheck: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'],
	wcheck: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08']
};

function saveArgs() {
	return {
		year: YEAR,
		term: 'S1' as const,
		startDate: '2026-08-31',
		offDays: OFF_DAYS,
		exams: EXAMS,
		singles: SINGLES,
		sportsOn: true,
		pairs: {
			mock1: ['2026-10-12', '2026-10-13'],
			mock2: ['2026-10-19', '2026-10-20'],
			mock3: null
		},
		ranges: RANGES,
		customs: [],
		extras: []
	};
}

type SemesterId = Id<'esl_semesters'>;

async function saveSemester(t: Awaited<ReturnType<typeof convexTest>>): Promise<SemesterId> {
	const result = await t.action(api.esl.wizards.saveSemester, saveArgs());
	return result.semesterId;
}

/**
 * Full row snapshots keyed by id — the byte-for-byte baseline. `listBySemester`
 * returns whole documents in deterministic order.
 */
async function snapshotRows(
	t: Awaited<ReturnType<typeof convexTest>>,
	semesterId: SemesterId
): Promise<Map<string, string>> {
	const rows = await t.query(api.esl.events.listBySemester, { semesterId });
	return new Map(rows.map((row) => [row._id as string, JSON.stringify(row)]));
}

/** Id-level diff between two snapshots: which rows appeared, changed, vanished. */
function diffRows(before: Map<string, string>, after: Map<string, string>) {
	const changed: string[] = [];
	for (const [id, json] of after) {
		const was = before.get(id);
		if (was === undefined) continue;
		if (was !== json) changed.push(id);
	}
	return {
		added: [...after.keys()].filter((id) => !before.has(id)),
		changed,
		removed: [...before.keys()].filter((id) => !after.has(id))
	};
}

/**
 * Foreign rows the reconcile must never touch: checklist drafts (off day,
 * unit task, unit quiz, passport due, a G9 mock pair), a holiday-import off
 * day, and a manually added + edited row — all on dates the wizard payload
 * does not cover.
 */
async function insertForeignRows(
	t: Awaited<ReturnType<typeof convexTest>>,
	semesterId: SemesterId
): Promise<void> {
	await t.run(async (ctx) => {
		// Checklist drafts (`checklist.createMissing` shapes): off day, unit
		// task, unit quiz, passport due, and a G9 mock pair.
		await ctx.db.insert('esl_events', {
			semesterId,
			type: 'no_school',
			title: 'Off',
			target: 'all',
			date: '2026-09-14',
			note: "New Year's Day"
		});
		await ctx.db.insert('esl_events', {
			semesterId,
			type: 'reminder',
			reminderKind: 'task',
			isBanner: true,
			title: 'Unit 1',
			target: 'CLIL',
			date: '2026-09-21',
			endDate: '2026-09-25'
		});
		await ctx.db.insert('esl_events', {
			semesterId,
			type: 'reminder',
			reminderKind: 'quiz',
			isBanner: true,
			title: 'Unit 1 Quiz Due',
			target: 'CLIL',
			date: '2026-09-22',
			endDate: '2026-09-24'
		});
		await ctx.db.insert('esl_events', {
			semesterId,
			type: 'reminder',
			reminderKind: 'passport',
			isBanner: true,
			title: 'Passport due',
			target: 'Comm',
			date: '2026-09-28'
		});
		await ctx.db.insert('esl_events', {
			semesterId,
			type: 'g9_mock',
			title: 'G9 Mock Exam',
			target: 'G9',
			date: '2026-09-15'
		});
		await ctx.db.insert('esl_events', {
			semesterId,
			type: 'g9_mock',
			title: 'G9 Mock Exam',
			target: 'G9',
			date: '2026-09-16'
		});
		// Holiday-import row (`stampOffDayEvents` shape): plain off day with
		// the translated caption.
		await ctx.db.insert('esl_events', {
			semesterId,
			type: 'no_school',
			title: 'Off',
			target: 'all',
			date: '2026-09-24',
			note: 'Dragon Boat Festival'
		});
	});
}

describe('esl/wizards.updateSemester', () => {
	afterEach(() => vi.restoreAllMocks());

	it('no-op save changes nothing — drafts, imports and manual edits survive byte-for-byte', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);
		await insertForeignRows(t, semesterId);
		// A manually added row, then a manual edit on it — the old detail
		// page's `events.create` + `events.update` path.
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			target: 'all',
			date: '2026-09-25',
			note: 'Department meeting'
		});
		if (Array.isArray(created)) throw new Error('expected a single event id');
		await t.mutation(api.esl.events.update, { eventId: created, date: '2026-09-28' });
		const before = await snapshotRows(t, semesterId);

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId
		});

		expect(summary).toMatchObject({ added: 0, changed: 0, removed: 0 });
		const after = await snapshotRows(t, semesterId);
		expect(after).toEqual(before);
	});

	it('moving a quiz window updates exactly that row', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);
		const before = await snapshotRows(t, semesterId);

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId,
			ranges: { ...RANGES, q2: ['2026-10-26', '2026-10-27', '2026-10-28'] }
		});

		expect(summary).toMatchObject({ added: 0, changed: 1, removed: 0 });
		const after = await snapshotRows(t, semesterId);
		const diff = diffRows(before, after);
		expect(diff).toMatchObject({ added: [], removed: [] });
		expect(diff.changed).toHaveLength(1);
		const moved = JSON.parse(after.get(diff.changed[0] ?? '') ?? '') as Doc<'esl_events'>;
		expect(moved).toMatchObject({
			reminderKind: 'quiz',
			title: 'Quiz 2',
			date: '2026-10-26',
			endDate: '2026-10-28'
		});
	});

	it('removing a quiz deletes exactly that row', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);
		const before = await snapshotRows(t, semesterId);

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId,
			ranges: { ...RANGES, q6: null }
		});

		expect(summary).toMatchObject({ added: 0, changed: 0, removed: 1 });
		expect(summary.removedEvents[0]).toMatchObject({ title: 'Quiz 6' });
		const after = await snapshotRows(t, semesterId);
		const diff = diffRows(before, after);
		expect(diff).toMatchObject({ added: [], changed: [] });
		expect(diff.removed).toHaveLength(1);
		const removedRow = JSON.parse(before.get(diff.removed[0] ?? '') ?? '') as Doc<'esl_events'>;
		expect(removedRow).toMatchObject({ reminderKind: 'quiz', title: 'Quiz 6' });
	});

	it('refuses to remove an exam group with the protected-row error', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);
		const before = await snapshotRows(t, semesterId);

		const args = saveArgs();
		await expect(
			t.action(api.esl.wizards.updateSemester, {
				...args,
				exams: args.exams.filter((exam) => exam.label !== 'Exam 2'),
				semesterId
			})
		).rejects.toThrow(/protected/i);

		expect(await snapshotRows(t, semesterId)).toEqual(before);
	});

	it('refuses to remove the graduation row with the protected-row error', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const created = await t.action(api.esl.wizards.saveSemester, {
			...saveArgs(),
			singles: { ...SINGLES, grad: '2027-01-29' }
		});
		const before = await snapshotRows(t, created.semesterId);

		await expect(
			t.action(api.esl.wizards.updateSemester, { ...saveArgs(), semesterId: created.semesterId })
		).rejects.toThrow(/protected/i);

		expect(await snapshotRows(t, created.semesterId)).toEqual(before);
	});

	it('reports correct counts for a mixed save: add a custom, rename an off day, drop a quiz', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId,
			offDays: [{ date: '2026-11-10', name: 'Renamed Off Day' }],
			ranges: { ...RANGES, q6: null },
			customs: [
				{
					id: 'custom-1',
					type: 'meeting',
					date: '2026-10-14',
					target: 'all',
					subType: 'task',
					note: 'Staff meeting'
				}
			]
		});

		expect(summary).toMatchObject({ added: 1, changed: 1, removed: 1 });
		expect(summary.addedEvents[0]).toMatchObject({ title: 'Staff meeting' });
		expect(summary.changedEvents[0]).toMatchObject({ title: 'Off', date: '2026-11-10' });
		expect(summary.removedEvents[0]).toMatchObject({ title: 'Quiz 6' });
		const rows = await t.query(api.esl.events.listBySemester, { semesterId });
		const off = rows.find((row) => row.type === 'no_school' && row.date === '2026-11-10');
		expect(off).toMatchObject({ note: 'Renamed Off Day' });
	});

	it('preserves e2eTag on updated rows and stamps inserted ones', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const created = await t.action(api.esl.wizards.saveSemester, {
			...saveArgs(),
			e2eTag: 'wizard-e2e'
		});

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId: created.semesterId,
			e2eTag: 'wizard-e2e',
			ranges: { ...RANGES, q2: ['2026-10-26', '2026-10-27', '2026-10-28'] },
			customs: [
				{
					id: 'custom-1',
					type: 'meeting',
					date: '2026-10-14',
					target: 'all',
					subType: 'task',
					note: 'Staff meeting'
				}
			]
		});

		expect(summary).toMatchObject({ added: 1, changed: 1, removed: 0 });
		const rows = await t.query(api.esl.events.listBySemester, {
			semesterId: created.semesterId
		});
		for (const row of rows) {
			expect(row.e2eTag).toBe('wizard-e2e');
		}
	});

	it('dry run reports the summary without writing anything', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);
		const before = await snapshotRows(t, semesterId);

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId,
			dryRun: true,
			ranges: { ...RANGES, q6: null },
			customs: [
				{
					id: 'custom-1',
					type: 'meeting',
					date: '2026-10-14',
					target: 'all',
					subType: 'task',
					note: 'Staff meeting'
				}
			]
		});

		expect(summary).toMatchObject({ added: 1, changed: 0, removed: 1, dryRun: true });
		expect(await snapshotRows(t, semesterId)).toEqual(before);
	});

	it('updates the semester startDate', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId,
			startDate: '2026-09-01'
		});

		// The first-day row moves with the semester start — that is the
		// one changed event row.
		expect(summary).toMatchObject({ added: 0, changed: 1, removed: 0, startDateChanged: true });
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester).toMatchObject({ startDate: '2026-09-01' });
		const rows = await t.query(api.esl.events.listBySemester, { semesterId });
		const start = rows.find((row) => row.type === 'start_school');
		expect(start).toMatchObject({ date: '2026-09-01', startPeriod: 1, endPeriod: 2 });
	});

	it('preserves leftover passport rows the payload no longer names (draft ambiguity)', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);
		const before = await snapshotRows(t, semesterId);

		const summary = await t.action(api.esl.wizards.updateSemester, {
			...saveArgs(),
			semesterId,
			ranges: { ...RANGES, pd3: null }
		});

		expect(summary).toMatchObject({ added: 0, changed: 0, removed: 0 });
		expect(await snapshotRows(t, semesterId)).toEqual(before);
	});

	it('refuses non-admin callers', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const semesterId = await saveSemester(t);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

		await expect(
			t.action(api.esl.wizards.updateSemester, { ...saveArgs(), semesterId })
		).rejects.toThrow();
	});
});

/**
 * The loader is the only thing between a saved semester and the save payload
 * the edit wizard sends back. Feeding it the real checklist-draft shapes and
 * reconciling that payload is the end-to-end no-op guarantee (#253): nothing
 * is added, changed or removed, and every draft row survives byte-for-byte.
 */
describe('esl/wizards.updateSemester — loader-driven no-op', () => {
	afterEach(() => vi.restoreAllMocks());

	it('preserves checklist drafts through load → save (0/0/0, byte-for-byte)', async () => {
		const t = await convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		// A wizard save without quiz/dues/mocks: the checklist supplies those.
		const emptyRanges: SavePayload['ranges'] = {
			q1: null,
			q2: null,
			q3: null,
			q4: null,
			q5: null,
			q6: null,
			pd1: null,
			pd2: null,
			pd3: null,
			rd1: null,
			rd2: null,
			rd3: null,
			pcheck: null,
			wcheck: null
		};
		const base = {
			...saveArgs(),
			ranges: emptyRanges,
			pairs: { mock1: null, mock2: null, mock3: null }
		};
		const { semesterId } = await t.action(api.esl.wizards.saveSemester, base);

		await t.run(async (ctx) => {
			// Checklist off-day drafts: translated captions plus a caption-less
			// contiguous pair (createMissing omits the note without English).
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'no_school',
				title: 'Off',
				target: 'all',
				date: '2026-09-14',
				note: 'Mid-Autumn Festival'
			});
			for (const date of ['2026-10-10', '2026-10-11']) {
				await ctx.db.insert('esl_events', {
					semesterId,
					type: 'no_school',
					title: 'Off',
					target: 'all',
					date,
					note: 'National Day'
				});
			}
			for (const date of ['2026-10-26', '2026-10-27']) {
				await ctx.db.insert('esl_events', {
					semesterId,
					type: 'no_school',
					title: 'Off',
					target: 'all',
					date
				});
			}
			// Note-less `Unit N` task drafts.
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'reminder',
				reminderKind: 'task',
				isBanner: true,
				title: 'Unit 1',
				target: 'all',
				date: '2026-09-21',
				endDate: '2026-09-25'
			});
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'reminder',
				reminderKind: 'task',
				isBanner: true,
				title: 'Unit 2',
				target: 'all',
				date: '2026-10-19',
				endDate: '2026-10-23'
			});
			// `Unit N Quiz Due` drafts — never wizard `Quiz N` rows.
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'reminder',
				reminderKind: 'quiz',
				isBanner: true,
				title: 'Unit 1 Quiz Due',
				target: 'CLIL',
				date: '2026-09-22',
				endDate: '2026-09-24'
			});
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'reminder',
				reminderKind: 'quiz',
				isBanner: true,
				title: 'Unit 2 Quiz Due',
				target: 'CLIL',
				date: '2026-11-16',
				endDate: '2026-11-18'
			});
			// Passport + recording dues, one per slot.
			for (const [index, date] of ['2026-09-28', '2026-11-05', '2026-12-14'].entries()) {
				await ctx.db.insert('esl_events', {
					semesterId,
					type: 'reminder',
					reminderKind: 'passport',
					isBanner: true,
					title: 'Passport due',
					target: 'Comm',
					date
				});
				await ctx.db.insert('esl_events', {
					semesterId,
					type: 'reminder',
					reminderKind: 'recording',
					isBanner: true,
					title: 'Recording due',
					target: 'Comm',
					date: `2026-12-0${index + 1}`
				});
			}
			// Two checklist G9 mock pairs (adjacent rows).
			for (const date of ['2026-09-15', '2026-09-16', '2026-10-13', '2026-10-14']) {
				await ctx.db.insert('esl_events', {
					semesterId,
					type: 'g9_mock',
					title: 'G9 Mock Exam',
					target: 'G9',
					date
				});
			}
		});

		const rows = await t.query(api.esl.events.listBySemester, { semesterId });
		const loaded = loadWizardState(
			{ id: semesterId, year: YEAR, term: 'S1', startDate: '2026-08-31' },
			rows
		);
		const payload = buildSavePayload(loaded.state);
		const before = await snapshotRows(t, semesterId);

		const dryRun = await t.action(api.esl.wizards.updateSemester, {
			...payload,
			semesterId,
			dryRun: true
		});
		expect(dryRun).toMatchObject({ added: 0, changed: 0, removed: 0 });

		const saved = await t.action(api.esl.wizards.updateSemester, { ...payload, semesterId });
		expect(saved).toMatchObject({ added: 0, changed: 0, removed: 0 });
		expect(await snapshotRows(t, semesterId)).toEqual(before);
	});
});
