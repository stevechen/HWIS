import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import type { Id, Doc } from './_generated/dataModel';
import {
	requireAdminForSensitiveOperation,
	requireSuperForSensitiveOperation,
	isTestRuntime,
	isProdDeployment,
	getEnvValue
} from './auth';
import { GRADES, getDisplayName, classSortPriority } from './shared/class_roster';
import { assertUniqueStudentId } from './shared/student';
import { displayStaffName } from './shared/staff_name';
import type { MutationCtx, QueryCtx } from './_generated/server';

// Validate studentId is a 6- or 7-digit number
function validateStudentId(studentId: string): void {
	if (isTestRuntime) return;
	if (!/^\d{6,7}$/.test(studentId)) {
		throw new Error('Student ID must be a 6- or 7-digit number');
	}
}

// Get or create a class based on grade and class name
// className: "default", "IB", "1", "2", etc.
async function getOrCreateClass(
	ctx: MutationCtx,
	grade: number,
	className: string
): Promise<Id<'classes'>> {
	if (grade < 7 || grade > 12) {
		throw new Error('Grade must be between 7 and 12');
	}

	const existingClass = await ctx.db
		.query('classes')
		.withIndex('by_grade_class', (q) => q.eq('grade', grade).eq('class', className))
		.first();

	if (existingClass) {
		return existingClass._id;
	}

	return await ctx.db.insert('classes', {
		grade,
		class: className
	});
}

export const list = query({
	args: {
		search: v.optional(v.string()),
		status: v.optional(v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))),
		classId: v.optional(v.id('classes')),
		_trigger: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		let students;
		let statusIndexUsed = false;
		if (args.classId !== undefined) {
			students = await ctx.db
				.query('students')
				.withIndex('by_classId', (q) => q.eq('classId', args.classId!))
				.take(200);
		} else if (args.status !== undefined) {
			students = await ctx.db
				.query('students')
				.withIndex('by_status', (q) => q.eq('status', args.status as 'Enrolled' | 'Not Enrolled'))
				.take(400);
			statusIndexUsed = true;
		} else {
			students = await ctx.db.query('students').take(200);
		}

		const filtered = students.filter((s) => {
			if (!statusIndexUsed && args.status !== undefined && s.status !== args.status) return false;
			if (args.search) {
				const search = args.search.toLowerCase();
				const matchesSearch =
					s.englishName.toLowerCase().includes(search) ||
					s.chineseName.includes(search) ||
					s.studentId.toLowerCase().includes(search);
				if (!matchesSearch) return false;
			}
			return true;
		});

		// Enrich with class info from classes table
		const classIds = [
			...new Set(
				filtered.map((s) => s.classId).filter((id): id is Id<'classes'> => id !== undefined)
			)
		];
		const classRecords = await Promise.all(classIds.map((id) => ctx.db.get(id)));
		const classMap = new Map(classRecords.filter(Boolean).map((c) => [c!._id, c!]));

		// Enrich with teacher names
		const teacherIds = [
			...new Set(
				classRecords
					.filter(Boolean)
					.map((c) => c!.homeroomTeacherId)
					.filter((id): id is Id<'users'> => id !== undefined)
			)
		];
		const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
		const teacherMap = new Map(
			teachers.filter(Boolean).map((t) => [t!._id, displayStaffName(t!.name)])
		);

		const result = filtered.map((s) => {
			const classInfo = s.classId ? classMap.get(s.classId) || null : null;
			const homeroomTeacherName = classInfo?.homeroomTeacherId
				? teacherMap.get(classInfo.homeroomTeacherId) || null
				: null;
			return {
				...s,
				classInfo: classInfo ? { ...classInfo, homeroomTeacherName } : null
			};
		});

		return result.sort((a, b) => a.englishName.localeCompare(b.englishName));
	}
});

export const listPaginated = query({
	args: {
		paginationOpts: paginationOptsValidator,
		search: v.optional(v.string()),
		status: v.optional(v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))),
		grade: v.optional(v.number()),
		class: v.optional(v.string()),
		house: v.optional(
			v.union(
				v.literal('Heracles'),
				v.literal('Wukong'),
				v.literal('Ixbalam'),
				v.literal('Setna'),
				v.literal('__unassigned')
			)
		),
		sortBy: v.union(
			v.literal('studentId'),
			v.literal('englishName'),
			v.literal('chineseName'),
			v.literal('grade'),
			v.literal('house')
		),
		sortDirection: v.union(v.literal('asc'), v.literal('desc')),
		useIndex: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		// Legacy JS-based path (default for backward compatibility)
		if (!args.useIndex) {
			return await listPaginatedLegacy(ctx, args);
		}

		// Index-based path
		return await listPaginatedIndexed(ctx, args);
	}
});

// Internal arg shape shared by the legacy and indexed pagination paths.
type PaginatedArgs = Parameters<typeof listPaginatedLegacy>[1];

/**
 * Super-only system status: row counts, environment flags, and the persisted
 * canary flag. Cheap — safe to call on every page load.
 */
export const getSystemStatus = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperForSensitiveOperation(ctx);

		const environment = {
			deployment: getEnvValue('CONVEX_DEPLOYMENT') ?? 'unknown',
			isProd: isProdDeployment,
			nodeEnv: getEnvValue('NODE_ENV') ?? 'unknown',
			canaryEnabled: await readShadowCompareSetting(ctx),
			canaryEnvOverride: getEnvValue('CONVEX_SHADOW_COMPARE') === '1'
		};

		const all = await ctx.db.query('students').take(5000);
		const byHouse: Record<string, number> = {};
		for (const s of all) {
			const h = s.house ?? '__unassigned';
			byHouse[h] = (byHouse[h] ?? 0) + 1;
		}
		const counts = {
			total: all.length,
			enrolled: all.filter((s) => s.status === 'Enrolled').length,
			notEnrolled: all.filter((s) => s.status === 'Not Enrolled').length,
			byHouse
		};

		return { environment, counts };
	}
});

type ParityCombo = {
	label: string;
	match: boolean;
	legacyCount: number;
	indexedCount: number;
	indexedIsDone: boolean;
	legacyIsDone: boolean;
	note?: string;
};

/**
 * Super-only on-demand pagination parity self-test. Exercises both paths over a
 * representative matrix of args and compares their ordered id sequences, so a
 * divergence is visible on a page instead of relying on (retention-limited) log
 * output. Runs only when explicitly triggered (button), since each combo
 * re-scans the full student table and would be too heavy for page load.
 */
