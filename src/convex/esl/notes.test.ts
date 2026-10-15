import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedEslStaff } from '../test.setup';
import type { ConvexTestInstance } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';

const YEAR = '2025-2026';

/**
 * One S1 semester, one G7 cohort, and two classes: CLIL belongs to the
 * teacher, Comm belongs to someone else. Mirrors the schedule.test.ts world
 * so the notes gate is exercised against the same assignment shape.
 */
async function setupNotesWorld() {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	const teacherId = await seedEslStaff(t, {
		authId: 'esl-teacher',
		eslRole: 'teacher',
		signIn: false
	});
	const otherId = await seedEslStaff(t, {
		authId: 'esl-other',
		eslRole: 'teacher',
		signIn: false
	});
	const coverId = await seedEslStaff(t, {
		authId: 'esl-cover',
		eslRole: 'teacher',
		signIn: false
	});
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: YEAR,
		term: 'S1',
		startDate: '2025-08-31'
	});
	const { classIds } = await t.mutation(api.esl.cohorts.create, {
		year: YEAR,
		grade: 7,
		level: 'Basic',
		classNumber: '1'
	});
	const [clilId, commId] = classIds;
	await t.mutation(api.esl.classes.assignTeacher, { id: clilId, teacherId });
	await t.mutation(api.esl.classes.assignTeacher, { id: commId, teacherId: otherId });
	return { t, teacherId, otherId, coverId, semesterId, clilId, commId };
}

function asTeacher() {
	mockAuthUser({ authId: 'esl-teacher' });
}

function asOther() {
	mockAuthUser({ authId: 'esl-other' });
}

function asCover() {
	mockAuthUser({ authId: 'esl-cover' });
}

function asAdmin() {
	mockAuthUser({ authId: 'esl-admin' });
}

async function readNote(t: ConvexTestInstance, classId: Id<'esl_classes'>, date: string) {
	return t.query(api.esl.notes.get, { classId, date });
}

