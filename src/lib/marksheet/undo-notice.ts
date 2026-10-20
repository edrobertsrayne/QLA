// What an undo notice says about the change it offers to take back.

import type { MarksheetDocument } from './document.js';
import { studentName } from './students.js';

/**
 * The one change undo would take back, held in memory for the session. The next
 * change clears it, so a second click can never take back two things. Each kind
 * carries the whole document as it was before the change.
 */
export type UndoableChange =
	| {
			kind: 'entry-removal' | 'student-removal';
			/** What the notice calls what went. */
			name: string;
	  }
	| { kind: 'mark-paste' }
	| { kind: 'report-edit'; studentId: string }
	| { kind: 'report-kept'; studentId: string }
	| { kind: 'grade-boundaries'; action: 'saved' | 'removed' };

/** An undoable change with the whole document as it was before it. */
export type Undoable = UndoableChange & { before: MarksheetDocument };

/** What an undo notice says: a verb phrase, then the bolded thing it is about (if any). */
export interface UndoNotice {
	verb: string;
	subject: string | null;
}

/** The notice for an undoable change; null for a paste (the paste notice speaks for it). */
export function undoNotice(undoable: Undoable, document: MarksheetDocument): UndoNotice | null {
	switch (undoable.kind) {
		case 'entry-removal':
			return { verb: 'Deleted', subject: undoable.name };
		case 'student-removal':
			return { verb: 'Removed', subject: undoable.name };
		case 'mark-paste':
			return null;
		case 'grade-boundaries':
			return {
				verb: undoable.action === 'saved' ? 'Grade boundaries saved' : 'Grade boundaries removed',
				subject: null
			};
		case 'report-kept':
			return { verb: 'Kept wording for', subject: nameOrReport(document, undoable.studentId) };
		case 'report-edit':
			return {
				verb: document.reports[undoable.studentId]?.edit !== null ? 'Edited' : 'Reverted',
				subject: nameOrReport(document, undoable.studentId)
			};
	}
}

function nameOrReport(document: MarksheetDocument, studentId: string): string {
	const student = document.students.find((candidate) => candidate.id === studentId);
	const name = student ? studentName(student) : '';
	return name === '' ? 'a report' : name;
}