function buildParityCombos(): PaginatedArgs[] {
	const filterScenarios: Array<
		Partial<Pick<PaginatedArgs, 'status' | 'house' | 'grade' | 'class' | 'search'>>
	> = [
		{},
		{ status: 'Enrolled' },
		{ status: 'Not Enrolled' },
		{ status: 'Enrolled', house: 'Heracles' },
		{ status: 'Enrolled', class: '1', grade: 7 },
		{ house: 'Wukong' },
		{ house: '__unassigned' },
		{ grade: 10 },
		{ search: 'a' },
		{ status: 'Not Enrolled', house: 'Setna' }
	];

	const combos: PaginatedArgs[] = [];
	// A) Per filter scenario, order checked via englishName asc/desc.
	for (const f of filterScenarios) {
		for (const sortDirection of ['asc', 'desc'] as const) {
			combos.push({
				paginationOpts: { cursor: null, numItems: 2000 },
				sortBy: 'englishName',
				sortDirection,
				...f
			});
		}
	}
	// B) Per sortBy on a full scan, both directions, to cover each comparator.
	for (const sortBy of ['studentId', 'englishName', 'chineseName', 'grade', 'house'] as const) {
		for (const sortDirection of ['asc', 'desc'] as const) {
			combos.push({
				paginationOpts: { cursor: null, numItems: 2000 },
				sortBy,
				sortDirection
			});
		}
	}
	return combos;
}

// Exercises both pagination paths over a representative matrix of args and
// compares their ordered id sequences. Shared by the on-demand self-test and
// the background canary checker.
async function comparePaths(ctx: QueryCtx): Promise<ParityCombo[]> {
	const combos = buildParityCombos();
	const parityCombos: ParityCombo[] = [];
	for (const c of combos) {
		const legacy = await listPaginatedLegacy(ctx, c);
		const indexed = await listPaginatedIndexed(ctx, c);
		const lIds = legacy.page.map((s) => s._id);
		const iIds = indexed.page.map((s) => s._id);
		let match = lIds.length === iIds.length && legacy.isDone === indexed.isDone;
		let note: string | undefined;
		if (match) {
			for (let i = 0; i < lIds.length; i++) {
				if (lIds[i] !== iIds[i]) {
					match = false;
					note = `order differs at index ${i}`;
					break;
				}
			}
		} else {
			note = `size legacy=${lIds.length} indexed=${iIds.length} (isDone ${legacy.isDone}/${indexed.isDone})`;
		}
		parityCombos.push({
			label: JSON.stringify({
				sortBy: c.sortBy,
				sortDirection: c.sortDirection,
				status: c.status,
				house: c.house,
				grade: c.grade,
				class: c.class,
				search: c.search
			}),
			match,
			legacyCount: lIds.length,
			indexedCount: iIds.length,
			indexedIsDone: indexed.isDone,
			legacyIsDone: legacy.isDone,
			note
		});
	}
	return parityCombos;
}

export const runParitySelfTest = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperForSensitiveOperation(ctx);
		const combos = await comparePaths(ctx);
		return {
			allMatch: combos.every((c) => c.match),
			combos,
			checkedAt: Date.now()
		};
	}
});

// Local helpers shared by the cron checker and the manual super trigger, so we
// avoid self-referencing `internal.students.*` (which breaks Convex codegen).
type CanaryDivergence = {
	label: string;
	legacyCount: number;
	indexedCount: number;
	indexedIsDone: boolean;
	legacyIsDone: boolean;
	note?: string;
};

function toDivergence(c: ParityCombo): CanaryDivergence {
	return {
		label: c.label,
		legacyCount: c.legacyCount,
		indexedCount: c.indexedCount,
		indexedIsDone: c.indexedIsDone,
		legacyIsDone: c.legacyIsDone,
		note: c.note
	};
}

// Persists recorded divergences + the last-run timestamp in the settings table.
async function recordDivergences(ctx: MutationCtx, divergences: CanaryDivergence[], now: number) {
	for (const d of divergences) {
		await ctx.db.insert('canary_divergences', { detectedAt: now, ...d });
	}
	const lastRun = await ctx.db
		.query('settings')
		.withIndex('by_key', (q) => q.eq('key', 'canaryLastRun'))
		.first();
	if (lastRun) {
		await ctx.db.patch(lastRun._id, { value: String(now), updatedAt: now });
	} else {
		await ctx.db.insert('settings', {
			key: 'canaryLastRun',
			value: String(now),
			updatedAt: now
		});
	}
}

// Background checker: runs the parity matrix and persists any divergence.
// Durable, unlike the console.warn canary whose log output expires. Registered
// as an internalMutation so the cron can call it; it only writes divergence logs.
export const runCanaryCheck = internalMutation({
	args: {},
	handler: async (ctx) => {
		if (isTestRuntime) return;
		const combos = await comparePaths(ctx);
		const mismatches = combos.filter((c) => !c.match).map(toDivergence);
		await recordDivergences(ctx, mismatches, Date.now());
	}
});

// Super-triggered run of the background checker (records divergences now).
// A mutation so it can satisfy the super guard and call runQuery + runMutation.
export const runCanaryCheckNow = mutation({
	args: {},
	handler: async (ctx) => {
		await requireSuperForSensitiveOperation(ctx);
		const combos = await comparePaths(ctx);
		const mismatches = combos.filter((c) => !c.match).map(toDivergence);
		await recordDivergences(ctx, mismatches, Date.now());
	}
});

// Super-only read of recorded divergences for the diagnostics page.
export const getCanaryDivergences = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperForSensitiveOperation(ctx);
		const divergences = await ctx.db
			.query('canary_divergences')
			.withIndex('by_detectedAt', (q) => q.gt('detectedAt', 0))
			.order('desc')
			.take(100);
		const lastRun = await ctx.db
			.query('settings')
			.withIndex('by_key', (q) => q.eq('key', 'canaryLastRun'))
			.first();
		return {
			divergences,
			lastRunAt: lastRun ? Number(lastRun.value) : null,
			total: divergences.length
		};
	}
});