describe('esl/notes teacher notes', () => {
	afterEach(() => vi.restoreAllMocks());

	it('lets the assigned teacher save and read back a note', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();

		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'Finished U1 L3, start L4 next time.'
		});

		expect(await readNote(t, clilId, '2025-09-01')).toBe('Finished U1 L3, start L4 next time.');
	});

	it('reads null when the teacher wrote nothing for the date', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();

		expect(await readNote(t, clilId, '2025-09-03')).toBeNull();
	});

	it('keeps the last write when the teacher edits a note', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();

		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'First draft.'
		});
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'Revised plan.'
		});

		expect(await readNote(t, clilId, '2025-09-01')).toBe('Revised plan.');
		const listed = await t.query(api.esl.notes.listByClass, { classId: clilId });
		expect(listed.filter((note) => note.date === '2025-09-01')).toHaveLength(1);
	});

	it('lists only the viewer’s own notes on that class', async () => {
		const { t, clilId, commId } = await setupNotesWorld();
		asTeacher();
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'CLIL note.'
		});

		asOther();
		await t.mutation(api.esl.notes.upsert, {
			classId: commId,
			date: '2025-09-02',
			text: 'Comm note.'
		});

		asTeacher();
		const listed = await t.query(api.esl.notes.listByClass, { classId: clilId });
		expect(listed.map((note) => note.date)).toEqual(['2025-09-01']);
	});

	it('refuses a teacher who is not assigned to the class', async () => {
		const { t, clilId } = await setupNotesWorld();
		asOther();

		await expect(
			t.mutation(api.esl.notes.upsert, {
				classId: clilId,
				date: '2025-09-01',
				text: 'Covering teacher snooping.'
			})
		).rejects.toThrow(/assigned teacher/i);
		await expect(readNote(t, clilId, '2025-09-01')).rejects.toThrow(/assigned teacher/i);
	});

	it('refuses an ESL admin with no override path', async () => {
		const { t, clilId } = await setupNotesWorld();
		asAdmin();

		await expect(
			t.mutation(api.esl.notes.upsert, {
				classId: clilId,
				date: '2025-09-01',
				text: 'Admin edit.'
			})
		).rejects.toThrow(/assigned teacher/i);
		await expect(readNote(t, clilId, '2025-09-01')).rejects.toThrow(/assigned teacher/i);
	});

	it('refuses callers with no session', async () => {
		const { t, clilId } = await setupNotesWorld();
		mockAuthUser(null);

		await expect(
			t.mutation(api.esl.notes.upsert, {
				classId: clilId,
				date: '2025-09-01',
				text: 'Anonymous.'
			})
		).rejects.toThrow();
		await expect(readNote(t, clilId, '2025-09-01')).rejects.toThrow();
	});

	it('refuses dates outside YYYY-MM-DD', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();

		await expect(
			t.mutation(api.esl.notes.upsert, { classId: clilId, date: '09/01/2025', text: 'Bad.' })
		).rejects.toThrow(/YYYY-MM-DD/);
	});

	it('refuses notes past the length cap', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();

		await expect(
			t.mutation(api.esl.notes.upsert, {
				classId: clilId,
				date: '2025-09-01',
				text: 'x'.repeat(2001)
			})
		).rejects.toThrow(/2000/);
	});

	it('clears the note when the teacher saves empty text', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'To be cleared.'
		});

		await t.mutation(api.esl.notes.upsert, { classId: clilId, date: '2025-09-01', text: '  ' });

		expect(await readNote(t, clilId, '2025-09-01')).toBeNull();
	});

	it('removes a note through the clear mutation', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'Temporary.'
		});

		await t.mutation(api.esl.notes.clear, { classId: clilId, date: '2025-09-01' });

		expect(await readNote(t, clilId, '2025-09-01')).toBeNull();
	});

	it('refuses to clear a class the teacher is not assigned to', async () => {
		const { t, clilId } = await setupNotesWorld();
		asOther();

		await expect(
			t.mutation(api.esl.notes.clear, { classId: clilId, date: '2025-09-01' })
		).rejects.toThrow(/assigned teacher/i);
	});

	it('refuses a covering teacher on every seam: get, list, upsert, clear', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'Owner note.'
		});

		asCover();
		await expect(readNote(t, clilId, '2025-09-01')).rejects.toThrow(/assigned teacher/i);
		await expect(t.query(api.esl.notes.listByClass, { classId: clilId })).rejects.toThrow(
			/assigned teacher/i
		);
		await expect(
			t.mutation(api.esl.notes.upsert, {
				classId: clilId,
				date: '2025-09-01',
				text: 'Covering teacher edit.'
			})
		).rejects.toThrow(/assigned teacher/i);
		await expect(
			t.mutation(api.esl.notes.clear, { classId: clilId, date: '2025-09-01' })
		).rejects.toThrow(/assigned teacher/i);
	});

	it('refuses an admin on list and clear too, not just get and upsert', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'Owner note.'
		});

		asAdmin();
		await expect(t.query(api.esl.notes.listByClass, { classId: clilId })).rejects.toThrow(
			/assigned teacher/i
		);
		await expect(
			t.mutation(api.esl.notes.clear, { classId: clilId, date: '2025-09-01' })
		).rejects.toThrow(/assigned teacher/i);
	});

	it('refuses another class teacher on list, hiding which dates hold notes', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'Owner note.'
		});

		asOther();
		await expect(t.query(api.esl.notes.listByClass, { classId: clilId })).rejects.toThrow(
			/assigned teacher/i
		);
	});

	it('lets the teacher write any meeting date: no edit cutoff, past or future', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();

		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-08-01',
			text: 'Backfilled history.'
		});
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2026-06-30',
			text: 'Far-ahead prep.'
		});

		expect(await readNote(t, clilId, '2025-08-01')).toBe('Backfilled history.');
		expect(await readNote(t, clilId, '2026-06-30')).toBe('Far-ahead prep.');
	});

	it('stamps updatedAt and updatedBy on write and keeps one row per date', async () => {
		const { t, teacherId, clilId } = await setupNotesWorld();
		asTeacher();
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'First draft.'
		});
		await t.mutation(api.esl.notes.upsert, {
			classId: clilId,
			date: '2025-09-01',
			text: 'Revised plan.'
		});

		const rows = await t.run((ctx) =>
			ctx.db
				.query('teacher_notes')
				.withIndex('by_class_teacher_date', (q) =>
					q.eq('classId', clilId).eq('teacherId', teacherId).eq('date', '2025-09-01')
				)
				.collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].text).toBe('Revised plan.');
		expect(typeof rows[0].updatedAt).toBe('number');
		expect(rows[0].updatedBy).toEqual(teacherId);
	});

	it('leaves clearing an absent note a quiet no-op', async () => {
		const { t, clilId } = await setupNotesWorld();
		asTeacher();

		await expect(
			t.mutation(api.esl.notes.clear, { classId: clilId, date: '2025-09-09' })
		).resolves.toBeNull();
		expect(await readNote(t, clilId, '2025-09-09')).toBeNull();
	});
});
