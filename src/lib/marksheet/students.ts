// The class on a marksheet: the names the teacher types or pastes, and how the
// marksheet shows a student's row.
//
// Pure functions over the stored shape — no I/O and no reactive state — so the
// rules for reading a pasted name are in one place rather than repeated by
// every surface that takes one.

import { localId, type BreakdownEntry, type StoredStudent } from './document.js';

/** A student's two name parts, as the stored document holds them. */
export interface StudentName {
	firstName: string;
	surname: string;
}

/** What the class can be put in order by. */
export type StudentSortKey = 'firstName' | 'surname';

/**
 * Read one name — typed into the add-student row, or pasted from a class list.
 * A comma means the list writes `Surname, First name`; otherwise the surname is
 * the last word and the first name is everything before it, so `Grace Brewster
 * Hopper` keeps `Grace Brewster` together. A single word is a first name.
 */
export function splitName(cell: string): StudentName {
	const trimmed = cell.trim();
	const comma = trimmed.indexOf(',');
	if (comma !== -1) {
		return {
			surname: trimmed.slice(0, comma).trim(),
			firstName: trimmed.slice(comma + 1).trim()
		};
	}

	const words = trimmed.split(/\s+/);
	if (words.length === 1) return { firstName: words[0], surname: '' };
	return { firstName: words.slice(0, -1).join(' '), surname: words[words.length - 1] };
}

/** A typed or pasted name, or null when it names nobody (blank, or only punctuation). */
export function readName(text: string): StudentName | null {
	const name = splitName(text);
	return studentName(name) === '' ? null : name;
}

/** A new student on this device, unmarked and present. */
export function newStudent(name: StudentName): StoredStudent {
	return { id: localId(), firstName: name.firstName, surname: name.surname, absent: false };
}

/** A student's name as one string: what a heading, a button or a message calls them. */
export function studentName(student: StudentName): string {
	return [student.firstName, student.surname].filter((part) => part !== '').join(' ');
}

/**
 * The class in the order one name part sorts: display order, with the students
 * themselves — and so their marks — untouched. Names of a feather keep the
 * order they were in.
 */
export function sortStudentsByName(
	students: readonly StoredStudent[],
	by: StudentSortKey
): StoredStudent[] {
	return [...students].sort((a, b) => a[by].localeCompare(b[by], 'en', { sensitivity: 'base' }));
}

/** How much of one student's row is filled in: entries they have a mark for, out of all entries. */
export function progressOf(
	studentMarks: Record<string, number> | undefined,
	entries: readonly BreakdownEntry[]
): { marked: number; total: number } {
	return {
		marked: entries.filter((entry) => studentMarks?.[entry.id] !== undefined).length,
		total: entries.length
	};
}