async function listPaginatedLegacy(
	ctx: QueryCtx,
	args: {
		paginationOpts: { cursor: string | null; numItems: number };
		search?: string;
		status?: 'Enrolled' | 'Not Enrolled';
		grade?: number;
		class?: string;
		house?: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna' | '__unassigned';
		sortBy: 'studentId' | 'englishName' | 'chineseName' | 'grade' | 'house';
		sortDirection: 'asc' | 'desc';
	}
) {
	const allStudents = await ctx.db.query('students').take(5000);
	const classIds = [...new Set(allStudents.map((student) => student.classId))];
	const classRecords = await Promise.all(classIds.map((id) => ctx.db.get(id)));
	const validClassRecords = classRecords.filter((c): c is NonNullable<typeof c> => c != null);
	const classMap = new Map(validClassRecords.map((classRecord) => [classRecord._id, classRecord]));
	const teacherIds = [
		...new Set(
			validClassRecords
				.map((classRecord) => classRecord.homeroomTeacherId)
				.filter((id): id is Id<'users'> => id !== undefined)
		)
	];
	const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
	const validTeachers = teachers.filter((t): t is NonNullable<typeof t> => t != null);
	const teacherMap = new Map(
		validTeachers.map((teacher) => [teacher._id, displayStaffName(teacher.name)])
	);
	const hydrated = allStudents.map((student) => {
		const classInfo = classMap.get(student.classId) || null;
		return {
			...student,
			classInfo: classInfo
				? {
						...classInfo,
						homeroomTeacherName: classInfo.homeroomTeacherId
							? teacherMap.get(classInfo.homeroomTeacherId) || 'Unknown Teacher'
							: null
					}
				: null
		};
	});
	const search = args.search?.toLowerCase();
	const filtered = hydrated.filter((student) => {
		if (args.status !== undefined && student.status !== args.status) return false;
		if (args.grade !== undefined && student.classInfo?.grade !== args.grade) return false;
		if (args.class !== undefined && student.classInfo?.class !== args.class) return false;
		if (args.house === '__unassigned' && student.house !== undefined) return false;
		if (args.house !== undefined && args.house !== '__unassigned' && student.house !== args.house)
			return false;
		if (search) {
			if (
				!student.englishName.toLowerCase().includes(search) &&
				!student.chineseName.includes(search) &&
				!student.studentId.toLowerCase().includes(search)
			)
				return false;
		}
		return true;
	});
	const compare = (a: (typeof hydrated)[number], b: (typeof hydrated)[number]) => {
		if (args.sortBy === 'house') {
			const houseA = a.house ?? '';
			const houseB = b.house ?? '';
			if (houseA !== houseB) {
				if (!houseA) return -1;
				if (!houseB) return 1;
				return houseA.localeCompare(houseB);
			}
		} else if (args.sortBy !== 'grade') {
			const fieldA = a[args.sortBy];
			const fieldB = b[args.sortBy];
			if (fieldA !== fieldB) return String(fieldA).localeCompare(String(fieldB));
		}
		return a._id.localeCompare(b._id);
	};
	filtered.sort((a, b) => {
		if (args.sortBy === 'grade') {
			const direction = args.sortDirection === 'asc' ? 1 : -1;
			const gradeDiff = (a.classInfo?.grade ?? 0) - (b.classInfo?.grade ?? 0);
			if (gradeDiff !== 0) return gradeDiff * direction;
			const classDiff =
				classSortPriority(a.classInfo?.class ?? '') - classSortPriority(b.classInfo?.class ?? '');
			if (classDiff !== 0) return classDiff;
			return a._id.localeCompare(b._id);
		}
		const result = compare(a, b);
		return args.sortDirection === 'asc' ? result : -result;
	});
	const offset = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
	const page = filtered.slice(offset, offset + args.paginationOpts.numItems);
	const nextOffset = offset + page.length;
	return {
		page,
		isDone: nextOffset >= filtered.length,
		continueCursor: String(nextOffset)
	};
}

