import { SvelteSet } from 'svelte/reactivity';
import { matchesMultiSearch } from '$convex/shared/evaluation_utils';
import type { Id } from '$convex/_generated/dataModel';

export type PickerStudent = {
	_id: Id<'students'>;
	englishName: string;
	chineseName: string;
	studentId: string;
	classInfo?: {
		grade: number | null;
		class: string | null;
		homeroomTeacherName: string | null;
	} | null;
};

export function gradeLabel(student: PickerStudent): string {
	const info = student.classInfo;
	if (!info) return '';
	return `Grade ${info.grade ?? '?'}${info.class ? `-${info.class}` : ''}${
		info.homeroomTeacherName ? ` (${info.homeroomTeacherName})` : ''
	}`;
}

/**
 * Session-scoped selection state for the StudentPicker. Encapsulated per
 * component instance — not a module singleton, so multiple pickers never share
 * state.
 */
export class StudentPickerState {
	students = $state<PickerStudent[]>([]);
	searchQuery = $state('');
	selectedStudentIds = new SvelteSet<Id<'students'>>();

	matched = $derived(
		this.students.filter((s) => {
			if (!this.searchQuery.trim()) return true;
			return (
				matchesMultiSearch(this.searchQuery, s.englishName) ||
				matchesMultiSearch(this.searchQuery, s.chineseName) ||
				matchesMultiSearch(this.searchQuery, s.studentId)
			);
		})
	);

	selectedStudents = $derived(this.students.filter((s) => this.selectedStudentIds.has(s._id)));

	constructor(initialSelected: Id<'students'>[] = []) {
		for (const id of initialSelected) this.selectedStudentIds.add(id);
	}

	setStudents(list: PickerStudent[]) {
		if (list === this.students) return;
		this.students.length = 0;
		this.students.push(...list);
	}

	/** Smart clear: wipe the search iff nothing unselected remains for the current query. */
	maybeClearSearch() {
		if (!this.searchQuery.trim()) return;
		const unselectedMatches = this.matched.some((s) => !this.selectedStudentIds.has(s._id));
		if (!unselectedMatches) {
			this.searchQuery = '';
		}
	}

	toggle(id: Id<'students'>) {
		if (this.selectedStudentIds.has(id)) {
			this.selectedStudentIds.delete(id);
		} else {
			this.selectedStudentIds.add(id);
		}
		this.maybeClearSearch();
	}

	addAll(ids: Id<'students'>[]) {
		for (const id of ids) this.selectedStudentIds.add(id);
		this.maybeClearSearch();
	}

	remove(id: Id<'students'>) {
		this.selectedStudentIds.delete(id);
	}

	clearAll() {
		this.selectedStudentIds.clear();
	}
}
