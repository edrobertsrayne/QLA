// The class edits that change the students in a document: placing them on a
// tier, removing them and adding them in bulk. Plain functions over a
// `MarksheetDocument`, mutating it in place the way the store's commands do;
// the store commits and saves what they did.

import { emptyPasteResult, type PasteResult } from './paste.js';
import { newNames, newStudent, readName, studentName, type StudentName } from './students.js';
import type { MarksheetDocument, TierIndex } from './document.js';
import type { UndoableChange } from './undo-notice.js';

/**
 * Whether students can be put on `tier`: a tier the assessment has, or no tier
 * on two tiers. Anything else would leave the document in an unreadable shape.
 */
export function isTierTarget(document: MarksheetDocument, tier: TierIndex | null): boolean {
	return tier === null ? document.tiers.length !== 1 : document.tiers[tier] !== undefined;
}

/** Put the students named on one tier (or none). Null when nobody moved. */
export function placeStudents(
	document: MarksheetDocument,
	studentIds: readonly string[],
	tier: TierIndex | null
): UndoableChange | null {
	let moved = 0;
	let movedName: string | null = null;
	for (const student of document.students) {
		if (!studentIds.includes(student.id) || student.tier === tier) continue;
		student.tier = tier;
		moved += 1;
		movedName = studentName(student);
	}
	if (moved === 0) return null;
	return {
		kind: 'student-tier',
		name: moved === 1 && movedName !== null ? movedName : `${moved} students`,
		to: tier
	};
}

/** Remove a student with their marks and report, which could never be read again. */
export function removeStudent(
	document: MarksheetDocument,
	studentId: string
): UndoableChange | null {
	const index = document.students.findIndex((student) => student.id === studentId);
	if (index === -1) return null;
	const [student] = document.students.splice(index, 1);

	delete document.marks[studentId];
	delete document.reports[studentId];
	return { kind: 'student-removal', name: studentName(student) };
}

/** Add a pasted class list with no marks: students on no tier, for the teacher to place. */
export function addUnplacedStudents(
	document: MarksheetDocument,
	rows: readonly (readonly string[])[]
): PasteResult {
	const result = emptyPasteResult();
	for (const row of rows) {
		const name = readName(row[0] ?? '');
		if (name === null) continue;
		document.students.push(newStudent(name, null));
		result.changed = true;
		result.studentsAdded += 1;
	}
	return result;
}

/** Add the students an uploaded class list names, skipping those the class already has. */
export function addUploadedStudents(
	document: MarksheetDocument,
	names: readonly StudentName[],
	tier: TierIndex | null
): PasteResult {
	const { added, skipped } = newNames(document.students, names);
	document.students.push(...added.map((name) => newStudent(name, tier)));
	return {
		...emptyPasteResult(),
		changed: added.length > 0,
		studentsAdded: added.length,
		duplicatesSkipped: skipped
	};
}