async function listPaginatedIndexed(
	ctx: QueryCtx,
	args: {
		paginationOpts: { cursor: string | null; numItems: number };
		search?: string;
		status?: 'Enrolled' | 'Not Enrolled';
		grade?: number;
		class?: string;
		house?: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna' | '__unassigned';
		sortBy: 'studentId' | 'englishName' | 'chineseName' | 'grade' | 'house';
		sortDirection: 'asc' | 'desc';
	}
) {
	// Determine which index to use for initial scan
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let queryBuilder: any = ctx.db.query('students');
	let indexUsed = false;
	let isFullScan = false;

	// Priority: status + classId > status + house > status > house > full scan
	if (args.status !== undefined && args.class !== undefined) {
		// Need to resolve class name to classId first
		const classRecord = await ctx.db
			.query('classes')
			.withIndex('by_grade_class', (q) => q.eq('grade', args.grade || 0).eq('class', args.class!))
			.first();
		if (classRecord) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			queryBuilder = queryBuilder.withIndex('by_status_classId', ((q: any) =>
				q.eq('status', args.status!).eq('classId', classRecord._id)) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
			indexUsed = true;
		}
	} else if (
		args.status !== undefined &&
		args.house !== undefined &&
		args.house !== '__unassigned'
	) {
		const houseValue = args.house as 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		queryBuilder = queryBuilder.withIndex('by_status_house', ((q: any) =>
			q.eq('status', args.status!).eq('house', houseValue)) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
		indexUsed = true;
	} else if (args.status !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		queryBuilder = queryBuilder.withIndex('by_status', ((q: any) =>
			q.eq('status', args.status!)) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
		indexUsed = true;
	} else if (args.house !== undefined && args.house !== '__unassigned') {
		const houseValue = args.house as 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		queryBuilder = queryBuilder.withIndex('by_house', ((q: any) =>
			q.eq('house', houseValue)) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
		indexUsed = true;
	} else if (args.house === '__unassigned') {
		// No index for unassigned - will need to filter in JS
		isFullScan = true;
	} else {
		isFullScan = true;
	}

	// Collect the full candidate set. The index (when used) already narrows the
	// candidate set; post-filters (search, grade, house unassigned) and pagination
	// must run over the entire candidate set, so we must NOT truncate here.
	let students: Doc<'students'>[] = [];
	if (isFullScan || !indexUsed) {
		students = await ctx.db.query('students').collect();
	} else {
		students = await queryBuilder.collect();
	}

	// Hydrate with class info
	const classIds = [...new Set(students.map((s) => s.classId))];
	const classRecords = await Promise.all(classIds.map((id) => ctx.db.get(id)));
	const validClassRecords = classRecords.filter((c): c is NonNullable<typeof c> => c != null);
	const classMap = new Map(validClassRecords.map((c) => [c._id, c]));
	const teacherIds = [
		...new Set(
			validClassRecords
				.map((c) => c.homeroomTeacherId)
				.filter((id): id is Id<'users'> => id !== undefined)
		)
	];
	const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
	const validTeachers = teachers.filter((t): t is NonNullable<typeof t> => t != null);
	const teacherMap = new Map(validTeachers.map((t) => [t._id, displayStaffName(t.name)]));

	const hydrated = students.map((student) => {
		const classInfo = classMap.get(student.classId) || null;
		return {
			...student,
			classInfo: classInfo
				? {
						...classInfo,
						homeroomTeacherName: classInfo.homeroomTeacherId
							? teacherMap.get(classInfo.homeroomTeacherId) || 'Unknown Teacher'
							: null
					}
				: null
		};
	});

	// Apply remaining filters (grade, class name, house unassigned, search)
	const search = args.search?.toLowerCase();
	const filtered = hydrated.filter((student) => {
		if (args.grade !== undefined && student.classInfo?.grade !== args.grade) return false;
		if (args.class !== undefined && student.classInfo?.class !== args.class) return false;
		if (args.house === '__unassigned' && student.house !== undefined) return false;
		if (args.house !== undefined && args.house !== '__unassigned' && student.house !== args.house)
			return false;
		if (search) {
			if (
				!student.englishName.toLowerCase().includes(search) &&
				!student.chineseName.includes(search) &&
				!student.studentId.toLowerCase().includes(search)
			)
				return false;
		}
		return true;
	});

	// Sort. The index is only used to narrow the candidate set above; the final
	// ordering must always come from an explicit JS sort so the result is identical
	// to the legacy path. (Relying on index order was unsound: e.g. a status filter
	// selects the by_status index, which is ordered by status, not by the requested
	// sort key like house.)
	const compare = (a: (typeof filtered)[number], b: (typeof filtered)[number]) => {
		if (args.sortBy === 'house') {
			const houseA = a.house ?? '';
			const houseB = b.house ?? '';
			if (houseA !== houseB) {
				if (!houseA) return -1;
				if (!houseB) return 1;
				return houseA.localeCompare(houseB);
			}
		} else if (args.sortBy !== 'grade') {
			const fieldA = a[args.sortBy];
			const fieldB = b[args.sortBy];
			if (fieldA !== fieldB) return String(fieldA).localeCompare(String(fieldB));
		}
		return a._id.localeCompare(b._id);
	};
	const sorted: typeof filtered = [...filtered].sort((a, b) => {
		if (args.sortBy === 'grade') {
			const direction = args.sortDirection === 'asc' ? 1 : -1;
			const gradeDiff = (a.classInfo?.grade ?? 0) - (b.classInfo?.grade ?? 0);
			if (gradeDiff !== 0) return gradeDiff * direction;
			const classDiff =
				classSortPriority(a.classInfo?.class ?? '') - classSortPriority(b.classInfo?.class ?? '');
			if (classDiff !== 0) return classDiff;
			return a._id.localeCompare(b._id);
		}
		const result = compare(a, b);
		return args.sortDirection === 'asc' ? result : -result;
	});

	// Paginate
	const offset = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
	const page = sorted.slice(offset, offset + args.paginationOpts.numItems);
	const nextOffset = offset + page.length;
	const result = {
		page,
		isDone: nextOffset >= sorted.length,
		continueCursor: String(nextOffset)
	};

	// Shadow canary: when enabled (settings flag or CONVEX_SHADOW_COMPARE env) and
	// sampled, recompute via the legacy path and warn on any divergence. Off in tests
	// and by default so it costs nothing in normal operation. This is the only automated
	// signal that the two paths disagree in production — non-technical users will not
	// report such bugs. Toggle via the System Diagnostics page (setShadowCompare).
	if (await shadowCompareEnabled(ctx)) {
		try {
			const legacy = await listPaginatedLegacy(ctx, args);
			const indexedIds = result.page.map((s) => s._id).sort();
			const legacyIds = legacy.page.map((s) => s._id).sort();
			if (
				JSON.stringify(indexedIds) !== JSON.stringify(legacyIds) ||
				legacy.isDone !== result.isDone
			) {
				console.warn('[shadow-compare] listPaginated divergence', {
					args,
					indexedIds,
					legacyIds,
					indexedIsDone: result.isDone,
					legacyIsDone: legacy.isDone
				});
			}
		} catch (err) {
			console.warn('[shadow-compare] legacy recompute failed', String(err));
		}
	}

	return result;
}

// Reads the persisted shadow-canary flag (settings key `shadowCompare`). The
// CONVEX_SHADOW_COMPARE env remains a hard override for dev/CI.
async function readShadowCompareSetting(ctx: QueryCtx): Promise<boolean> {
	const setting = await ctx.db
		.query('settings')
		.withIndex('by_key', (q) => q.eq('key', 'shadowCompare'))
		.first();
	return setting?.value === 'true';
}

// Gate for the shadow canary: only outside the test runtime, only when enabled
// (settings flag or env override), and only on a sampled fraction of calls.
async function shadowCompareEnabled(ctx: QueryCtx): Promise<boolean> {
	if (isTestRuntime) return false;
	const envOn = getEnvValue('CONVEX_SHADOW_COMPARE') === '1';
	const dbOn = await readShadowCompareSetting(ctx);
	return (envOn || dbOn) && Math.random() < 0.1;
}

// Super-only toggle for the shadow canary, persisted in the `settings` table so
// it can be flipped from the System Diagnostics page without redeploying.
export const setShadowCompare = mutation({
	args: { enabled: v.boolean() },
	handler: async (ctx, { enabled }) => {
		const user = await requireSuperForSensitiveOperation(ctx);
		const value = enabled ? 'true' : 'false';
		const now = Date.now();
		// The test runtime uses a synthetic super user with no real DB id; skip
		// updatedBy there so the settings validator (real Id) is not violated.
		// In production the caller is a real profile and is recorded for audit.
		const updatedBy = isTestRuntime ? undefined : user._id;
		const existing = await ctx.db
			.query('settings')
			.withIndex('by_key', (q) => q.eq('key', 'shadowCompare'))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				value,
				updatedAt: now,
				updatedBy
			});
		} else {
			await ctx.db.insert('settings', {
				key: 'shadowCompare',
				value,
				updatedAt: now,
				updatedBy
			});
		}
		return enabled;
	}
});

