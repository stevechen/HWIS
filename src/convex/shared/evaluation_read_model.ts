import type { Id } from '../_generated/dataModel';
import type { EnrichedEvaluation } from './enrichment';
import { enrichEvaluations } from './enrichment';
import { matchesMultiSearch } from './evaluation_utils';
import type { DataModel } from '../_generated/dataModel';
import type { GenericDatabaseReader, PaginationOptions } from 'convex/server';

export type EvaluationReference = 'resolved' | 'missing';

export type EvaluationReadFilters = {
	studentFilter?: string;
	teacherFilter?: string;
	showUnenrolled?: boolean;
};

export type EvaluationReadRequest =
	| {
			scope: 'teacher';
			teacherId: Id<'users'>;
			studentId?: Id<'students'>;
			limit?: number;
			filters?: EvaluationReadFilters;
			sortAscending?: boolean;
	  }
	| {
			scope: 'admin';
			studentId?: Id<'students'>;
			limit?: number;
			filters?: EvaluationReadFilters;
			sortAscending?: boolean;
			paginationOpts?: PaginationOptions;
	  };

export type EvaluationReadRow = Omit<
	EnrichedEvaluation,
	'_id' | 'studentId' | 'teacherId' | 'categoryId'
> & {
	_id: string;
	studentId: string;
	teacherId: string;
	categoryId: string;
	teacherName: string;
	isAdmin: boolean;
};

export type EvaluationReadPage = {
	page: EvaluationReadRow[];
	isDone: boolean;
	continueCursor: string;
};

type ReadContext = {
	db: GenericDatabaseReader<DataModel>;
};

function serializeEvaluation(
	evaluation: EnrichedEvaluation,
	teacher: { name?: string; role?: string } | null
): EvaluationReadRow {
	return {
		...evaluation,
		_id: evaluation._id.toString(),
		studentId: evaluation.studentId.toString(),
		teacherId: evaluation.teacherId.toString(),
		categoryId: evaluation.categoryId.toString(),
		teacherName: teacher?.name || 'Unknown Teacher',
		isAdmin: teacher?.role === 'admin' || teacher?.role === 'super'
	};
}

function applyFilters(rows: EvaluationReadRow[], filters: EvaluationReadFilters | undefined) {
	if (!filters) return rows;

	let result = rows;
	if (filters.studentFilter?.trim()) {
		result = result.filter((row) => matchesMultiSearch(filters.studentFilter!, row.englishName));
	}
	if (filters.teacherFilter?.trim()) {
		result = result.filter((row) => matchesMultiSearch(filters.teacherFilter!, row.teacherName));
	}
	if (filters.showUnenrolled !== true) {
		result = result.filter((row) => row.status !== 'Not Enrolled');
	}
	return result;
}

async function readDocuments(ctx: ReadContext, request: EvaluationReadRequest) {
	const order = request.sortAscending ? 'asc' : 'desc';

	if (request.scope === 'teacher') {
		const query = request.studentId
			? ctx.db
					.query('evaluations')
					.withIndex('by_studentId_teacherId', (q) =>
						q.eq('studentId', request.studentId!).eq('teacherId', request.teacherId)
					)
			: ctx.db
					.query('evaluations')
					.withIndex('by_teacherId', (q) => q.eq('teacherId', request.teacherId));
		return query.order(order).take(request.limit ?? 200);
	}

	if (request.studentId) {
		return ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', request.studentId!))
			.order(order)
			.take(request.limit ?? 500);
	}

	const query = ctx.db.query('evaluations').withIndex('by_timestamp').order(order);
	if (request.paginationOpts) return query.paginate(request.paginationOpts);
	return query.take(request.limit ?? 500);
}

async function buildRows(ctx: ReadContext, evaluations: EnrichedEvaluation[]) {
	const teacherIds = [...new Set(evaluations.map((evaluation) => evaluation.teacherId))];
	const teachers = await Promise.all(teacherIds.map((id) => ctx.db.get(id)));
	const teacherMap = new Map(teachers.filter(Boolean).map((teacher) => [teacher!._id, teacher!]));
	return evaluations.map((evaluation) =>
		serializeEvaluation(evaluation, teacherMap.get(evaluation.teacherId) ?? null)
	);
}

export async function readEvaluations(
	ctx: ReadContext,
	request: EvaluationReadRequest & { paginationOpts: PaginationOptions }
): Promise<EvaluationReadPage>;
export async function readEvaluations(
	ctx: ReadContext,
	request: EvaluationReadRequest & { paginationOpts?: never }
): Promise<EvaluationReadRow[]>;
export async function readEvaluations(
	ctx: ReadContext,
	request: EvaluationReadRequest
): Promise<EvaluationReadPage | EvaluationReadRow[]> {
	const documents = await readDocuments(ctx, request);
	if ('page' in documents) {
		const enriched = await enrichEvaluations(documents.page, ctx);
		return {
			page: applyFilters(await buildRows(ctx, enriched), request.filters),
			isDone: documents.isDone,
			continueCursor: documents.continueCursor
		};
	}

	const enriched = await enrichEvaluations(documents, ctx);
	const rows = applyFilters(await buildRows(ctx, enriched), request.filters);
	return rows.sort((a, b) =>
		request.sortAscending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
	);
}

export function isEvaluationReadPage(
	result: EvaluationReadPage | EvaluationReadRow[]
): result is EvaluationReadPage {
	return !Array.isArray(result);
}