export const create = mutation({
	args: {
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(), // Must be 6- or 7-digit number
		grade: v.number(), // Grade (7-12) - will get or create class
		class: v.optional(v.string()), // Class number (e.g., "1", "2"), defaults to "1"
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		house: v.optional(
			v.union(v.literal('Heracles'), v.literal('Wukong'), v.literal('Ixbalam'), v.literal('Setna'))
		),
		upsert: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		validateStudentId(args.studentId);

		const className = args.class || 'default';
		const classId = await getOrCreateClass(ctx, args.grade, className);

		const existing = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		if (existing) {
			if (args.upsert) {
				await ctx.db.patch(existing._id, {
					englishName: args.englishName,
					chineseName: args.chineseName,
					classId,
					status: args.status,
					note: args.note ?? '',
					house: args.house
				});
				return existing._id;
			}
			throw new Error('Student ID already exists');
		}

		const id = await ctx.db.insert('students', {
			englishName: args.englishName,
			chineseName: args.chineseName,
			studentId: args.studentId,
			classId,
			status: args.status,
			note: args.note ?? '',
			house: args.house
		});
		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('students'),
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(), // Must be 6- or 7-digit number
		grade: v.number(), // Grade (7-12) - will get or create class
		class: v.optional(v.string()), // Class name: "default", "IB", "1", "2", etc. - defaults to "default"
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		house: v.optional(
			v.union(v.literal('Heracles'), v.literal('Wukong'), v.literal('Ixbalam'), v.literal('Setna'))
		)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		validateStudentId(args.studentId);

		const className = args.class || 'default';
		const classId = await getOrCreateClass(ctx, args.grade, className);

		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error('Student not found');

		await assertUniqueStudentId(ctx.db, args.studentId, args.id);

		const updateData: {
			englishName: string;
			chineseName: string;
			studentId: string;
			classId: Id<'classes'>;
			status: 'Enrolled' | 'Not Enrolled';
			note?: string;
			house?: Doc<'students'>['house'];
		} = {
			englishName: args.englishName,
			chineseName: args.chineseName,
			studentId: args.studentId,
			classId,
			status: args.status
		};

		if (args.note !== undefined) {
			updateData.note = args.note ?? '';
		}

		if (args.house !== undefined) {
			updateData.house = args.house;
		}

		await ctx.db.patch(args.id, updateData);
	}
});

export const remove = mutation({
	args: {
		id: v.id('students')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.id))
			.take(1);

		if (evaluations.length > 0) {
			throw new Error('Cannot delete student with existing evaluations');
		}

		await ctx.db.delete(args.id);
	}
});

export const removeWithCascade = mutation({
	args: {
		id: v.id('students')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const student = await ctx.db.get(args.id);
		if (!student) throw new Error('Student not found');

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.id))
			.collect();

		for (const evaluation of evaluations) {
			await ctx.db.delete(evaluation._id);
		}

		await ctx.db.delete(args.id);

		return {
			deletedStudent: student.englishName,
			deletedEvaluations: evaluations.length
		};
	}
});

export const changeStatus = mutation({
	args: {
		id: v.id('students'),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		await ctx.db.patch(args.id, { status: args.status });
	}
});

export const importFromExcel = mutation({
	args: {
		students: v.array(
			v.object({
				englishName: v.string(),
				chineseName: v.string(),
				studentId: v.string(), // Must be 6- or 7-digit number
				grade: v.number(), // Grade (7-12) - will get or create class
				class: v.optional(v.string()), // Class number (e.g., "1", "2"), defaults to "1"
				status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
				note: v.optional(v.string()),
				house: v.optional(
					v.union(
						v.literal('Heracles'),
						v.literal('Wukong'),
						v.literal('Ixbalam'),
						v.literal('Setna')
					)
				)
			})
		)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const results = [];

		for (const student of args.students) {
			try {
				validateStudentId(student.studentId);

				const className = student.class || 'default';
				const classId = await getOrCreateClass(ctx, student.grade, className);

				const existing = await ctx.db
					.query('students')
					.withIndex('by_studentId', (q) => q.eq('studentId', student.studentId))
					.first();

				if (existing) {
					await ctx.db.patch(existing._id, {
						englishName: student.englishName,
						chineseName: student.chineseName,
						classId,
						status: student.status,
						note: student.note ?? '',
						house: student.house
					});
					results.push({ studentId: student.studentId, success: true, action: 'updated' });
				} else {
					await ctx.db.insert('students', {
						englishName: student.englishName,
						chineseName: student.chineseName,
						studentId: student.studentId,
						classId,
						status: student.status,
						note: student.note ?? '',
						house: student.house
					});
					results.push({ studentId: student.studentId, success: true, action: 'created' });
				}
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				results.push({ studentId: student.studentId, success: false, error });
			}
		}

		return results;
	}
});

export const seed = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const existing = await ctx.db.query('students').first();
		if (existing) return { message: 'Students already seeded', count: 0 };

		// First, seed default classes
		const grades = GRADES;
		const classCounts = ['1', '2', '3'];
		const classIdMap = new Map<string, Id<'classes'>>();

		for (const grade of grades) {
			for (const classNum of classCounts) {
				const existingClass = await ctx.db
					.query('classes')
					.withIndex('by_grade_class', (q) => q.eq('grade', grade).eq('class', classNum))
					.first();

				if (!existingClass) {
					const id = await ctx.db.insert('classes', {
						grade,
						class: classNum
					});
					classIdMap.set(`${grade}-${classNum}`, id);
				} else {
					classIdMap.set(`${grade}-${classNum}`, existingClass._id);
				}
			}
		}

		// Seed students with 7-digit IDs
		const students = [
			{
				englishName: 'Alice Smith',
				chineseName: '史艾莉',
				studentId: '7001001', // 7-digit: 7(grade)001(sequence)
				classId: classIdMap.get('9-1')!,
				status: 'Enrolled' as const,
				note: 'Top performer'
			},
			{
				englishName: 'Bob Jones',
				chineseName: '張博博',
				studentId: '8002002', // 8(grade)002(sequence)
				classId: classIdMap.get('10-2')!,
				status: 'Enrolled' as const,
				note: ''
			},
			{
				englishName: 'Charlie Brown',
				chineseName: '布查理',
				studentId: '9003003', // 9(grade)003(sequence)
				classId: classIdMap.get('11-3')!,
				status: 'Enrolled' as const,
				note: ''
			},
			{
				englishName: 'David Wilson',
				chineseName: '魏大維',
				studentId: '1001004', // 10(grade)004(sequence)
				classId: classIdMap.get('12-1')!,
				status: 'Not Enrolled' as const,
				note: ''
			},
			{
				englishName: 'Eve Davis',
				chineseName: '戴伊芙',
				studentId: '1102005', // 11(grade)005(sequence)
				classId: classIdMap.get('9-2')!,
				status: 'Not Enrolled' as const,
				note: ''
			}
		];

		for (const s of students) {
			await ctx.db.insert('students', s);
		}

		return { message: 'Seeded students', count: students.length };
	}
});

export const getById = query({
	args: {
		id: v.id('students')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const student = await ctx.db.get(args.id);
		if (!student) return null;

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.id))
			.take(200);

		return { ...student, evaluationCount: evaluations.length };
	}
});

// Get student by studentId code (used for student authentication)
export const getByStudentId = query({
	args: {
		studentId: v.string()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const student = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();

		return student;
	}
});

export const checkStudentIdExists = query({
	args: {
		studentId: v.string(),
		excludeId: v.optional(v.id('students'))
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		try {
			validateStudentId(args.studentId);
		} catch {
			return { exists: false };
		}

		const match = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
			.first();
		const exists = match !== null && (!args.excludeId || match._id !== args.excludeId);
		return { exists };
	}
});

export const checkStudentHasEvaluations = query({
	args: {
		id: v.id('students')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', args.id))
			.take(200);

		return {
			hasEvaluations: evaluations.length > 0,
			count: evaluations.length
		};
	}
});

export const disableStudent = mutation({
	args: {
		id: v.id('students')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		await ctx.db.patch(args.id, { status: 'Not Enrolled' });
	}
});

export const bulkImportWithDuplicateCheck = mutation({
	args: {
		students: v.array(
			v.object({
				englishName: v.string(),
				chineseName: v.string(),
				studentId: v.string(), // Must be 6- or 7-digit number
				grade: v.number(),
				class: v.optional(v.string()),
				status: v.optional(v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))),
				note: v.optional(v.string()),
				house: v.optional(
					v.union(
						v.literal('Heracles'),
						v.literal('Wukong'),
						v.literal('Ixbalam'),
						v.literal('Setna')
					)
				)
			})
		),
		mode: v.union(v.literal('halt'), v.literal('skip'), v.literal('update'))
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const results = {
			created: [] as string[],
			updated: [] as string[],
			skipped: [] as string[],
			errors: [] as { studentId: string; reason: string }[]
		};

		const seenIds = new Set<string>();
		const batchDuplicates: { studentId: string; rowNumber: number }[] = [];

		args.students.forEach((student, index) => {
			try {
				validateStudentId(student.studentId);
			} catch (e) {
				const error = e instanceof Error ? e.message : 'Invalid student ID format';
				results.errors.push({ studentId: student.studentId, reason: error });
				return;
			}

			if (seenIds.has(student.studentId)) {
				batchDuplicates.push({ studentId: student.studentId, rowNumber: index + 2 });
			}
			seenIds.add(student.studentId);
		});

		const databaseDuplicates: { studentId: string; existingName: string; newName: string }[] = [];

		for (const student of args.students) {
			const existing = await ctx.db
				.query('students')
				.withIndex('by_studentId', (q) => q.eq('studentId', student.studentId))
				.first();

			if (existing) {
				databaseDuplicates.push({
					studentId: student.studentId,
					existingName: existing.englishName,
					newName: student.englishName
				});
			}
		}

		if (args.mode === 'halt' && (batchDuplicates.length > 0 || databaseDuplicates.length > 0)) {
			let errorMessage = '';
			if (batchDuplicates.length > 0) {
				errorMessage += `Duplicate student IDs in import: ${batchDuplicates.map((d) => d.studentId).join(', ')}. `;
			}
			if (databaseDuplicates.length > 0) {
				errorMessage += `Student IDs already exist in database: ${databaseDuplicates.map((d) => d.studentId).join(', ')}. `;
			}
			throw new Error(errorMessage.trim());
		}

		if (args.mode === 'skip') {
			const skipIds = new Set(batchDuplicates.map((d) => d.studentId));
			for (const d of databaseDuplicates) {
				skipIds.add(d.studentId);
			}
			results.skipped = Array.from(skipIds);
		}

		const processedStudentIds = new Set<string>();

		for (const student of args.students) {
			// Skip if already errored
			if (results.errors.some((e) => e.studentId === student.studentId)) {
				continue;
			}

			// Skip duplicates in skip mode
			if (args.mode === 'skip' && results.skipped.includes(student.studentId)) {
				continue;
			}

			// If no explicit class provided, default to class "1" for the grade
			const className = student.class || 'default';
			const classId = await getOrCreateClass(ctx, student.grade, className);

			// Default status to 'Enrolled' if not provided
			const status = student.status ?? 'Enrolled';

			// Skip duplicates in update mode (only update existing)
			if (args.mode === 'update') {
				const existing = await ctx.db
					.query('students')
					.withIndex('by_studentId', (q) => q.eq('studentId', student.studentId))
					.first();

				if (!existing) {
					processedStudentIds.add(student.studentId);
					await ctx.db.insert('students', {
						englishName: student.englishName,
						chineseName: student.chineseName,
						studentId: student.studentId,
						classId,
						status,
						note: student.note ?? '',
						house: student.house
					});
					results.created.push(student.studentId);
				} else {
					await ctx.db.patch(existing._id, {
						englishName: student.englishName,
						chineseName: student.chineseName,
						classId,
						status,
						note: student.note ?? '',
						house: student.house
					});
					results.updated.push(student.studentId);
				}
			} else {
				// For halt and skip modes
				const isBatchDuplicate = batchDuplicates.some((d) => d.studentId === student.studentId);
				const isDbDuplicate = databaseDuplicates.some((d) => d.studentId === student.studentId);

				if (isBatchDuplicate || isDbDuplicate) {
					results.skipped.push(student.studentId);
					continue;
				}

				processedStudentIds.add(student.studentId);
				await ctx.db.insert('students', {
					englishName: student.englishName,
					chineseName: student.chineseName,
					studentId: student.studentId,
					classId,
					status,
					note: student.note ?? '',
					house: student.house
				});
				results.created.push(student.studentId);
			}
		}

		return results;
	}
});

// House management exports
export const listByHouse = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);

		const students = await ctx.db.query('students').take(500);

		// Enrich with class info
		const classIds = [
			...new Set(
				students.map((s) => s.classId).filter((id): id is Id<'classes'> => id !== undefined)
			)
		];
		const classRecords = await Promise.all(classIds.map((id) => ctx.db.get(id)));
		const classMap = new Map(classRecords.filter(Boolean).map((c) => [c!._id, c!]));

		const studentsWithClass = students.map((s) => {
			const classInfo = s.classId ? classMap.get(s.classId) || null : null;
			let classDisplay = '';
			if (classInfo) {
				// Handle special class names like the classes page does
				classDisplay = getDisplayName(classInfo.grade, classInfo.class);
			}
			return {
				_id: s._id,
				englishName: s.englishName,
				chineseName: s.chineseName,
				studentId: s.studentId,
				status: s.status,
				house: s.house,
				classDisplay
			};
		});

		const houses: Record<string, typeof studentsWithClass> = {
			Heracles: [],
			Wukong: [],
			Ixbalam: [],
			Setna: []
		};
		const orphaned: typeof studentsWithClass = [];

		for (const student of studentsWithClass) {
			if (student.house && houses[student.house]) {
				houses[student.house].push(student);
			} else {
				orphaned.push(student);
			}
		}

		for (const house of Object.keys(houses)) {
			houses[house].sort((a, b) => a.englishName.localeCompare(b.englishName));
		}
		orphaned.sort((a, b) => a.englishName.localeCompare(b.englishName));

		return { houses, orphaned };
	}
});

export const bulkAssignHouses = mutation({
	args: {
		assignments: v.array(
			v.object({
				englishName: v.string(),
				house: v.union(
					v.literal('Heracles'),
					v.literal('Wukong'),
					v.literal('Ixbalam'),
					v.literal('Setna')
				)
			})
		)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const allStudents = await ctx.db.query('students').take(500);
		const studentsByName = new Map<string, (typeof allStudents)[number]>();
		for (const s of allStudents) {
			const key = s.englishName.trim().toLowerCase();
			if (studentsByName.has(key)) {
				console.warn(`Duplicate name: ${s.englishName}`);
			}
			studentsByName.set(key, s);
		}

		let assigned = 0;
		for (const { englishName, house } of args.assignments) {
			const student = studentsByName.get(englishName.trim().toLowerCase());
			if (!student) {
				console.warn(`Student not found: ${englishName}`);
				continue;
			}
			await ctx.db.patch(student._id, { house });
			assigned++;
		}

		return { assigned, total: args.assignments.length };
	}
});

export const assignHouse = mutation({
	args: {
		studentId: v.id('students'),
		house: v.optional(
			v.union(v.literal('Heracles'), v.literal('Wukong'), v.literal('Ixbalam'), v.literal('Setna'))
		)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const student = await ctx.db.get(args.studentId);
		if (!student) throw new Error('Student not found');

		await ctx.db.patch(args.studentId, { house: args.house });
	}
});

// Houses competition page - get statistics for all houses (internal shared logic)
async function fetchHouseStats(ctx: QueryCtx) {
	const HOUSES = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;

	// Use by_house index to fetch only housed students (4 indexed queries)
	const studentGroups = await Promise.all(
		HOUSES.map((house) =>
			ctx.db
				.query('students')
				.withIndex('by_house', (q) => q.eq('house', house))
				.collect()
		)
	);
	const studentsWithHouses = studentGroups.flat();
	const studentIds = studentsWithHouses.map((s) => s._id);

	// Use by_studentId index to fetch evaluations for housed students
	const evaluations = (
		await Promise.all(
			studentIds.map((id) =>
				ctx.db
					.query('evaluations')
					.withIndex('by_studentId', (q) => q.eq('studentId', id))
					.collect()
			)
		)
	).flat();

	const allEvents = await ctx.db.query('house_events').take(200);

	const categories = await ctx.db.query('point_categories').take(100);
	const categoryMap = new Map(categories.map((c) => [c._id, c]));

	// Type for student points data
	type StudentPointsData = {
		studentId: string;
		house: string;
		englishName: string;
		chineseName: string;
		totalPoints: number;
		positivePoints: number;
		negativePoints: number;
		pointsByCategory: Record<string, number>;
		recentTotalPoints: number;
		recentPositivePoints: number;
		recentNegativePoints: number;
		recentPointsByCategory: Record<string, number>;
	};

	const studentPointsMap = new Map<string, StudentPointsData>();

	// Get timestamp for 30 days ago, rounded to day boundary for cache friendliness
	const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 86400000) * 86400000;

	for (const student of studentsWithHouses) {
		studentPointsMap.set(student._id, {
			studentId: student.studentId,
			house: student.house!,
			englishName: student.englishName,
			chineseName: student.chineseName,
			totalPoints: 0,
			positivePoints: 0,
			negativePoints: 0,
			pointsByCategory: {},
			recentTotalPoints: 0,
			recentPositivePoints: 0,
			recentNegativePoints: 0,
			recentPointsByCategory: {}
		});
	}

	for (const eval_ of evaluations) {
		const studentData = studentPointsMap.get(eval_.studentId);
		if (!studentData) continue;

		const category = categoryMap.get(eval_.categoryId);
		const categoryName = category?.name || 'Unknown';

		// All-time stats
		if (!studentData.pointsByCategory[categoryName]) {
			studentData.pointsByCategory[categoryName] = 0;
		}
		studentData.pointsByCategory[categoryName] += eval_.value;
		studentData.totalPoints += eval_.value;

		if (eval_.value > 0) {
			studentData.positivePoints += eval_.value;
		} else if (eval_.value < 0) {
			studentData.negativePoints += eval_.value; // This is negative
		}

		// Recent stats (last 30 days)
		const isRecent = eval_.timestamp && eval_.timestamp >= thirtyDaysAgo;
		if (isRecent) {
			if (!studentData.recentPointsByCategory[categoryName]) {
				studentData.recentPointsByCategory[categoryName] = 0;
			}
			studentData.recentPointsByCategory[categoryName] += eval_.value;
			studentData.recentTotalPoints += eval_.value;

			if (eval_.value > 0) {
				studentData.recentPositivePoints += eval_.value;
			} else if (eval_.value < 0) {
				studentData.recentNegativePoints += eval_.value;
			}
		}
	}

	const houseStats: Record<
		string,
		{
			totalPoints: number;
			recentTotalPoints: number;
			studentCount: number;
			pointsByCategory: Record<string, number>;
			recentPointsByCategory: Record<string, number>;
			topContributors: { studentId: string; englishName: string; totalPoints: number }[];
			topContributorsRecent: { studentId: string; englishName: string; totalPoints: number }[];
			growthOpportunities: { studentId: string; englishName: string; pointsLost: number }[];
			growthOpportunitiesRecent: { studentId: string; englishName: string; pointsLost: number }[];
		}
	> = {};

	for (const house of HOUSES) {
		houseStats[house] = {
			totalPoints: 0,
			recentTotalPoints: 0,
			studentCount: 0,
			pointsByCategory: {},
			recentPointsByCategory: {},
			topContributors: [],
			topContributorsRecent: [],
			growthOpportunities: [],
			growthOpportunitiesRecent: []
		};
	}

	for (const [, studentData] of studentPointsMap) {
		const stats = houseStats[studentData.house];
		if (!stats) continue;

		stats.totalPoints += studentData.totalPoints;
		stats.recentTotalPoints += studentData.recentTotalPoints;
		stats.studentCount++;

		for (const [cat, points] of Object.entries(studentData.pointsByCategory)) {
			if (!stats.pointsByCategory[cat]) {
				stats.pointsByCategory[cat] = 0;
			}
			stats.pointsByCategory[cat] += points;
		}

		for (const [cat, points] of Object.entries(studentData.recentPointsByCategory)) {
			if (!stats.recentPointsByCategory[cat]) {
				stats.recentPointsByCategory[cat] = 0;
			}
			stats.recentPointsByCategory[cat] += points;
		}
	}

	// Add house event points to house totals
	const EVENTS_CATEGORY = 'Events';
	for (const event of allEvents) {
		if (!event.housePoints) continue;

		for (const [houseName, housePoints] of Object.entries(event.housePoints)) {
			const stats = houseStats[houseName];
			if (!stats) continue;

			stats.totalPoints += housePoints;
			if (!stats.pointsByCategory[EVENTS_CATEGORY]) {
				stats.pointsByCategory[EVENTS_CATEGORY] = 0;
			}
			stats.pointsByCategory[EVENTS_CATEGORY] += housePoints;

			// If the event overlaps the last 30 days, also count it as recent
			if (event.endDate >= thirtyDaysAgo) {
				stats.recentTotalPoints += housePoints;
				if (!stats.recentPointsByCategory[EVENTS_CATEGORY]) {
					stats.recentPointsByCategory[EVENTS_CATEGORY] = 0;
				}
				stats.recentPointsByCategory[EVENTS_CATEGORY] += housePoints;
			}
		}
	}

	const studentsByHouse: Record<string, StudentPointsData[]> = {
		Heracles: [],
		Wukong: [],
		Ixbalam: [],
		Setna: []
	};

	for (const [, studentData] of studentPointsMap) {
		if (studentsByHouse[studentData.house]) {
			studentsByHouse[studentData.house].push(studentData);
		}
	}

	for (const house of HOUSES) {
		const houseStudents = studentsByHouse[house];

		// Top contributors - All Time (by net points: positive - negative)
		houseStats[house].topContributors = houseStudents
			.filter((s) => s.totalPoints > 0)
			.sort((a, b) => b.totalPoints - a.totalPoints)
			.slice(0, 6)
			.map((s) => ({
				studentId: s.studentId,
				englishName: s.englishName,
				totalPoints: s.totalPoints
			}));

		// Top contributors - Most Recent (last 30 days)
		houseStats[house].topContributorsRecent = houseStudents
			.filter((s) => s.recentTotalPoints > 0)
			.sort((a, b) => b.recentTotalPoints - a.recentTotalPoints)
			.slice(0, 6)
			.map((s) => ({
				studentId: s.studentId,
				englishName: s.englishName,
				totalPoints: s.recentTotalPoints
			}));

		// Growth opportunities - All Time (students with negative points)
		houseStats[house].growthOpportunities = houseStudents
			.filter((s) => s.negativePoints < 0)
			.sort((a, b) => a.negativePoints - b.negativePoints)
			.slice(0, 6)
			.map((s) => ({
				studentId: s.studentId,
				englishName: s.englishName,
				pointsLost: Math.abs(s.negativePoints)
			}));

		// Growth opportunities - Most Recent (last 30 days)
		houseStats[house].growthOpportunitiesRecent = houseStudents
			.filter((s) => s.recentNegativePoints < 0)
			.sort((a, b) => a.recentNegativePoints - b.recentNegativePoints)
			.slice(0, 6)
			.map((s) => ({
				studentId: s.studentId,
				englishName: s.englishName,
				pointsLost: Math.abs(s.recentNegativePoints)
			}));
	}

	const allCategories = [...new Set(categories.map((c) => c.name))];

	const ranking = [...HOUSES].sort((a, b) => houseStats[b].totalPoints - houseStats[a].totalPoints);

	const recentRanking = [...HOUSES].sort(
		(a, b) => houseStats[b].recentTotalPoints - houseStats[a].recentTotalPoints
	);

	const result = HOUSES.map((house) => ({
		house,
		totalPoints: houseStats[house].totalPoints,
		recentTotalPoints: houseStats[house].recentTotalPoints,
		studentCount: houseStats[house].studentCount,
		pointsByCategory: houseStats[house].pointsByCategory,
		recentPointsByCategory: houseStats[house].recentPointsByCategory,
		topContributors: houseStats[house].topContributors,
		topContributorsRecent: houseStats[house].topContributorsRecent,
		growthOpportunities: houseStats[house].growthOpportunities,
		growthOpportunitiesRecent: houseStats[house].growthOpportunitiesRecent,
		rank: ranking.indexOf(house) + 1,
		recentRank: recentRanking.indexOf(house) + 1
	}));

	return {
		houses: result,
		ranking,
		recentRanking,
		categories: allCategories
	};
}

export const getHouseStats = query({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		return fetchHouseStats(ctx);
	}
});

export const getPublicHouseStats = query({
	args: {},
	handler: async (ctx) => {
		return fetchHouseStats(ctx);
	}
});
